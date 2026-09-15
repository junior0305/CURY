// A META DO MÊS, virada em ordem do dia.
//
// A meta que vale é a do MÊS — é ela que o gerente presta contas. A semana não
// é uma meta concorrente: é o pedaço do mês que cabe nos dias que sobraram, e
// por isso aparece dentro da explicação, não como segundo placar. Ter dois
// números grandes competindo era o jeito certo de não olhar nenhum.
//
// O gerente também não consegue "fazer uma venda" numa quarta-feira. Consegue
// cobrar atendimento. Por isso o bloco traduz a meta na corrente que a equipe
// controla:
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
function diasNaSemana() {
  return 7 - ((new Date().getDay() + 6) % 7);
}
/** Dias que ainda restam no mês, contando hoje. */
function diasNoMes() {
  const hoje = diaSP();
  const [a, m, d] = hoje.split("-").map(Number);
  return new Date(a, m, 0).getDate() - d + 1;
}

interface Meta {
  /** a meta que vale: o mês */
  alvoMes: number | null;
  vendasMes: number;
  atendMes: number;
  /** o pedaço do mês que cabe nesta semana — cadastrado ou repartido */
  alvoSemana: number | null;
  semanaCadastrada: boolean;
  vendasSemana: number;
  atendSemana: number;
  /** atendimentos por venda desta equipe (medido) */
  razao: number;
  razaoPropria: boolean;
}

const RAZAO_EMPRESA = 5.0;   // 215 atendimentos / 43 vendas, ago+set 2026

