// Configurar › Avisos e cobranças (diretor): texto do aviso de candidato de contratação
// (tom de cobrança) + minutos até passar o candidato para o próximo gerente da roleta.
// Grava system_settings.recrutamento_aviso_msg / recrutamento_reassign_min pela RPC
// recrutamento_aviso_salvar (só admin/diretor). O link {link} cai no Funil de Contratação.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export default function AvisoCandidato() {
  const { data, refetch } = useQuery({
    queryKey: ["recrut-aviso"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc("recrutamento_aviso_ler");
      if (error) throw error;
      return data as { msg: string; min: string; link: string };
    },
  });

  const [msg, setMsg] = useState("");
  const [min, setMin] = useState(10);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!data) return;
    setMsg(data.msg || "");
    setMin(Math.max(1, parseInt(data.min || "10", 10) || 10));
  }, [data]);

  async function salvar() {
    setSalvando(true);
    const { error } = await sb.rpc("recrutamento_aviso_salvar", { p_msg: msg, p_min: min });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Aviso de candidato salvo.");
    refetch();
  }

  return (
    <div className="avc">
      <style>{`
        .avc{background:var(--surface,#fff);border:1px solid var(--line,#e2e8f0);border-radius:14px;padding:18px 20px;margin-bottom:22px;color:var(--ink,#0f172a)}
        .avc h3{font:800 16px Archivo,system-ui,sans-serif;margin:0 0 4px}
        .avc p.sub{font-size:13px;color:var(--ink-3,#64748b);margin:0 0 14px;line-height:1.45}
        .avc textarea{width:100%;min-height:128px;resize:vertical;border:1px solid var(--line,#e2e8f0);border-radius:10px;padding:11px 12px;font:14px/1.5 system-ui,sans-serif;background:var(--sunk,#f8fafc);color:var(--ink,#0f172a)}
        .avc .tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
        .avc .tag{font:600 12px ui-monospace,monospace;background:var(--sunk,#eef2f7);border:1px solid var(--line,#e2e8f0);border-radius:999px;padding:3px 9px;cursor:pointer;color:var(--ink-2,#334155)}
        .avc .tag:hover{border-color:var(--acc,#2563eb);color:var(--acc,#2563eb)}
        .avc .linha{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:14px}
        .avc .minbox{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2,#334155)}
        .avc .minbox input{width:66px;border:1px solid var(--line,#e2e8f0);border-radius:8px;padding:7px 9px;font:700 14px system-ui;text-align:center;background:var(--sunk,#f8fafc);color:var(--ink,#0f172a)}
        .avc .link{font:12px ui-monospace,monospace;color:var(--ink-3,#64748b);word-break:break-all;margin-top:10px}
        .avc .salvar{margin-left:auto;background:var(--acc,#2563eb);color:#fff;border:0;border-radius:9px;padding:9px 18px;font:700 14px system-ui;cursor:pointer}
        .avc .salvar:disabled{opacity:.55;cursor:default}
      `}</style>
      <h3>🚨 Aviso de candidato de contratação</h3>
      <p className="sub">
        É a mensagem que o gerente recebe (WhatsApp + sino + app) quando chega um candidato pela sua
        página de contratação. Se o gerente não registrar contato em <b>{min} min</b>, o candidato é
        passado para o próximo gerente da roleta — e você/ele são avisados.
      </p>

      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Texto do aviso…" />

      <div className="tags">
        {["{nome}", "{regiao}", "{tel}", "{min}", "{link}"].map((t) => (
          <button key={t} type="button" className="tag" onClick={() => setMsg((m) => m + (m.endsWith(" ") || !m ? "" : " ") + t)}>{t}</button>
        ))}
      </div>
      <div className="link">O {"{link}"} vira: {data?.link || "…/manager/tropa?modo=contratacao"}</div>

      <div className="linha">
        <label className="minbox">
          Passa para outro gerente após
          <input type="number" min={1} max={120} value={min} onChange={(e) => setMin(Math.max(1, parseInt(e.target.value, 10) || 1))} />
          min
        </label>
        <button type="button" className="salvar" disabled={salvando || !msg.trim()} onClick={salvar}>
          {salvando ? "Salvando…" : "Salvar aviso"}
        </button>
      </div>
    </div>
  );
}
