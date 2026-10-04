// O funil da semana, com a origem de cada degrau.
//
// A pergunta que ele responde e ninguém consegue responder hoje: QUAL ORIGEM
// converte. Pode ser que o lead da Cury responda três vezes mais que o de
// anúncio — e isso muda onde o dinheiro vai.
//
// Honestidade dos degraus:
//   · entrada, contato e resposta  → medidos (leads + webhook)
//   · visita e venda               → medidos (Cury)
//   · agendamento e documentos     → dependem do corretor mexer no status,
//                                    então saem marcados como subnotificados
//   · origem só acompanha até "compareceu": a venda na Cury vem com o nome do
//     corretor, não com a origem do lead. Mostrar divisão depois disso seria
//     inventar precisão.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sec, Panel, Blank } from "@/components/manager-v10/ui";
import { casarCheckinsComEquipe, type BrokerProfile, type C2SCheckinRow } from "@/utils/c2sMatching";

type Origem = "anuncio" | "disparo" | "repescagem" | "propria";
const ROT: Record<Origem, string> = {
  anuncio: "Anúncio", disparo: "Disparo", repescagem: "Repescagem", propria: "Própria",
};
const ORDEM: Origem[] = ["anuncio", "disparo", "repescagem", "propria"];

interface Degrau {
  label: string;
  n: number;
  /** null = a origem não sobrevive até aqui */
  origem: Partial<Record<Origem, number>> | null;
  subnotificado?: boolean;
}

const diaSP = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Segunda desta semana — é a janela em que a operação é avaliada. */
function segunda() {
  const hoje = new Date();
  const d = (hoje.getDay() + 6) % 7;           // 0 = segunda
  return diaSP(new Date(Date.now() - d * 86_400_000));
}

export function useFunilSemana(managerId: string | undefined, _gerenteCuryId?: string | null) {
  const de = segunda(), ate = diaSP();
  const deIso = new Date(de + "T00:00:00").toISOString();
  return useQuery<Degrau[]>({
    queryKey: ["funil-origem", managerId, de, ate],
    enabled: !!managerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // 1. Equipe e Gerente
      const [mgrRes, brokersRes] = await Promise.all([
        supabase.from("profiles")
          .select("id,first_name,last_name")
          .eq("id", managerId!)
          .maybeSingle(),
        supabase.from("profiles")
          .select("id,first_name,last_name")
          .eq("manager_id", managerId!)
          .eq("role", "BROKER"),
      ]);

      const mgr = (mgrRes.data as any) ?? null;
      const brokers = (brokersRes.data ?? []) as BrokerProfile[];

      // 2. RPC funil_origem (se disponível), Check-ins C2S e Vendas concluídas
      const [funilRes, ckRes, vendasRes] = await Promise.all([
        supabase.rpc("funil_origem", { p_manager: managerId!, p_de: de, p_ate: ate }),
        supabase.from("c2s_checkins")
          .select("corretor,gerente,created_at")
          .gte("created_at", deIso),
        supabase.from("leads")
          .select("id,broker_id,updated_at,last_interaction_at,created_at")
          .eq("manager_id", managerId!)
          .eq("status", "CONCLUDED")
          .gte("updated_at", deIso),
      ]);

      let linhas = (funilRes.data ?? []) as any[];

      // Fallback gracioso se a RPC funil_origem não retornar dados
      if (!linhas || linhas.length === 0) {
        const { data: leadsSemana } = await supabase.from("leads")
          .select("id,source,original_broker_id,status,contact_attempts,last_interaction_at,created_at")
          .eq("manager_id", managerId!)
          .gte("created_at", deIso);

        const mapa: Record<Origem, { entraram: number; contatados: number; responderam: number; negociando: number }> = {
          anuncio: { entraram: 0, contatados: 0, responderam: 0, negociando: 0 },
          disparo: { entraram: 0, contatados: 0, responderam: 0, negociando: 0 },
          repescagem: { entraram: 0, contatados: 0, responderam: 0, negociando: 0 },
          propria: { entraram: 0, contatados: 0, responderam: 0, negociando: 0 },
        };

        const origemDoLead = (source: string | null, orig: string | null): Origem => {
          if (source === "cold_pool" || orig) return "repescagem";
          if (source === "facebook_make") return "anuncio";
          if (source === "wa_oficial" || source === "campaign") return "disparo";
          return "propria";
        };

        for (const l of (leadsSemana ?? [])) {
          const orig = origemDoLead(l.source, l.original_broker_id);
          const o = mapa[orig];
          o.entraram += 1;
          const contatado = (l.contact_attempts ?? 0) > 0 || !!l.last_interaction_at || l.status !== "NEW";
          if (contatado) o.contatados += 1;
          const respondeu = ["IN_PROGRESS", "NEGOTIATING", "VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED", "CONCLUDED"].includes(l.status);
          if (respondeu) o.responderam += 1;
          const negoc = ["NEGOTIATING", "VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED"].includes(l.status);
          if (negoc) o.negociando += 1;
        }

        linhas = Object.entries(mapa).map(([origem, counts]) => ({
          origem,
          ...counts,
        }));
      }

      const por = (campo: string) => {
        const o: Partial<Record<Origem, number>> = {};
        for (const l of linhas) if (l[campo] > 0) o[l.origem as Origem] = Number(l[campo]);
        return o;
      };
      const soma = (campo: string) => linhas.reduce((a, l) => a + Number(l[campo] ?? 0), 0);

      // Check-ins C2S casados com a equipe
      const checks = ((ckRes as any).data ?? []) as C2SCheckinRow[];
      const matched = casarCheckinsComEquipe(checks, brokers, mgr);
      const visitas = matched.length;

      // Vendas concluídas na semana
      const vendasRows = ((vendasRes as any).data ?? []) as any[];
      const vendas = vendasRows.length;

      return [
        { label: "Leads na semana", n: soma("entraram"),   origem: por("entraram") },
        { label: "Contatados",      n: soma("contatados"), origem: por("contatados") },
        { label: "Responderam",     n: soma("responderam"),origem: por("responderam") },
        { label: "Em negociação",   n: soma("negociando"), origem: por("negociando"), subnotificado: true },
        { label: "Visitaram",       n: visitas,            origem: null },
        { label: "Venderam",        n: vendas,             origem: null },
      ];
    },
  });
}

