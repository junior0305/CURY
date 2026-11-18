/**
 * DiscadorSessao — aba "Discador" do dashboard do corretor.
 *
 * Power dialer: a fila dos leads do corretor, botão de discagem por lead, e a sessão
 * automática (liga um atrás do outro). Usa o DiscadorProvider (widget flutuante + modal
 * pós-chamada) com o WebRTCDialerEngine (SIP.js → wss://app.nvoip.com.br:7443).
 *
 * A credencial SIP vem da edge `discador-sip-config` (nunca no front).
 */
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { registerContactAttempt, updateLeadStatus } from "@/integrations/supabase/leads";
import type { Lead } from "@/types/lead";
import { DiscadorProvider, BotaoDiscar, useDiscador, type CallTarget } from "@/components/discador/DiscadorWidget";
import { WebRTCDialerEngine, type SipConfig } from "@/components/discador/WebRTCDialerEngine";
import "@/styles/discador-sessao.css";

const soDig = (s?: string) => (s || "").replace(/\D/g, "");
const fmtFone = (t?: string) => { const d = soDig(t).replace(/^55/, ""); return d.length === 11 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}` : (t || ""); };
const ini = (n?: string) => (n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
const ATIVOS = new Set(["NEW", "IN_PROGRESS", "NEGOTIATING", "VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED", "REACTIVATED"]);

// busca a config SIP do corretor logado na nossa edge (seguro: senha não fica no front)
async function getSipConfig(): Promise<SipConfig> {
  const { data, error } = await supabase.functions.invoke("discador-sip-config", { body: {} });
  if (error || !data?.server) throw new Error(data?.error || "sem_config_sip");
  return data as SipConfig;
}

export default function DiscadorSessao({ leads }: { leads: Lead[] }) {
  const engine = useMemo(() => new WebRTCDialerEngine(getSipConfig), []);
  const fila = useMemo(
    () => leads.filter((l) => soDig(l.phone).length >= 10 && ATIVOS.has(String(l.status))),
    [leads],
  );
  async function salvarResultado(r: { target: CallTarget; desfecho: string; observacao: string; duracao: number }) {
    if (r.target.id === "avulso") return; // ligação avulsa não é lead
    try {
      await registerContactAttempt(r.target.id, "Ligação");
      const nota = `📞 Ligação (${r.duracao}s) · ${LABEL_DESFECHO[r.desfecho] || r.desfecho}${r.observacao ? " · " + r.observacao : ""}`;
      await supabase.from("lead_notes").insert({ lead_id: r.target.id, content: nota });
      if (r.desfecho === "agendou") await updateLeadStatus(r.target.id, "VISIT_SCHEDULED");
    } catch (e) { /* não trava a sessão */ }
  }

  return (
    <DiscadorProvider engine={engine} onResultado={salvarResultado}>
      <Conteudo fila={fila} />
    </DiscadorProvider>
  );
}

const LABEL_DESFECHO: Record<string, string> = {
  interesse: "Atendeu com interesse", agendou: "Agendou visita", caixa: "Caixa postal", sem_interesse: "Sem interesse",
};

function Conteudo({ fila }: { fila: Lead[] }) {
  const { status, discar, target } = useDiscador();
  const [num, setNum] = useState("");
  const feitos = useRef<Set<string>>(new Set()).current;
  const emChamada = status !== "idle" && status !== "ended";

  const restam = fila.filter((l) => !feitos.has(l.id));
  const alvo = (l: Lead): CallTarget => ({
    id: l.id, nome: l.name, telefone: l.phone,
    sub: [l.regiao_interesse, (l as any).campanha_nome].filter(Boolean).join(" · "),
  });

  function discarLead(l: Lead) { feitos.add(l.id); discar(alvo(l)); }

  return (
    <div className="dsc-sessao">
      {/* ritmo da sessão */}
      <div className="dsc-bar">
        <div><b>{feitos.size}</b><span>discadas</span></div>
        <div><b>{fila.length - feitos.size}</b><span>na fila</span></div>
        <button className={"dsc-start" + (emChamada ? " off" : "")} disabled={emChamada || !restam.length}
          onClick={() => { const prox = restam[0]; if (prox) discarLead(prox); }}>
          {emChamada ? "Em ligação…" : "▶ Discar o próximo"}
        </button>
      </div>

      {/* ligar um número avulso (teste / ligação direta) */}
      <div className="dsc-avulso">
        <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="Ligar um número (com DDD)" inputMode="tel" />
        <button disabled={emChamada || soDig(num).length < 10}
          onClick={() => discar({ id: "avulso", nome: "Ligação avulsa", telefone: num })}>Ligar</button>
      </div>

      {!fila.length ? (
        <div className="dsc-vazio">Nenhum cliente com telefone pra ligar agora. Puxe leads no <b>Pescar</b> ou cadastre em <b>Clientes</b>.</div>
      ) : (
        <div className="dsc-fila">
          {fila.map((l) => {
            const feito = feitos.has(l.id);
            const naLinha = emChamada && target?.id === l.id;
            return (
              <div key={l.id} className={"dsc-item" + (naLinha ? " ativo" : feito ? " feito" : "")}>
                <span className="dsc-av">{ini(l.name)}</span>
                <div className="dsc-info">
                  <b>{l.name}</b>
                  <span>{fmtFone(l.phone)}{l.regiao_interesse ? " · " + l.regiao_interesse : ""}</span>
                </div>
                {naLinha ? <span className="dsc-badge live">na linha</span>
                  : feito ? <span className="dsc-badge ok">feito</span>
                  : <BotaoDiscar target={alvo(l)} />}
              </div>
            );
          })}
        </div>
      )}
      <p className="dsc-hint">Fala pelo navegador (permita o microfone). Ao desligar, marque como foi — vira nota no cliente e conta no seu placar.</p>
    </div>
  );
}
