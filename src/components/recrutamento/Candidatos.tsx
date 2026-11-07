// Candidatos a corretor (07/11, Junior): formulário de contratação marcado como Recrutamento pelo super/diretor
// cai em rodízio entre os gerentes escolhidos. Esteira: Em contato → Entrevista → Contratado / Não seguiu.
// "Contratar" abre o cadastro do corretor já preenchido; dali o Comandra acompanha 1º acesso, 1º check-in e
// se continua ativo (saiu = desligado ou 20 dias sem check-in). Gerente no Time; super e diretor na Equipe.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import CadastrarCorretor from "@/components/manager-v10/CadastrarCorretor";

type Situacao = { ativo_cadastro: boolean; primeiro_acesso: boolean; primeiro_checkin: string | null; ultimo_checkin: string | null; checkins_30: number; saiu: boolean };
export type Candidato = {
  id: string; nome: string | null; telefone: string | null; regiao: string | null; campanha: string | null; formulario: string | null;
  etapa: "em_contato" | "entrevista" | "contratado" | "nao_seguiu"; contatado_em: string | null; entrevista_em: string | null;
  entrevista_local: string | null; motivo: string | null; contratado_em: string | null; criado_em: string;
  gerente_id: string | null; gerente: string | null; profile_id: string | null; situacao: Situacao | null;
};

const COLS: { k: Candidato["etapa"]; t: string }[] = [
  { k: "em_contato", t: "Em contato" }, { k: "entrevista", t: "Entrevista" }, { k: "contratado", t: "Contratado" }, { k: "nao_seguiu", t: "Não seguiu" },
];
const MOTIVOS = ["Não atendeu", "Desistiu", "Queria salário fixo", "Não tem perfil", "Mora longe"];

