// A meta da semana, virada em ORDEM DO DIA.
//
// O gerente não consegue "fazer uma venda" numa quarta-feira. Consegue cobrar
// atendimento. Por isso o bloco traduz a meta na corrente que a equipe controla:
//
//     vendas  ←  atendimentos  ←  agendamentos
//
// A razão atendimento→venda é MEDIDA por equipe (Cury, 60 dias), não chutada.
// Em set/2026: Dudu 2,8 · Datti 5,1 · Liliane 5,7 · empresa 5,0.
//
// ⚠️ Agendamento é ALVO, não medida — ninguém registra. Em agosto a empresa
// inteira registrou 64 agendamentos contra 169 atendimentos. Aparece em cinza,
// como instrução, e nunca como número cobrável.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const diaSP = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Segunda desta semana. A operação é avaliada de segunda a domingo. */
function segunda() {
  const hoje = new Date();
  const d = (hoje.getDay() + 6) % 7;
  return diaSP(new Date(Date.now() - d * 86_400_000));
}
/** Dias que ainda restam na semana, contando hoje. */
function diasRestantes() {
  return 7 - ((new Date().getDay() + 6) % 7);
}

interface Meta {
  alvo: number | null;
  /** de onde veio: meta da semana, derivada do mês, ou nenhuma */
  fonte: "semana" | "mes" | null;
  vendas: number;
  atendimentos: number;
  /** atendimentos por venda desta equipe (medido) */
  razao: number;
  razaoPropria: boolean;
}

const RAZAO_EMPRESA = 5.0;   // 215 atendimentos / 43 vendas, ago+set 2026

export function useMetaSemana(managerId: string | undefined, gerenteCuryId: string | null) {
  const de = segunda(), ate = diaSP();
  return useQuery<Meta>({
    queryKey: ["meta-semana", managerId, de],
    enabled: !!managerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: perfil } = await supabase.from("profiles")
        .select("team_id").eq("id", managerId!).maybeSingle();
      const teamId = (perfil as any)?.team_id ?? null;

      const mes = de.slice(0, 8) + "01";
      const [metasRes, semanaRes, histRes] = await Promise.all([
        teamId
          ? supabase.from("team_goals").select("sales_target,goal_type,week_start,month")
              .eq("team_id", teamId)
          : Promise.resolve({ data: [] as any[] }),
        gerenteCuryId
          ? supabase.from("cury_metricas_diarias").select("atendimentos,vendas")
              .eq("escopo", "corretor").eq("gerente_cury_id", gerenteCuryId)
              .gte("data", de).lte("data", ate)
          : Promise.resolve({ data: [] as any[] }),
        gerenteCuryId
          ? supabase.from("cury_metricas_diarias").select("atendimentos,vendas")
              .eq("escopo", "corretor").eq("gerente_cury_id", gerenteCuryId)
              .gte("data", diaSP(new Date(Date.now() - 60 * 86_400_000)))
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const metas = ((metasRes as any).data ?? []) as any[];
      const daSemana = metas.find((m) => m.goal_type === "weekly" && m.week_start === de);
      const doMes = metas.find((m) => m.goal_type === "monthly" && m.month === mes);

      let alvo: number | null = null;
      let fonte: Meta["fonte"] = null;
      if (daSemana?.sales_target) { alvo = daSemana.sales_target; fonte = "semana"; }
      else if (doMes?.sales_target) {
        // 4,33 semanas no mês — arredonda pra cima pra não prometer folga
        alvo = Math.ceil(doMes.sales_target / 4.33); fonte = "mes";
      }

      const semana = ((semanaRes as any).data ?? []) as any[];
      const hist = ((histRes as any).data ?? []) as any[];
      const hAtend = hist.reduce((a, x) => a + (x.atendimentos ?? 0), 0);
      const hVendas = hist.reduce((a, x) => a + (x.vendas ?? 0), 0);
      // Amostra pequena não vira régua: abaixo de 5 vendas usa a da empresa.
      const propria = hVendas >= 5 && hAtend > 0;

      return {
        alvo, fonte,
        vendas: semana.reduce((a, x) => a + (x.vendas ?? 0), 0),
        atendimentos: semana.reduce((a, x) => a + (x.atendimentos ?? 0), 0),
        razao: propria ? hAtend / hVendas : RAZAO_EMPRESA,
        razaoPropria: propria,
      };
    },
  });
}