export default function FunilOrigem({
  managerId, gerenteCuryId,
}: { managerId: string | undefined; gerenteCuryId?: string | null }) {
  const { data, isLoading } = useFunilSemana(managerId, gerenteCuryId);
  const [aberto, setAberto] = useState<number | null>(null);

  if (isLoading || !data) return null;
  if (data[0].n === 0) {
    return (
      <Sec title="Do lead até a venda" tag={<span className="dim">esta semana</span>}>
        <Blank title="Nenhum lead entrou nesta semana">
          Sem entrada não há funil. A origem e a conversão aparecem aqui quando
          voltar a entrar lead.
        </Blank>
      </Sec>
    );
  }

  const max = data[0].n || 1;
  // O degrau que mais perde é onde o dinheiro para.
  let pior = -1, piorPct = Infinity;
  data.forEach((d, i) => {
    if (i > 0 && data[i - 1].n > 0) {
      const p = d.n / data[i - 1].n;
      if (p < piorPct) { piorPct = p; pior = i; }
    }
  });

  const base = data[0].origem ?? {};

  return (
    <Sec
      title="Do lead até a venda"
      tag={<span className="dim">esta semana · clique no degrau</span>}
      sub={pior > 0
        ? <>O degrau que mais perde é <b>{data[pior].label.toLowerCase()}</b> — passam {Math.round(piorPct * 100)}% de {data[pior - 1].label.toLowerCase()}.</>
        : undefined}
    >
      <Panel>
        <div className="fo">
          <div className="fo-steps">
            {data.map((d, i) => (
              <button key={d.label} type="button"
                className={`fo-st${i === pior ? " drop" : ""}${aberto === i ? " on" : ""}`}
                aria-pressed={aberto === i}
                onClick={() => setAberto((v) => (v === i ? null : i))}>
                <span className="fo-b"><i style={{ height: `${Math.max(6, (d.n / max) * 100)}%` }} /></span>
                <span className="fo-n">{d.n}</span>
                <span className="fo-l">{d.label}</span>
                {i > 0 && data[i - 1].n > 0
                  ? <span className="fo-p">{Math.round((d.n / data[i - 1].n) * 100)}% do anterior</span>
                  : null}
                {d.subnotificado ? <span className="fo-est">subnotificado</span> : null}
              </button>
            ))}
          </div>

          {aberto !== null && (
            <div className="fo-drill">
              {data[aberto].origem === null ? (
                <>
                  <h4>{data[aberto].label} <span>· {data[aberto].n} no total</span></h4>
                  <p>A origem do lead não sobrevive até aqui. Visita vem do
                     check-in no plantão (Contact2Sale) e venda é concluída no
                     Comandra com o nome do corretor, não com a origem — mostrar
                     uma divisão neste degrau seria inventar precisão que não existe.</p>
                </>
              ) : (
                <>
                  <h4>{data[aberto].label} <span>· {data[aberto].n} de onde?</span></h4>
                  <div className="fo-rows">
                    {ORDEM.filter((o) => (data[aberto].origem![o] ?? 0) > 0).map((o) => {
                      const v = data[aberto].origem![o]!;
                      const tot = Object.values(data[aberto].origem!).reduce((a, n) => a + (n ?? 0), 0) || 1;
                      const dorigem = base[o] ?? 0;
                      return (
                        <div key={o} className="fo-row">
                          <s><em className={`o-${o}`} />{ROT[o]}</s>
                          <span className="fo-bar"><i className={`o-${o}`} style={{ width: `${(v / tot) * 100}%` }} /></span>
                          <b>{v}{aberto > 0 && dorigem ? <span>{Math.round((v / dorigem) * 100)}%</span> : null}</b>
                        </div>
                      );
                    })}
                  </div>
                  {aberto > 0 ? (
                    <p>O percentual à direita é quanto sobrou daquela origem desde a
                       entrada. É aqui que se vê qual fonte vale o dinheiro.</p>
                  ) : null}
                </>
              )}
            </div>
          )}

          <p className="fo-nota">
            Visita vem do check-in no plantão (Contact2Sale) e venda é registrada no Comandra. Negociação depende
            do corretor mexer no status do lead, e por isso vem por baixo.
          </p>
        </div>
      </Panel>
    </Sec>
  );
}
