/* Agendar visita com dia, hora e local (29/10, mockup aprovado pelo Junior: https://claude.ai/artifact/BEbxPA8Vq3qa4xwp8G95NY).
 * Grava leads.visit_scheduled_at + visita_local e muda a etapa para "Visita". É isso que alimenta a "Agenda da equipe"
 * do gerente/super/diretor (RPC agenda_equipe). Horário já ocupado por outra visita do corretor aparece riscado.
 * Nada é enviado ao cliente: o lembrete é com o corretor.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;
const HORAS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
const SEM = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hojeSP = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

const CSS = `.av-sheet{width:min(440px,94vw);max-height:92vh;overflow:auto;background:var(--card,#fff);color:var(--ink,#0f1b2d);border-radius:18px;padding:18px 16px;display:grid;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.av-t{font-size:17px;font-weight:800;margin:0}.av-s{font-size:13px;color:var(--ink-3,#64748b);margin:2px 0 0}
.av-l{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3,#64748b);margin-bottom:6px}
.av-c{display:flex;gap:6px;flex-wrap:wrap}
.av-c button{font:inherit;font-size:13px;font-weight:700;border:1px solid var(--line,#e2e8f0);background:var(--card,#fff);color:inherit;border-radius:10px;padding:7px 10px;cursor:pointer}
.av-c button.on{background:#0e7c7b;border-color:#0e7c7b;color:#fff}
.av-c button:disabled{opacity:.45;text-decoration:line-through;cursor:not-allowed}
.av-c input{font:inherit;font-size:13px;border:1px solid var(--line,#e2e8f0);border-radius:10px;padding:6px 8px;background:var(--card,#fff);color:inherit}
.av-go{font:inherit;width:100%;border:0;border-radius:12px;padding:12px;background:#0f1b2d;color:#fff;font-weight:800;font-size:15px;cursor:pointer}
.av-go:disabled{opacity:.5;cursor:default}
.av-x{font:inherit;border:0;background:none;color:var(--ink-3,#64748b);font-weight:700;cursor:pointer;padding:6px}`;

export default function AgendarVisita({ leadId, nome, brokerId, onFechar, onFeito }: {
  leadId: string; nome: string | null; brokerId: string; onFechar: () => void; onFeito: (resumo: string) => void;
}) {
  const dias = useMemo(() => {
    const h = hojeSP();
    return Array.from({ length: 6 }, (_, i) => { const d = new Date(h.getTime() + i * 864e5); return { v: ymd(d), r: i === 0 ? "Hoje" : i === 1 ? "Amanhã" : `${SEM[d.getDay()]} ${d.getDate()}` }; });
  }, []);
  const [dia, setDia] = useState(dias[0].v);
  const [outroDia, setOutroDia] = useState(false);
  const [hora, setHora] = useState<string | null>(null);
  const [outraHora, setOutraHora] = useState("");
  const [local, setLocal] = useState("");
  const [salvando, setSalvando] = useState(false);

  // visitas que o corretor já tem no dia escolhido (riscadas) e os locais que ele costuma usar
  const { data: ocupadas } = useQuery({
    queryKey: ["av-ocupadas", brokerId, dia],
    queryFn: async () => {
      const de = new Date(`${dia}T00:00:00-03:00`).toISOString(), ate = new Date(`${dia}T23:59:59-03:00`).toISOString();
      const { data } = await sb.from("leads").select("id,visit_scheduled_at").eq("broker_id", brokerId).gte("visit_scheduled_at", de).lte("visit_scheduled_at", ate);
      return ((data ?? []) as { id: string; visit_scheduled_at: string }[]).filter((x) => x.id !== leadId)
        .map((x) => new Date(x.visit_scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }));
    },
  });
  const { data: locais } = useQuery({
    queryKey: ["av-locais", brokerId],
    queryFn: async () => {
      const { data } = await sb.from("leads").select("visita_local").eq("broker_id", brokerId).not("visita_local", "is", null).order("visit_scheduled_at", { ascending: false }).limit(40);
      return [...new Set(((data ?? []) as { visita_local: string }[]).map((x) => x.visita_local.trim()).filter(Boolean))].slice(0, 4);
    },
    staleTime: 10 * 60_000,
  });

  const h = hora === "outra" ? outraHora : hora;
  const agora = hojeSP();
  const passou = (hh: string) => dia === ymd(agora) && hh <= `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  const rotDia = dias.find((d) => d.v === dia)?.r ?? new Date(`${dia}T12:00:00-03:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  const salvar = async () => {
    if (!h) { toast.error("Escolha a hora da visita."); return; }
    setSalvando(true);
    try {
      const quando = new Date(`${dia}T${h}:00-03:00`).toISOString();
      const { error } = await sb.from("leads").update({
        status: "VISIT_SCHEDULED", visit_scheduled_at: quando, visita_local: local.trim() || null, visita_confirmada: false,
        visit_vespera_sent_at: null, visit_dia_sent_at: null, last_interaction_at: new Date().toISOString(),
      }).eq("id", leadId);
      if (error) throw error;
      onFeito(`${rotDia.toLowerCase()}, ${h}${local.trim() ? ` · ${local.trim()}` : ""}`);
    } catch { toast.error("Não consegui agendar agora. Tente de novo."); }
    finally { setSalvando(false); }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }} role="dialog" aria-modal="true" aria-labelledby="av-t">
      <style>{CSS}</style>
      <div className="av-sheet">
        <div><p className="av-t" id="av-t">Agendar visita</p><p className="av-s">{nome ?? "Cliente"}</p></div>
        <div><div className="av-l">Dia</div><div className="av-c">
          {dias.map((d) => <button key={d.v} type="button" className={!outroDia && dia === d.v ? "on" : ""} onClick={() => { setOutroDia(false); setDia(d.v); }}>{d.r}</button>)}
          <button type="button" className={outroDia ? "on" : ""} onClick={() => setOutroDia(true)}>Outro…</button>
          {outroDia ? <input type="date" aria-label="Outro dia" min={dias[0].v} value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} /> : null}
        </div></div>
        <div><div className="av-l">Hora</div><div className="av-c">
          {HORAS.map((x) => <button key={x} type="button" disabled={(ocupadas ?? []).includes(x) || passou(x)} className={hora === x ? "on" : ""} onClick={() => setHora(x)}
            title={(ocupadas ?? []).includes(x) ? "Você já tem visita nesse horário" : undefined}>{x}</button>)}
          <button type="button" className={hora === "outra" ? "on" : ""} onClick={() => setHora("outra")}>Outra…</button>
          {hora === "outra" ? <input type="time" aria-label="Outra hora" value={outraHora} onChange={(e) => setOutraHora(e.target.value)} /> : null}
        </div></div>
        <div><div className="av-l">Onde</div><div className="av-c">
          {(locais ?? []).map((x) => <button key={x} type="button" className={local === x ? "on" : ""} onClick={() => setLocal(x)}>{x}</button>)}
          <input type="text" aria-label="Local da visita" placeholder="Stand, decorado, endereço…" value={local} onChange={(e) => setLocal(e.target.value)} style={{ flex: "1 1 180px" }} />
        </div></div>
        <button type="button" className="av-go" disabled={salvando || !h} onClick={salvar}>{h ? `Agendar para ${rotDia.toLowerCase()}, ${h}` : "Escolha a hora"}</button>
        <button type="button" className="av-x" onClick={onFechar}>Cancelar</button>
      </div>
    </div>
  );
}
