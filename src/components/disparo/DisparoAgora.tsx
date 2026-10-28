// "Meu disparo agora" (26/10, refeito 28/10): foi? parou? por quê? terminou?
// No topo do Disparar: disparos enviando, agendados, parados nos últimos 3 dias e terminados nas últimas 24 h.
// Os parados há mais de 3 dias ficam num grupo fechado, com "Cancelar todos".
// Contas vêm do servidor (RPC disparo_resumo): somar a lista de contatos na tela dava número errado
// porque o servidor corta em 1.000 linhas. O motivo da parada vem do código de erro da Meta, traduzido.
// Avisos no WhatsApp saem do robô /root/econ/aviso_disparo.py.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

type Camp = {
  id: string; name: string; status: string; audience_count: number; sent_count: number; delivered_count: number;
  read_count: number; reply_count: number; failed_count: number; throttle_per_min: number | null;
  pausa_motivo: string | null; pausada_em: string | null; scheduled_at: string | null; finished_at: string | null;
  created_at: string; wa_config_id: string | null;
};
type Resumo = { pendentes: number; enviados: number; contatos: number; nao_foram: Record<string, number>;
  codigos: { codigo: string; n: number; ultimo: string }[]; ultima_msg: string | null };
type Alvo = { name: string | null; phone: string; status: string; error: string | null };

// Códigos de erro da Meta (Cloud API) → o que aconteceu e o que fazer, em português
const META: Record<string, { o: string; f: string }> = {
  "131048": { o: "a Meta limitou o envio deste número porque muita gente bloqueou ou denunciou as mensagens (spam)",
              f: "Espere pelo menos 24 horas. Depois dispare para menos gente e só para quem já é cliente ou pediu contato." },
  "131031": { o: "a Meta bloqueou a conta deste número", f: "Nada sai até a Meta liberar. Veja o aviso no Gerenciador do WhatsApp (business.facebook.com/wa/manage)." },
  "132015": { o: "a Meta pausou o modelo de mensagem usado, porque muita gente reclamou dele", f: "Use outro modelo de mensagem." },
  "132016": { o: "a Meta desativou o modelo de mensagem usado", f: "Use outro modelo de mensagem." },
  "132001": { o: "o modelo de mensagem não existe na conta deste número", f: "Escolha um modelo aprovado deste número." },
  "131026": { o: "alguns números não recebem mensagem de empresa", f: "Normal em listas: são números sem WhatsApp ou que bloquearam." },
  "130472": { o: "a Meta segurou mensagens para alguns números por um teste interno dela", f: "Não é erro seu." },
  "131049": { o: "a Meta segurou mensagens de marketing para quem já recebeu muitas", f: "Tente de novo outro dia." },
  "131056": { o: "foram mensagens demais para a mesma pessoa em pouco tempo", f: "Espere antes de mandar de novo." },
};

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
const diaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const ROT_ALVO: Record<string, string> = { pending: "na fila", sent: "enviada", failed: "não foi", skipped: "pulada", canceled: "cancelada" };
const TRES_DIAS = 3 * 864e5;

