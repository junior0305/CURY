// PRECISA DE VOCÊ — os problemas agrupados, não as pessoas.
//
// A unidade de atenção do gerente não é a pessoa, é o problema: "4 no plantão
// sem receber lead" é um problema com quatro nomes, não quatro linhas. Ele quer
// resolver os quatro de uma vez, não clicar um por um — com 40 corretores essa
// diferença é entre usar e não usar a tela.
//
// Por isso a lista de gente fica acima (para varrer) e esta fila fica aqui
// embaixo (para agir).

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import VincularCorretor from "@/components/manager-v10/VincularCorretor";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sec, Panel, Blank } from "@/components/manager-v10/ui";
import { definirRecebimento, trazerParaEquipe, status, type Pessoa } from "@/hooks/useTempoReal";

interface Grupo {
  chave: string;
  titulo: string;
  porque: string;
  acao: string;
  tom: "crit" | "trav" | "warn";
  /** ação em lote — quando existe, o botão do cabeçalho resolve todos */
  lote?: (gente: Pessoa[], managerId?: string) => Promise<void>;
}

const GRUPOS: Grupo[] = [
  { chave: "semcad", tom: "trav", titulo: "batem ponto e não têm login aqui",
    porque: "Aparecem na Cury e não existem no Comandra — não recebem lead nem entram na cobrança individual. " +
            "Antes de criar login, confira se já não é alguém daqui com outro nome: a Cury às vezes pede para " +
            "trocar o apelido depois que o acesso foi criado, e dois cadastros para a mesma pessoa dividem a carteira em duas.",
    acao: "Conferir um a um" },
  // Transferência que aconteceu na Cury e não aconteceu aqui. É o caso mais
  // comum e o mais invisível: a pessoa trabalha para o gerente e some do painel
  // dele, que passa a cobrar uma equipe menor do que a que tem.
  { chave: "outraeq", tom: "trav", titulo: "já são seus na Cury e não aqui",
    porque: "Batem ponto na sua equipe e o cadastro daqui ainda está com outro gerente — não entram no seu rodízio e não aparecem nos seus números.",
    acao: "Trazer para a equipe",
    lote: async (gente, managerId) => {
      for (const p of gente) if (p.profileId) await trazerParaEquipe(p.profileId, managerId);
    } },
  { chave: "desativado", tom: "trav", titulo: "voltaram a trabalhar com cadastro desativado",
    porque: "Bateram ponto na Cury e o login aqui está desligado — não recebem lead, não contam em nada e não conseguem entrar.",
    acao: "Reativar e trazer",
    lote: async (gente, managerId) => {
      for (const p of gente) if (p.profileId) await trazerParaEquipe(p.profileId, managerId);
    } },
  { chave: "rodizio", tom: "trav", titulo: "no plantão e sem receber lead",
    porque: "Vieram trabalhar e o recebimento está desligado.",
    acao: "Ligar recebimento",
    lote: async (gente) => {
      for (const p of gente) if (p.profileId) await definirRecebimento(p.profileId, true);
    } },
  { chave: "parado", tom: "crit", titulo: "vêm ao plantão e não produzem",
    porque: "Vários dias de plantão sem atender e sem vender. Presença sem trabalho.",
    acao: "Conversar hoje" },
  { chave: "perdeu", tom: "warn", titulo: "deixaram lead expirar no plantão",
    porque: "Estavam no balcão e o lead da Cury venceu sem atendimento.",
    acao: "Cobrar agora" },
  { chave: "sumido", tom: "warn", titulo: "sumidos com carteira cheia",
    porque: "Não vieram e não abrem o Comandra. Os leads estão parados na mão deles.",
    acao: "Redistribuir" },
];

export default function PrecisaDeVoce({ gente, managerId }: { gente: Pessoa[]; managerId?: string }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<string | null>(null);
  const [rodando, setRodando] = useState<string | null>(null);
  // Quem clicou, para o motor conferir o papel — a função roda com chave de
  // serviço e faria qualquer coisa sem isso.
  const [quem, setQuem] = useState<string | null>(null);
  const [vincular, setVincular] = useState<Pessoa | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setQuem(data?.user?.id ?? null)); }, []);

  const blocos = GRUPOS
    .map((g) => ({ g, pessoas: gente.filter((p) => status(p).chave === g.chave) }))
    .filter((b) => b.pessoas.length > 0);

  const total = blocos.reduce((a, b) => a + b.pessoas.length, 0);

  async function emLote(b: { g: Grupo; pessoas: Pessoa[] }) {
    if (b.g.chave === "semcad") { setVincular(b.pessoas[0]); return; }
    if (!b.g.lote) { toast.info(`${b.g.acao} — em construção`); return; }
    setRodando(b.g.chave);
    try {
      await b.g.lote(b.pessoas, managerId);
      toast.success(`${b.pessoas.length} resolvido${b.pessoas.length > 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["tempo-real"] });
    } catch (e: any) {
      toast.error(`Não consegui: ${e?.message ?? e}`);
    } finally { setRodando(null); }
  }

  return (
    <Sec
      title="Precisa de você"
      tag={total
        ? <span className="dim">{total} pessoa{total > 1 ? "s" : ""} em {blocos.length} situa{blocos.length > 1 ? "ções" : "ção"}</span>
        : null}
    >
      {blocos.length === 0 ? (
        <Blank title="Nada travado agora">
          Todo mundo que veio trabalhar está recebendo lead.
        </Blank>
      ) : (
        <div className="pv">
          {blocos.map(({ g, pessoas }) => (
            <div key={g.chave} className={`pv-b t-${g.tom}${aberto === g.chave ? " on" : ""}`}>
              <div className="pv-h" role="button" tabIndex={0}
                onClick={() => setAberto((v) => (v === g.chave ? null : g.chave))}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault(); setAberto((v) => (v === g.chave ? null : g.chave)); } }}>
                <span className="pv-c">{pessoas.length}</span>
                <span className="pv-t">
                  <b>{pessoas.length} {g.titulo}</b>
                  <i>{pessoas.slice(0, 4).map((p) => p.apelido ?? p.nome).join(" · ")}
                     {pessoas.length > 4 ? ` · +${pessoas.length - 4}` : ""}</i>
                </span>
                <button type="button" className="mini solid" disabled={rodando === g.chave}
                  onClick={(e) => { e.stopPropagation(); emLote({ g, pessoas }); }}>
                  {rodando === g.chave ? "…" : `${g.acao} (${pessoas.length})`}
                </button>
                <svg className="pv-car" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
              <div className="pv-d"><div className="pv-d-in">
                <p>{g.porque}</p>
                <div className="pv-nomes">
                  {pessoas.map((p) => (
                    g.chave === "semcad" && p.curyId ? (
                      <button key={p.curyId} type="button" className="pv-nome cliq"
                        onClick={() => setVincular(p)}>
                        {p.apelido ?? p.nome}
                        <em>conferir</em>
                      </button>
                    ) : (
                      <span key={p.profileId ?? p.curyId!} className="pv-nome">
                        {p.apelido ?? p.nome}
                        <em>{p.ponto ? "no plantão" : "sem ponto"}</em>
                      </span>
                    )
                  ))}
                </div>
              </div></div>
            </div>
          ))}
        </div>
      )}
      {vincular && quem ? (
        <VincularCorretor pessoa={vincular} managerId={managerId} quem={quem}
          onFechar={() => setVincular(null)} />
      ) : null}
    </Sec>
  );
}