export default function MetaSemana({
  managerId, gerenteCuryId,
}: { managerId: string | undefined; gerenteCuryId: string | null }) {
  const { data } = useMetaSemana(managerId, gerenteCuryId);
  if (!data) return null;

  const { alvo, fonte, vendas, atendimentos, razao, razaoPropria } = data;
  const dias = diasRestantes();
  const faltam = alvo ? Math.max(0, alvo - vendas) : 0;
  const precisa = alvo ? Math.ceil(faltam * razao) : 0;
  const restam = Math.max(0, precisa - atendimentos);
  const porDia = dias > 0 ? Math.ceil(restam / dias) : restam;
  const pct = alvo ? Math.min(100, (vendas / alvo) * 100) : 0;
  const r = razao.toFixed(1).replace(".", ",");

  return (
    <div className="ms">
      <div className="ms-l">
        <div className="tag">Meta da semana · seg a dom</div>
        {alvo ? (
          <>
            <div className="ms-k">
              <span className="ms-n mono">{vendas}</span>
              <span className="ms-of">de {alvo} venda{alvo === 1 ? "" : "s"}</span>
            </div>
            <div className="ms-bar"><i style={{ width: `${pct}%` }} /></div>
            <p className="ms-say">
              {faltam === 0 ? (
                <>Meta da semana <b className="win">batida</b>. {vendas} venda{vendas === 1 ? "" : "s"} em {7 - dias + 1} dia{7 - dias + 1 === 1 ? "" : "s"}.</>
              ) : (
                <>
                  Faltam <b className="mono">{faltam}</b> em <b className="mono">{dias}</b> dia{dias === 1 ? "" : "s"}.
                  {" "}Sua equipe vende <b>1 a cada {r} atendimentos</b> — precisa de{" "}
                  <b className="mono">{precisa}</b>, fez <b className="mono">{atendimentos}</b>.
                  {restam > 0 ? <> Faltam <b className="mono">{restam}</b>, cerca de <b className="mono">{porDia}</b> por dia.</> : null}
                </>
              )}
            </p>
            <p className="ms-nota">
              {fonte === "mes"
                ? <>Derivada da meta do mês — não há meta semanal cadastrada. </>
                : null}
              {razaoPropria
                ? <>A razão é a da sua equipe, medida nos últimos 60 dias. </>
                : <>Sem vendas suficientes para medir sua equipe: usando a régua da empresa ({RAZAO_EMPRESA.toFixed(1).replace(".", ",")}). </>}
              {faltam > 0
                ? <span className="dim">Para comparecerem {restam || precisa}, agende cerca de {(restam || precisa) * 2} — agendamento não é medido, é a ordem do dia.</span>
                : null}
            </p>
          </>
        ) : (
          <>
            <div className="ms-k">
              <span className="ms-n mono">{vendas}</span>
              <span className="ms-of">venda{vendas === 1 ? "" : "s"} nesta semana</span>
            </div>
            <p className="ms-say">
              Sem meta cadastrada para esta semana. Sua equipe vende{" "}
              <b>1 a cada {r} atendimentos</b> e fez <b className="mono">{atendimentos}</b> até agora
              — no ritmo, fecha a semana em <b className="mono">{Math.floor(atendimentos / razao)}</b>.
            </p>
            <p className="ms-nota">
              Sem meta não há cobrança possível: o painel mostra o ritmo, mas não
              tem contra o que comparar. A meta é cadastrada pelo administrador.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