function previsao(falta: number, ritmo: number) {
  const porMin = Math.max(1, Math.min(ritmo || 10, 40)) / 2;
  const fim = new Date(Date.now() + (falta / porMin) * 60_000);
  const sp = new Date(fim.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  if (sp.getHours() * 60 + sp.getMinutes() > 19 * 60 + 30 || fim.toDateString() !== new Date().toDateString())
    return "o que não sair até 19h30 continua amanhã às 8h";
  return `termina por volta das ${hora(fim.toISOString())}`;
}

function porQueParou(c: Camp, r?: Resumo): { o: string; f: string } {
  if (c.pausa_motivo === "pausado por você") return { o: "você pausou", f: "Toque em Retomar quando quiser continuar." };
  const cod = r?.codigos?.[0]?.codigo;
  if (cod && META[cod]) return META[cod];
  if (c.pausa_motivo) return { o: c.pausa_motivo, f: "Confira os contatos que não receberam antes de retomar." };
  return { o: "o motivo não foi registrado (o disparo é de antes de 26/10)", f: "Se não vai mais usar, cancele." };
}

export default function DisparoAgora({ userId }: { userId: string | null | undefined }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verAntigos, setVerAntigos] = useState(false);

  const { data } = useQuery({
    queryKey: ["disparo-agora", userId], enabled: !!userId, refetchInterval: 20_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data: camps } = await sb.from("whatsapp_campaigns")
        .select("id,name,status,audience_count,sent_count,delivered_count,read_count,reply_count,failed_count,throttle_per_min,pausa_motivo,pausada_em,scheduled_at,finished_at,created_at,wa_config_id")
        .or(`owner_id.eq.${userId},created_by.eq.${userId}`)
        .or(`status.in.(sending,paused,scheduled),created_at.gte.${desde}`)
        .neq("status", "draft")
        .order("created_at", { ascending: false }).limit(40);
      const lista = (camps ?? []) as Camp[];
      const ids = lista.map((c) => c.id);
      const { data: res } = ids.length ? await sb.rpc("disparo_resumo", { p_ids: ids }) : { data: {} };
      const cfgIds = [...new Set(lista.map((c) => c.wa_config_id).filter(Boolean))];
      const { data: cfgs } = cfgIds.length ? await sb.from("whatsapp_config").select("id,label,display_number").in("id", cfgIds) : { data: [] };
      return { camps: lista, res: (res ?? {}) as Record<string, Resumo>, cfgs: new Map(((cfgs ?? []) as any[]).map((c) => [c.id, c])) };
    },
  });
  const { data: alvos = [] } = useQuery<Alvo[]>({
    queryKey: ["disparo-contatos", aberto], enabled: !!aberto,
    queryFn: async () => {
      const { data } = await sb.from("whatsapp_campaign_targets").select("name,phone,status,error").eq("campaign_id", aberto).order("status").limit(500);
      return (data ?? []) as Alvo[];
    },
  });

  if (!data?.camps.length) return null;

  const quando = (c: Camp) => new Date(c.pausada_em || data.res[c.id]?.ultima_msg || c.created_at).getTime();
  const antigo = (c: Camp) => c.status === "paused" && Date.now() - quando(c) > TRES_DIAS;
  const recentes = data.camps.filter((c) => !antigo(c));
  const antigos = data.camps.filter(antigo);

  const agir = async (fn: string, args: Record<string, unknown>, ok: string, chave: string) => {
    setOcupado(chave);
    try {
      const { error } = await sb.rpc(fn, args);
      if (error) throw error;
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ["disparo-agora"] });
    } catch (e: any) { toast.error(e?.details || e?.message || "Não consegui agora. Tente de novo."); }
    finally { setOcupado(null); }
  };

  const cartao = (c: Camp) => {
    const r = data.res[c.id];
    const total = c.audience_count || r?.contatos || 0;
    const falta = r?.pendentes ?? 0;
    const cfg: any = c.wa_config_id ? data.cfgs.get(c.wa_config_id) : null;
    const pausaSistema = c.status === "paused" && c.pausa_motivo !== "pausado por você";
    const motivo = c.status === "paused" ? porQueParou(c, r) : null;
    const naoForam = { ...(r?.nao_foram ?? {}) };
    const recusadasDepois = c.failed_count - Object.entries(naoForam).filter(([k]) => k !== "pulada").reduce((s, [, n]) => s + n, 0);
    if (recusadasDepois > 0) naoForam["recusadas pela Meta depois de sair"] = recusadasDepois;
    const tom = c.status === "sending" ? { cor: "#059669", fundo: "#ecfdf5", rot: "🟢 Enviando" }
      : pausaSistema ? { cor: "#c2410c", fundo: "#fff7ed", rot: "🟠 Parou sozinho" }
      : c.status === "paused" ? { cor: "#475569", fundo: "#f1f5f9", rot: "⏸️ Pausado por você" }
      : c.status === "scheduled" ? { cor: "#1d4ed8", fundo: "#eff6ff", rot: "🕒 Agendado" }
      : c.status === "canceled" ? { cor: "#475569", fundo: "#f1f5f9", rot: "✖️ Cancelado" }
      : { cor: "#0f766e", fundo: "#f0fdfa", rot: "✅ Concluído" };
    const pct = total ? Math.round(((total - falta) / total) * 100) : 0;
    const quandoParou = c.pausada_em || r?.ultima_msg;

    return (
      <div key={c.id} style={{ border: `1px solid ${tom.cor}33`, background: tom.fundo, borderRadius: 12, padding: "14px 16px", color: "#0f172a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <span style={{ fontWeight: 800, color: tom.cor }}>{tom.rot}</span>
            <span style={{ marginLeft: 8, fontWeight: 700 }}>{c.name}</span>
            {cfg ? <span style={{ marginLeft: 8, fontSize: 12, color: "#64748b" }}>número {cfg.display_number ?? cfg.label}</span> : null}
          </div>
          <span style={{ fontSize: 12, color: "#64748b" }}>criado {diaHora(c.created_at)}</span>
        </div>
        <div style={{ fontSize: 14, marginTop: 6 }}>
          {c.status === "sending" ? <>Saíram <b>{c.sent_count}</b> de <b>{total}</b> · {falta} na fila · {previsao(falta, c.throttle_per_min ?? 10)}. Envio só das 8h às 19h30.</>
            : c.status === "paused" ? <>{quandoParou ? `Parou em ${diaHora(quandoParou)}. ` : "Parou. "}Saíram <b>{c.sent_count}</b> de {total}{falta ? <>; <b>{falta} não foram enviadas</b> e estão esperando</> : ""}.</>
            : c.status === "scheduled" ? <>Sai em {diaHora(c.scheduled_at)} para {total} contatos.</>
            : c.status === "canceled" ? <>Cancelado. Saíram {c.sent_count} de {total}.</>
            : <>Terminou às {hora(c.finished_at)}. Enviadas <b>{c.sent_count}</b> de {total} · entregues <b>{c.delivered_count}</b> · lidas <b>{c.read_count}</b> · responderam <b>{c.reply_count}</b>.</>}
        </div>
        {motivo ? (
          <div style={{ fontSize: 13.5, marginTop: 6, color: "#7c2d12" }}>
            <b>Por quê:</b> {motivo.o}. <b>O que fazer:</b> {motivo.f}
          </div>
        ) : null}
        {c.status === "sending" || c.status === "paused" ? (
          <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, marginTop: 10, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: tom.cor }} />
          </div>
        ) : null}
        {Object.keys(naoForam).length ? (
          <div style={{ fontSize: 12.5, marginTop: 8, color: "#475569" }}>
            Não receberam: {Object.entries(naoForam).map(([m, n]) => `${n} ${m}`).join(" · ")}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {c.status === "paused" ? (
            <button className="dsp-btn prim" disabled={ocupado === c.id} onClick={() => agir("disparo_retomar", { p_id: c.id }, "Retomado. As mensagens voltam a sair na próxima rodada (até 2 min).", c.id)}>Retomar</button>
          ) : null}
          {c.status === "sending" ? (
            <button className="dsp-btn" disabled={ocupado === c.id} onClick={() => agir("disparo_pausar", { p_id: c.id }, "Pausado. Nada mais sai até você retomar.", c.id)}>Pausar</button>
          ) : null}
          {["sending", "paused", "scheduled"].includes(c.status) ? (
            <button className="dsp-btn" disabled={ocupado === c.id} onClick={() => agir("disparo_cancelar", { p_id: c.id }, "Cancelado. Quem estava na fila não vai receber.", c.id)}>Cancelar</button>
          ) : null}
          {r?.contatos ? (
            <button className="dsp-btn" onClick={() => setAberto(aberto === c.id ? null : c.id)}>
              {aberto === c.id ? "Esconder contatos" : `Ver contatos (${r.contatos})`}
            </button>
          ) : null}
        </div>
        {aberto === c.id ? (
          <div style={{ maxHeight: 280, overflow: "auto", marginTop: 10, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            {(r?.contatos ?? 0) > 500 ? <div style={{ fontSize: 12, color: "#64748b", padding: "6px 8px" }}>Mostrando 500 de {r?.contatos}.</div> : null}
            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
              <tbody>
                {alvos.map((a, i) => (
                  <tr key={i} style={{ borderTop: i ? "1px solid #f1f5f9" : undefined }}>
                    <td style={{ padding: "5px 8px" }}>{a.name || "—"}</td>
                    <td style={{ padding: "5px 8px", fontFamily: "JetBrains Mono, monospace" }}>{a.phone}</td>
                    <td style={{ padding: "5px 8px", fontWeight: 600, color: a.status === "sent" ? "#059669" : a.status === "pending" ? "#64748b" : "#c2410c" }}>
                      {ROT_ALVO[a.status] ?? a.status}{a.error ? ` · ${a.error}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
      <style>{`.dsp-btn{font-size:13px;font-weight:600;padding:7px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;cursor:pointer}
.dsp-btn.prim{background:#1d4ed8;border-color:#1d4ed8;color:#fff}.dsp-btn:disabled{opacity:.5;cursor:default}`}</style>
      {recentes.map(cartao)}
      {antigos.length ? (
        <div style={{ border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 12, padding: "12px 16px", color: "#0f172a" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <span><b>{antigos.length} disparo{antigos.length > 1 ? "s" : ""} parado{antigos.length > 1 ? "s" : ""} há mais de 3 dias.</b>{" "}
              <span style={{ color: "#64748b", fontSize: 13 }}>Se não vai usar, cancele para limpar a lista.</span></span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="dsp-btn" onClick={() => setVerAntigos((v) => !v)}>{verAntigos ? "Esconder" : "Ver quais"}</button>
              <button className="dsp-btn" disabled={ocupado === "antigos"}
                onClick={() => agir("disparo_cancelar_antigos", { p_ids: antigos.map((c) => c.id) }, `${antigos.length} disparo(s) antigo(s) cancelado(s).`, "antigos")}>Cancelar todos</button>
            </span>
          </div>
          {verAntigos ? <div style={{ display: "grid", gap: 10, marginTop: 10 }}>{antigos.map(cartao)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
