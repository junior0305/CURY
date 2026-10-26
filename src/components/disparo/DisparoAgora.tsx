// "Meu disparo agora" (26/10, pedido do Junior): a dúvida de todo mundo era "foi? parou? terminou?".
// Mostra, no topo do Disparar, cada disparo ativo ou das últimas 24 h em português: enviando (x de N, previsão),
// pausado pelo sistema (motivo + o que fazer + Retomar), pausado por você, agendado, concluído —
// e quem não recebeu, por motivo. Os avisos no WhatsApp saem do robô /root/econ/aviso_disparo.py.
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
type Alvo = { campaign_id: string; name: string | null; phone: string; status: string; error: string | null };

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
const diaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

function previsao(falta: number, ritmo: number) {
  // o robô roda a cada 2 min e manda até `ritmo` por rodada (mín. 1, máx. 40)
  const porMin = Math.max(1, Math.min(ritmo || 10, 40)) / 2;
  const fim = new Date(Date.now() + (falta / porMin) * 60_000);
  const sp = new Date(fim.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  if (sp.getHours() * 60 + sp.getMinutes() > 19 * 60 + 30 || fim.toDateString() !== new Date().toDateString())
    return "o que não sair até 19h30 continua amanhã às 8h";
  return `termina por volta das ${hora(fim.toISOString())}`;
}

const ROT_ALVO: Record<string, string> = { pending: "na fila", sent: "enviada", failed: "não foi", skipped: "pulada", canceled: "cancelada" };

export default function DisparoAgora({ userId }: { userId: string | null | undefined }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["disparo-agora", userId], enabled: !!userId, refetchInterval: 20_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data: camps } = await sb.from("whatsapp_campaigns")
        .select("id,name,status,audience_count,sent_count,delivered_count,read_count,reply_count,failed_count,throttle_per_min,pausa_motivo,pausada_em,scheduled_at,finished_at,created_at,wa_config_id")
        .or(`owner_id.eq.${userId},created_by.eq.${userId}`)
        .or(`status.in.(sending,paused,scheduled),created_at.gte.${desde}`)
        .neq("status", "draft")
        .order("created_at", { ascending: false }).limit(5);
      const lista = (camps ?? []) as Camp[];
      const ids = lista.map((c) => c.id);
      const { data: alvos } = ids.length
        ? await sb.from("whatsapp_campaign_targets").select("campaign_id,name,phone,status,error").in("campaign_id", ids).limit(5000)
        : { data: [] };
      const cfgIds = [...new Set(lista.map((c) => c.wa_config_id).filter(Boolean))];
      const { data: cfgs } = cfgIds.length
        ? await sb.from("whatsapp_config").select("id,label,display_number,bloqueada_em").in("id", cfgIds)
        : { data: [] };
      return { camps: lista, alvos: (alvos ?? []) as Alvo[], cfgs: new Map(((cfgs ?? []) as any[]).map((c) => [c.id, c])) };
    },
  });

  if (!data?.camps.length) return null;

  const agir = async (fn: "disparo_retomar" | "disparo_pausar" | "disparo_cancelar", id: string, ok: string) => {
    setOcupado(id);
    try {
      const { error } = await sb.rpc(fn, { p_id: id });
      if (error) throw error;
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ["disparo-agora"] });
    } catch (e: any) { toast.error(e?.details || e?.message || "Não consegui agora. Tente de novo."); }
    finally { setOcupado(null); }
  };

  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
      <style>{`.dsp-btn{font-size:13px;font-weight:600;padding:7px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;cursor:pointer}
.dsp-btn.prim{background:#1d4ed8;border-color:#1d4ed8;color:#fff}.dsp-btn:disabled{opacity:.5;cursor:default}`}</style>
      {data.camps.map((c) => {
        const meus = data.alvos.filter((a) => a.campaign_id === c.id);
        const conta = (st: string) => meus.filter((a) => a.status === st).length;
        const total = c.audience_count || meus.length;
        const falta = conta("pending");
        const saiu = c.sent_count;
        const cfg: any = c.wa_config_id ? data.cfgs.get(c.wa_config_id) : null;
        const porMotivo = new Map<string, number>();
        meus.filter((a) => a.status === "failed" || a.status === "skipped").forEach((a) => {
          const m = a.error || (a.status === "skipped" ? "pulada" : "erro da Meta");
          porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
        });
        if (c.failed_count > conta("failed")) porMotivo.set("recusadas pela Meta depois de sair", c.failed_count - conta("failed"));
        const pausaSistema = c.status === "paused" && c.pausa_motivo !== "pausado por você";
        const ehBloqueio = /bloque/i.test(c.pausa_motivo ?? "");

        const tom = c.status === "sending" ? { cor: "#059669", fundo: "#ecfdf5", rot: "🟢 Enviando" }
          : pausaSistema ? { cor: "#c2410c", fundo: "#fff7ed", rot: "🟠 Parou sozinho" }
          : c.status === "paused" ? { cor: "#475569", fundo: "#f1f5f9", rot: "⏸️ Pausado por você" }
          : c.status === "scheduled" ? { cor: "#1d4ed8", fundo: "#eff6ff", rot: "🕒 Agendado" }
          : c.status === "canceled" ? { cor: "#475569", fundo: "#f1f5f9", rot: "✖️ Cancelado" }
          : { cor: "#0f766e", fundo: "#f0fdfa", rot: "✅ Concluído" };
        const pct = total ? Math.round(((total - falta) / total) * 100) : 0;

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
              {c.status === "sending" ? <>Saíram <b>{saiu}</b> de <b>{total}</b> · {falta} na fila · {previsao(falta, c.throttle_per_min ?? 10)}. Envio só das 8h às 19h30.</>
                : pausaSistema ? <>Parou às {hora(c.pausada_em)}: <b>{c.pausa_motivo}</b>. Saíram {saiu} de {total}; <b>{falta} estão esperando</b> (não foram enviadas, não se perdem).</>
                : c.status === "paused" ? <>Você pausou às {hora(c.pausada_em)}. Saíram {saiu} de {total}; {falta} esperando.</>
                : c.status === "scheduled" ? <>Sai em {diaHora(c.scheduled_at)} para {total} contatos.</>
                : c.status === "canceled" ? <>Cancelado. Saíram {saiu} de {total}.</>
                : <>Terminou às {hora(c.finished_at)}. Enviadas <b>{saiu}</b> de {total} · entregues <b>{c.delivered_count}</b> · lidas <b>{c.read_count}</b> · responderam <b>{c.reply_count}</b>.</>}
            </div>

            {pausaSistema ? (
              <div style={{ fontSize: 13, marginTop: 6, color: "#7c2d12" }}>
                {ehBloqueio
                  ? <>O que fazer: a Meta bloqueou a conta desse número e nada sai até ela liberar. Abra o <a href="https://business.facebook.com/wa/manage" target="_blank" rel="noreferrer" style={{ color: "#7c2d12", fontWeight: 700 }}>Gerenciador do WhatsApp</a>, veja o aviso da conta e resolva lá. Depois toque em Retomar — se a Meta ainda recusar, ele para de novo sozinho.</>
                  : <>O que fazer: muitas mensagens voltaram com erro da Meta. Confira abaixo quem não recebeu antes de retomar.</>}
              </div>
            ) : null}

            {c.status === "sending" || c.status === "paused" ? (
              <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, marginTop: 10, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: tom.cor }} />
              </div>
            ) : null}

            {porMotivo.size ? (
              <div style={{ fontSize: 12.5, marginTop: 8, color: "#475569" }}>
                Não receberam: {[...porMotivo.entries()].map(([m, n]) => `${n} ${m}`).join(" · ")}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {c.status === "paused" ? (
                <button className="dsp-btn prim" disabled={ocupado === c.id} onClick={() => agir("disparo_retomar", c.id, "Retomado. As mensagens voltam a sair na próxima rodada (até 2 min).")}>Retomar</button>
              ) : null}
              {c.status === "sending" ? (
                <button className="dsp-btn" disabled={ocupado === c.id} onClick={() => agir("disparo_pausar", c.id, "Pausado. Nada mais sai até você retomar.")}>Pausar</button>
              ) : null}
              {["sending", "paused", "scheduled"].includes(c.status) ? (
                <button className="dsp-btn" disabled={ocupado === c.id} onClick={() => agir("disparo_cancelar", c.id, "Cancelado. Quem estava na fila não vai receber.")}>Cancelar</button>
              ) : null}
              <button className="dsp-btn" onClick={() => setAberto(aberto === c.id ? null : c.id)}>
                {aberto === c.id ? "Esconder contatos" : `Ver contatos (${meus.length})`}
              </button>
            </div>

            {aberto === c.id ? (
              <div style={{ maxHeight: 280, overflow: "auto", marginTop: 10, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                  <tbody>
                    {meus.slice(0, 500).map((a, i) => (
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
      })}
    </div>
  );
}