const dia = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
const diaHora = (s: string) => new Date(s).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ha = (s: string) => {
  const h = (Date.now() - new Date(s).getTime()) / 36e5;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)} dias`;
};
export const parado24 = (c: Candidato) => c.etapa === "em_contato" && !c.contatado_em && Date.now() - new Date(c.criado_em).getTime() > 864e5;

const CSS = `
.rc{display:grid;gap:14px}
.rc-top{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap}
.rc-top h3{margin:0;font-size:18px;font-weight:800}
.rc-top p{margin:3px 0 0;font-size:13px;color:var(--cv-text-muted,#5B6B80)}
.rc-alerta{background:#FBE3DD;color:#8E2F1C;font-weight:700;font-size:13px;border-radius:999px;padding:6px 12px}
.rc-cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:start}
@media (max-width:1000px){.rc-cols{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.rc-cols{grid-template-columns:1fr}}
.rc-col{background:rgba(127,140,160,.12);border-radius:14px;padding:10px;display:grid;gap:8px;align-content:start}
.rc-col-h{display:flex;justify-content:space-between;font-weight:800;font-size:14px;padding:2px 4px}
.rc-col-h span{color:var(--cv-text-muted,#5B6B80)}
.rc-card{background:var(--cv-surface,#fff);color:var(--cv-text,#0F1B2D);border:1px solid var(--cv-border,#DDE3EA);border-radius:12px;padding:11px;display:grid;gap:5px}
.rc-card.ruim{border-color:#E9A796}
.rc-card.boa{border-color:#8FD3C4}
.rc-card b{font-size:14px}
.rc-m{font-size:12.5px;color:var(--cv-text-muted,#5B6B80)}
.rc-ruim{color:#B4462F;font-weight:700}
.rc-boa{color:#0B7A6A;font-weight:700}
.rc-acoes{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.rc-b{font:inherit;font-size:13px;font-weight:700;border-radius:8px;padding:7px 10px;min-height:36px;cursor:pointer;border:1px solid var(--cv-border,#C9D3DF);background:transparent;color:inherit;text-decoration:none;display:inline-flex;align-items:center}
.rc-b.p{background:#0B7A6A;border-color:#0B7A6A;color:#fff}
.rc-b:disabled{opacity:.55;cursor:default}
.rc-form{display:grid;gap:6px;border-top:1px solid var(--cv-border,#E1E6EE);padding-top:8px;margin-top:2px}
.rc-form input{font:inherit;font-size:13.5px;min-height:38px;border:1px solid var(--cv-border,#C9D3DF);border-radius:8px;padding:0 10px;background:transparent;color:inherit}
.rc-form label{font-size:12px;font-weight:700;color:var(--cv-text-muted,#5B6B80)}
.rc-vazio{font-size:13px;color:var(--cv-text-muted,#5B6B80);padding:4px}
.rc-mais{font:inherit;background:none;border:0;color:#0B7A6A;font-weight:700;font-size:13px;cursor:pointer;padding:4px}
`;

export function useCandidatos(como?: string | null) {
  return useQuery({
    queryKey: ["candidatos", como ?? null],
    staleTime: 30_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("candidatos_lista" as any, { p_como: como ?? null });
      if (error) throw error;
      return ((data ?? []) as unknown) as Candidato[];
    },
  });
}

export default function Candidatos({ como, titulo = "Candidatos a corretor" }: { como?: string | null; titulo?: string }) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const { data: lista = [], isLoading } = useCandidatos(como);
  const [aberto, setAberto] = useState<{ id: string; modo: "entrevista" | "nao" } | null>(null);
  const [quando, setQuando] = useState("");
  const [local, setLocal] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [contratar, setContratar] = useState<Candidato | null>(null);
  const [todosNao, setTodosNao] = useState(false);
  const verGerente = role !== "MANAGER";
  const recarregar = () => qc.invalidateQueries({ queryKey: ["candidatos"] });

  async function mover(c: Candidato, acao: string, extra: Record<string, unknown> = {}) {
    setOcupado(c.id);
    const { error } = await supabase.rpc("candidato_mover" as any, { p_id: c.id, p_acao: acao, ...extra });
    setOcupado(null);
    if (error) { toast.error((error as any).details || `Não consegui salvar: ${error.message}`); return false; }
    recarregar();
    return true;
  }
  function chamar(c: Candidato) {
    const d = (c.telefone ?? "").replace(/\D/g, "");
    if (d) window.open(`https://wa.me/${d.startsWith("55") ? d : `55${d}`}`, "_blank", "noopener");
    if (!c.contatado_em) mover(c, "chamei");
  }
  async function salvarEntrevista(c: Candidato) {
    if (!quando) { toast.error("Escolha o dia e a hora da entrevista."); return; }
    if (await mover(c, "entrevista", { p_quando: new Date(quando).toISOString(), p_local: local })) { setAberto(null); toast.success("Entrevista marcada."); }
  }
  async function salvarNao(c: Candidato, m: string) {
    if (await mover(c, "nao_seguiu", { p_motivo: m })) { setAberto(null); toast.success("Marcado como não seguiu."); }
  }
  async function contratado(novoId?: string) {
    const c = contratar;
    setContratar(null);
    if (!c || !novoId) return;
    const { error } = await supabase.rpc("candidato_contratar" as any, { p_id: c.id, p_profile: novoId });
    if (error) { toast.error(`O corretor foi cadastrado, mas não consegui marcar o candidato: ${error.message}`); return; }
    toast.success(`${c.nome ?? "Candidato"} contratado. O Comandra acompanha o 1º acesso e o 1º check-in.`);
    recarregar();
  }

  const parados = lista.filter(parado24).length;
  const abrir = (id: string, modo: "entrevista" | "nao") => {
    setAberto(aberto?.id === id && aberto.modo === modo ? null : { id, modo }); setQuando(""); setLocal(""); setMotivo("");
  };

  function situacao(c: Candidato) {
    const s = c.situacao;
    if (!s) return null;
    if (s.saiu) return <span className="rc-m"><span className="rc-ruim">Saiu</span>{s.ultimo_checkin ? ` · último check-in ${dia(s.ultimo_checkin)}` : !s.ativo_cadastro ? " · desligado" : " · 20 dias sem check-in"}</span>;
    if (!s.primeiro_acesso) return <span className="rc-m"><span className="rc-ruim">✗ ainda não entrou no Comandra</span></span>;
    if (!s.primeiro_checkin) return <span className="rc-m"><span className="rc-boa">✓</span> 1º acesso · <span className="rc-ruim">✗ nunca fez check-in</span></span>;
    return <span className="rc-m"><span className="rc-boa">✓</span> 1º acesso · <span className="rc-boa">✓</span> 1º check-in {dia(s.primeiro_checkin)} · <span className="rc-boa">ativo</span> ({s.checkins_30} dia{s.checkins_30 === 1 ? "" : "s"} de plantão em 30)</span>;
  }

  function card(c: Candidato) {
    const ruim = parado24(c) || (c.etapa === "contratado" && !!c.situacao && (c.situacao.saiu || !c.situacao.primeiro_checkin));
    const hojeEnt = c.etapa === "entrevista" && c.entrevista_em && new Date(c.entrevista_em).toDateString() === new Date().toDateString();
    const op = ocupado === c.id;
    return (
      <div key={c.id} className={`rc-card${ruim ? " ruim" : hojeEnt ? " boa" : ""}`}>
        <b>{c.nome || "Sem nome"}</b>
        {c.etapa === "em_contato" && (c.contatado_em
          ? <span className="rc-m">chamado há {ha(c.contatado_em)} · aguardando resposta</span>
          : <span className={`rc-m${parado24(c) ? " rc-ruim" : ""}`}>chegou há {ha(c.criado_em)}{parado24(c) ? " · ninguém chamou" : ""}</span>)}
        {c.etapa === "entrevista" && c.entrevista_em && <span className={`rc-m${hojeEnt ? " rc-boa" : ""}`}>{diaHora(c.entrevista_em)}{c.entrevista_local ? ` · ${c.entrevista_local}` : ""}</span>}
        {c.etapa === "contratado" && <span className="rc-m">cadastrado {dia(c.contratado_em)}</span>}
        {c.etapa === "contratado" && situacao(c)}
        {c.etapa === "nao_seguiu" && <span className="rc-m">{c.motivo || "sem motivo"}</span>}
        <span className="rc-m">{[c.telefone, c.regiao, verGerente && c.gerente ? `gerente ${c.gerente}` : null].filter(Boolean).join(" · ")}</span>
        {(c.etapa === "em_contato" || c.etapa === "entrevista") && (
          <div className="rc-acoes">
            <button type="button" className={`rc-b${c.etapa === "em_contato" ? " p" : ""}`} disabled={op} onClick={() => chamar(c)}>Chamar</button>
            {c.etapa === "em_contato"
              ? <button type="button" className="rc-b" disabled={op} onClick={() => abrir(c.id, "entrevista")}>Marcar entrevista</button>
              : <button type="button" className="rc-b p" disabled={op} onClick={() => setContratar(c)}>Contratar</button>}
            <button type="button" className="rc-b" disabled={op} onClick={() => abrir(c.id, "nao")}>Não seguiu</button>
          </div>
        )}
        {c.etapa === "nao_seguiu" && (
          <div className="rc-acoes"><button type="button" className="rc-b" disabled={op} onClick={() => mover(c, "em_contato")}>Voltar para em contato</button></div>
        )}
        {aberto?.id === c.id && aberto.modo === "entrevista" && (
          <div className="rc-form">
            <label htmlFor={`q-${c.id}`}>Dia e hora</label>
            <input id={`q-${c.id}`} type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
            <label htmlFor={`l-${c.id}`}>Onde (opcional)</label>
            <input id={`l-${c.id}`} placeholder="Ex.: Plantão Barra Funda" value={local} onChange={(e) => setLocal(e.target.value)} />
            <div className="rc-acoes"><button type="button" className="rc-b p" disabled={op} onClick={() => salvarEntrevista(c)}>Salvar entrevista</button></div>
          </div>
        )}
        {aberto?.id === c.id && aberto.modo === "nao" && (
          <div className="rc-form">
            <label>Por que não seguiu?</label>
            <div className="rc-acoes">{MOTIVOS.map((m) => <button type="button" key={m} className="rc-b" disabled={op} onClick={() => salvarNao(c, m)}>{m}</button>)}</div>
            <input aria-label="Outro motivo" placeholder="Outro motivo…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            {motivo.trim() && <div className="rc-acoes"><button type="button" className="rc-b p" disabled={op} onClick={() => salvarNao(c, motivo.trim())}>Salvar</button></div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="rc"><style>{CSS}</style>
      <div className="rc-top">
        <div>
          <h3>{titulo}</h3>
          <p>Chegam das campanhas de contratação marcadas como Recrutamento. Não contam como lead de cliente.</p>
        </div>
        {parados > 0 && <span className="rc-alerta">{parados} sem contato há mais de 24h</span>}
      </div>
      {isLoading ? <span className="rc-vazio">Carregando…</span> : lista.length === 0 ? (
        <span className="rc-vazio">Nenhum candidato ainda. Quando o super ou o diretor marcar um formulário de contratação como Recrutamento (Leads › Gerenciar filas), os candidatos aparecem aqui.</span>
      ) : (
        <div className="rc-cols">
          {COLS.map((col) => {
            let itens = lista.filter((c) => c.etapa === col.k);
            if (col.k === "em_contato") itens = [...itens].sort((a, b) => Number(parado24(b)) - Number(parado24(a)) || a.criado_em.localeCompare(b.criado_em));
            if (col.k === "entrevista") itens = [...itens].sort((a, b) => (a.entrevista_em ?? "").localeCompare(b.entrevista_em ?? ""));
            const total = itens.length;
            if (col.k === "nao_seguiu" && !todosNao) itens = itens.slice(0, 5);
            return (
              <div key={col.k} className="rc-col" aria-label={col.t}>
                <div className="rc-col-h">{col.t}<span>{total}</span></div>
                {itens.map(card)}
                {total === 0 && <span className="rc-vazio">—</span>}
                {col.k === "nao_seguiu" && total > 5 && <button type="button" className="rc-mais" onClick={() => setTodosNao(!todosNao)}>{todosNao ? "Mostrar menos" : `Ver todos (${total})`}</button>}
              </div>
            );
          })}
        </div>
      )}
      {contratar && contratar.gerente_id && (
        <CadastrarCorretor
          managerId={contratar.gerente_id}
          nomeInicial={contratar.nome ?? ""}
          telInicial={contratar.telefone ?? ""}
          gerentes={role === "MANAGER" ? undefined : [{ id: contratar.gerente_id, nome: contratar.gerente ?? "Gerente" }]}
          onFechar={() => setContratar(null)}
          onPronto={contratado}
        />
      )}
    </section>
  );
}
