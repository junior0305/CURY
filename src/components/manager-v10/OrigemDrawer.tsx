/* Abre um card de origem e mostra os leads um a um: corretor, em que pé está
 * (boas-vindas automática, primeiro toque do corretor, parado…), um botão de
 * cobrar o corretor, e — quando permitido — o olho para espiar a conversa.
 *
 * O gerente não trabalha o lead aqui: ele cobra quem tem que trabalhar. Por
 * isso a ação principal de cada linha é "Cobrar", não "atender". */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useConversaLead, cobrarCorretor,
         type LeadDetalhe, type Situacao } from "@/hooks/useLeads";

const SITUACAO: Record<Situacao, { rot: string; tom: string; dica: string }> = {
  esperando:      { rot: "Cliente esperando", tom: "hot",
                    dica: "O cliente respondeu e o corretor ainda não voltou. É o mais urgente." },
  parado:         { rot: "Parado", tom: "warn",
                    dica: "Ninguém falou com o lead ainda — nem o robô, nem o corretor." },
  boas_vindas:    { rot: "Só boas-vindas", tom: "info",
                    dica: "O sistema mandou a mensagem de boas-vindas sozinho. O corretor ainda não deu o primeiro toque." },
  primeiro_toque: { rot: "Corretor tocou", tom: "ok",
                    dica: "O corretor já mandou a primeira mensagem. O cliente ainda não respondeu." },
  conversando:    { rot: "Conversando", tom: "ok",
                    dica: "Os dois estão trocando mensagem. Está andando." },
};

function Olho() {
  return (<svg viewBox="0 0 24 24" width="16" height="16" fill="none"
    stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>
    <circle cx="12" cy="12" r="3"/></svg>);
}

export default function OrigemDrawer({
  titulo, leads, verConversa, quem, onFechar,
}: {
  titulo: string; leads: LeadDetalhe[]; verConversa: boolean;
  quem: string; onFechar: () => void;
}) {
  const qc = useQueryClient();
  const [espiando, setEspiando] = useState<LeadDetalhe | null>(null);
  const [cobrando, setCobrando] = useState<string | null>(null);
  const { data: msgs, isLoading: carregandoMsgs } = useConversaLead(espiando?.id ?? null);

  async function cobrar(l: LeadDetalhe) {
    setCobrando(l.id);
    try {
      const r = await cobrarCorretor(l.id, quem);
      toast.success(r.avisado_no_whats
        ? `${r.corretor} recebeu o toque no WhatsApp.`
        : `Aviso registrado no painel de ${r.corretor} (WhatsApp não saiu — chip fora).`);
      qc.invalidateQueries({ queryKey: ["aba-leads"] });
    } catch (e: any) {
      toast.error(`Não consegui cobrar: ${e?.message ?? e}`, { duration: 8000 });
    } finally { setCobrando(null); }
  }

  return (
    <div className="odr-fundo" role="dialog" aria-modal="true" onClick={onFechar}>
      <div className="odr" onClick={(e) => e.stopPropagation()}>
        <div className="odr-h">
          <div><b>{titulo}</b><i>{leads.length} lead{leads.length === 1 ? "" : "s"} no período</i></div>
          <button className="odr-x" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        {!leads.length ? (
          <p className="odr-vazio">Nenhum lead nesta origem no período.</p>
        ) : (
          <div className="odr-l">
            {leads.map((l) => {
              const s = SITUACAO[l.situacao];
              return (
                <div className="odr-r" key={l.id}>
                  <span className="odr-n">
                    <b>{l.nome ?? l.telefone}</b>
                    <i>{l.corretor ?? "sem corretor"} · há {l.dias} dia{l.dias === 1 ? "" : "s"}</i>
                  </span>
                  <span className={`odr-s t-${s.tom}`} title={s.dica}>{s.rot}</span>
                  <span className="odr-acoes">
                    {verConversa ? (
                      <button className="odr-i" onClick={() => setEspiando(l)}
                        title="Ver a conversa entre o corretor e o cliente">
                        <Olho />
                      </button>
                    ) : null}
                    <button className="odr-cobrar" disabled={cobrando === l.id || !l.brokerId}
                      onClick={() => cobrar(l)}
                      title={l.brokerId
                        ? "Manda um empurrão para o corretor abrir este lead — no WhatsApp e no painel dele"
                        : "Sem corretor para cobrar"}>
                      {cobrando === l.id ? "…" : "Cobrar"}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* espiar a conversa — leitura, o gerente confere e não fala */}
        {espiando ? (
          <div className="odr-conv" onClick={() => setEspiando(null)}>
            <div className="odr-conv-i" onClick={(e) => e.stopPropagation()}>
              <div className="odr-conv-h">
                <b>{espiando.nome ?? espiando.telefone}</b>
                <span>com {espiando.corretor ?? "—"}</span>
                <button className="odr-x" onClick={() => setEspiando(null)} aria-label="Fechar">✕</button>
              </div>
              <div className="odr-msgs">
                {carregandoMsgs ? <p className="odr-vazio">Carregando a conversa…</p>
                  : !msgs?.length ? <p className="odr-vazio">Sem mensagens registradas para este lead.</p>
                  : msgs.map((m) => (
                    <div key={m.id} className={`odr-m ${m.de}`}>
                      <span>{m.texto}</span>
                      <i>{m.de === "cliente" ? "cliente" : m.de === "ia" ? "sistema" : "corretor"} · {
                        new Date(m.quando).toLocaleString("pt-BR",
                          { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</i>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