export function useMetaSemana(managerId: string | undefined, gerenteCuryId: string | null) {
  const de = segunda(), hoje = diaSP();
  const inicioMes = hoje.slice(0, 8) + "01";
  return useQuery<Meta>({
    queryKey: ["meta-semana", managerId, hoje],
    enabled: !!managerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: perfil } = await supabase.from("profiles")
        .select("team_id").eq("id", managerId!).maybeSingle();
      const teamId = (perfil as any)?.team_id ?? null;

      const [metasRes, mesRes, histRes] = await Promise.all([
        teamId
          ? supabase.from("team_goals").select("sales_target,goal_type,week_start,month")
              .eq("team_id", teamId)
          : Promise.resolve({ data: [] as any[] }),
        // Uma consulta só do dia 1 até hoje: a semana sai daqui por recorte,
        // em vez de uma segunda ida ao banco pedindo o mesmo dado menor.
        gerenteCuryId
          ? supabase.from("cury_metricas_diarias").select("data,atendimentos,vendas")
              .eq("escopo", "corretor").eq("gerente_cury_id", gerenteCuryId)
              .gte("data", inicioMes).lte("data", hoje)
          : Promise.resolve({ data: [] as any[] }),
        gerenteCuryId
          ? supabase.from("cury_metricas_diarias").select("atendimentos,vendas")
              .eq("escopo", "corretor").eq("gerente_cury_id", gerenteCuryId)
              .gte("data", diaSP(new Date(Date.now() - 60 * 86_400_000)))
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const metas = ((metasRes as any).data ?? []) as any[];
      const doMes = metas.find((m) => m.goal_type === "monthly" && m.month === inicioMes);
      const daSemana = metas.find((m) => m.goal_type === "weekly" && m.week_start === de);
      const alvoMes = doMes?.sales_target || null;

      const mes = ((mesRes as any).data ?? []) as any[];
      const soma = (linhas: any[], campo: string) =>
        linhas.reduce((a, x) => a + (x[campo] ?? 0), 0);
      const naSemana = mes.filter((x) => String(x.data) >= de);

      const vendasMes = soma(mes, "vendas");
      const faltaNoMes = alvoMes ? Math.max(0, alvoMes - vendasMes) : 0;

      // A semana não é o mês dividido por 4,33: é o que falta repartido pelas
      // semanas que ainda existem. Em dia 25 com metade da meta aberta, a conta
      // fixa mentiria para baixo — e é justamente quando ela precisa apertar.
      const semanasRestantes = Math.max(1, Math.ceil(diasNoMes() / 7));
      const alvoSemana = daSemana?.sales_target
        ? daSemana.sales_target
        : (alvoMes ? Math.ceil(faltaNoMes / semanasRestantes) : null);

      const hist = ((histRes as any).data ?? []) as any[];
      const hAtend = soma(hist, "atendimentos"), hVendas = soma(hist, "vendas");
      // Amostra pequena não vira régua: abaixo de 5 vendas usa a da empresa.
      const propria = hVendas >= 5 && hAtend > 0;

      return {
        alvoMes, vendasMes, atendMes: soma(mes, "atendimentos"),
        alvoSemana, semanaCadastrada: !!daSemana?.sales_target,
        vendasSemana: soma(naSemana, "vendas"), atendSemana: soma(naSemana, "atendimentos"),
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

  const {
    alvoMes, vendasMes, alvoSemana, semanaCadastrada,
    vendasSemana, atendSemana, razao, razaoPropria,
  } = data;

  const diasMes = diasNoMes(), diasSem = diasNaSemana();
  const faltaMes = alvoMes ? Math.max(0, alvoMes - vendasMes) : 0;
  const pct = alvoMes ? Math.min(100, (vendasMes / alvoMes) * 100) : 0;

  // A cobrança da semana é o que dá para fazer nos dias que sobraram.
  const faltaSem = alvoSemana ? Math.max(0, alvoSemana - vendasSemana) : 0;
  const precisa = Math.ceil(faltaSem * razao);
  const restam = Math.max(0, precisa - atendSemana);
  const porDia = diasSem > 0 ? Math.ceil(restam / diasSem) : restam;
  const r = razao.toFixed(1).replace(".", ",");
  const s = (n: number) => (n === 1 ? "" : "s");

  return (
    <div className="ms">
      <div className="ms-l">
        <div className="tag">Meta do mês</div>

        {alvoMes ? (
          <>
            <div className="ms-k">
              <span className="ms-n mono">{vendasMes}</span>
              <span className="ms-of">de {alvoMes} venda{s(alvoMes)} no mês</span>
            </div>
            <div className="ms-bar"><i style={{ width: `${pct}%` }} /></div>

            {faltaMes === 0 ? (
              <p className="ms-say">
                Meta do mês <b className="win">batida</b>. {vendasMes} venda{s(vendasMes)},
                e ainda restam <b className="mono">{diasMes}</b> dia{s(diasMes)}.
              </p>
            ) : (
              <p className="ms-say">
                Faltam <b className="mono">{faltaMes}</b> em <b className="mono">{diasMes}</b> dia{s(diasMes)}.
                {alvoSemana ? (
                  <> Nesta semana isso são <b className="mono">{alvoSemana}</b> —
                    {" "}feita{s(vendasSemana) ? "s" : ""} <b className="mono">{vendasSemana}</b>
                    {faltaSem > 0 ? <>, faltam <b className="mono">{faltaSem}</b> em{" "}
                      <b className="mono">{diasSem}</b> dia{s(diasSem)}.</> : <>. Semana resolvida.</>}
                  </>
                ) : null}
                {faltaSem > 0 ? (
                  <> Sua equipe vende <b>1 a cada {r} atendimentos</b> — para essas{" "}
                    {faltaSem} precisa de <b className="mono">{precisa}</b>, fez{" "}
                    <b className="mono">{atendSemana}</b>.
                    {restam > 0 ? <> Faltam <b className="mono">{restam}</b>, cerca de{" "}
                      <b className="mono">{porDia}</b> por dia.</> : null}
                  </>
                ) : null}
              </p>
            )}

            <p className="ms-nota">
              {semanaCadastrada
                ? <>A semana tem meta própria, cadastrada pelo administrador. </>
                : <>A semana é o que falta no mês repartido pelas semanas que restam. </>}
              {razaoPropria
                ? <>A razão é a da sua equipe, medida nos últimos 60 dias. </>
                : <>Sem vendas suficientes para medir sua equipe: usando a régua da empresa ({RAZAO_EMPRESA.toFixed(1).replace(".", ",")}). </>}
              {restam > 0
                ? <span className="dim">Para comparecerem {restam}, agende cerca de {restam * 2} — agendamento não é medido, é a ordem do dia.</span>
                : null}
            </p>
          </>
        ) : (
          <>
            <div className="ms-k">
              <span className="ms-n mono">{vendasMes}</span>
              <span className="ms-of">venda{s(vendasMes)} neste mês</span>
            </div>
            <p className="ms-say">
              Sem meta cadastrada para o mês. Sua equipe vende <b>1 a cada {r} atendimentos</b>{" "}
              e fez <b className="mono">{data.atendMes}</b> até agora — no ritmo, fecha o mês em{" "}
              <b className="mono">{Math.floor(data.atendMes / razao)}</b>.
            </p>
            <p className="ms-nota">
              Sem meta não há cobrança possível: o painel mostra o ritmo, mas não
              tem contra o que comparar. A meta do mês é cadastrada pelo administrador.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
