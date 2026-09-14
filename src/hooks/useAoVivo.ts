// Ao Vivo — quem está de plantão HOJE, e o que já produziu.
//
// A fonte é a Cury, não o Comandra: `cury_metricas_diarias` é alimentada de
// 30 em 30 minutos pelo job do VPS (ver memory/project_integracao_cury.md).
// Isso importa porque é a única informação do sistema que PROVA que a pessoa
// foi trabalhar — `lead_assignment_enabled` é uma chave que alguém ligou meses
// atrás e ninguém nunca mais mexeu.
//
// ⚠️ "atendimento" na Cury = "visita" no Comandra. O nome muda na fronteira,
// aqui dentro é visita.
//
// Três coisas precisam ser verdade pro corretor receber lead: bateu ponto,
// chip vivo, e o gerente autorizou. Quando uma falha, o lead some sem que
// ninguém saiba por quê — esta tela mostra as três lado a lado.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PessoaAoVivo {
  /** id na Cury — existe sempre. */
  curyId: string;
  nome: string | null;
  apelido: string | null;
  /** id no Comandra — NULL = bateu ponto mas não tem cadastro aqui. */
  profileId: string | null;
  checkins: number;
  visitas: number;
  vendas: number;
  /** estado no Comandra (só quando há cadastro) */
  recebeLead: boolean | null;
  chipVivo: boolean | null;
  chipEstado: string | null;
  botInstanceId: string | null;
  ultimaVez: string | null;
}

export interface AoVivo {
  /** quem bateu ponto hoje e existe no Comandra */
  emPlantao: PessoaAoVivo[];
  /** bateu ponto e NÃO tem cadastro — o gerente cria o login daqui */
  semCadastro: PessoaAoVivo[];
  /** cadastrado, não bateu ponto */
  ausentes: PessoaAoVivo[];
  totais: { checkins: number; visitas: number; vendas: number };
  /** quando o job do VPS gravou pela última vez */
  atualizadoEm: string | null;
  /** id do gerente logado dentro da Cury; null = não casou o de-para */
  gerenteCuryId: string | null;
}

const hojeISO = () => {
  // O dado da Cury é carimbado em data de São Paulo, não UTC. Perto da
  // meia-noite os dois divergem e a tela mostraria o dia errado.
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return f.format(new Date());
};

export function useAoVivo(managerId: string | undefined, dia?: string) {
  const data = dia ?? hojeISO();

  return useQuery<AoVivo>({
    queryKey: ["ao-vivo", managerId, data],
    enabled: !!managerId,
    // O job grava de 30 em 30 min; buscar mais que isso é gastar à toa.
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    queryFn: async () => {
      const vazio: AoVivo = {
        emPlantao: [], semCadastro: [], ausentes: [],
        totais: { checkins: 0, visitas: 0, vendas: 0 },
        atualizadoEm: null, gerenteCuryId: null,
      };

      // 1) Quem sou eu dentro da Cury? O de-para liga profile → cury_id.
      const { data: euNaCury } = await supabase
        .from("cury_pessoas")
        .select("cury_id")
        .eq("escopo", "gerente")
        .eq("profile_id", managerId!)
        .maybeSingle();

      const gerenteCuryId = (euNaCury as any)?.cury_id ?? null;
      if (!gerenteCuryId) return vazio;

      // 2) O movimento de hoje, só da minha equipe.
      const { data: linhas } = await supabase
        .from("cury_metricas_diarias")
        .select("cury_id,nome,apelido,checkins,atendimentos,vendas,profile_id,atualizado_em")
        .eq("data", data)
        .eq("escopo", "corretor")
        .eq("gerente_cury_id", gerenteCuryId);

      // 3) Quem é da minha equipe no Comandra — inclusive quem não bateu ponto.
      const { data: meuTime } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,lead_assignment_enabled,bot_instance_id,last_seen_at")
        .eq("manager_id", managerId!)
        .eq("role", "BROKER");

      // 4) Estado real dos chips. `status` mente (fica "connecting" em chip
      //    morto); só `real_state` vale.
      const ids = (meuTime ?? []).map((p: any) => p.bot_instance_id).filter(Boolean);
      const { data: chips } = ids.length
        ? await supabase
            .from("bot_instances")
            .select("id,real_state,status")
            .in("id", ids)
        : { data: [] as any[] };

      const chipPor = new Map<string, any>((chips ?? []).map((c: any) => [c.id, c]));
      const perfilPor = new Map<string, any>((meuTime ?? []).map((p: any) => [p.id, p]));

      const monta = (l: any): PessoaAoVivo => {
        const p = l.profile_id ? perfilPor.get(l.profile_id) : null;
        const chip = p?.bot_instance_id ? chipPor.get(p.bot_instance_id) : null;
        return {
          curyId: l.cury_id,
          nome: l.nome, apelido: l.apelido,
          profileId: l.profile_id ?? null,
          checkins: l.checkins ?? 0,
          visitas: l.atendimentos ?? 0,
          vendas: l.vendas ?? 0,
          recebeLead: p ? !!p.lead_assignment_enabled : null,
          chipVivo: chip ? chip.real_state === "open" : (p ? false : null),
          chipEstado: chip?.real_state ?? null,
          botInstanceId: p?.bot_instance_id ?? null,
          ultimaVez: p?.last_seen_at ?? null,
        };
      };

      const comMovimento = (linhas ?? []).map(monta);
      // Bateu ponto = tem check-in hoje. Linha sem check-in é só ruído do job.
      const bateram = comMovimento.filter((x) => x.checkins > 0);

      const emPlantao = bateram.filter((x) => x.profileId);
      const semCadastro = bateram.filter((x) => !x.profileId);

      const presentes = new Set(emPlantao.map((x) => x.profileId));
      const ausentes: PessoaAoVivo[] = (meuTime ?? [])
        .filter((p: any) => !presentes.has(p.id))
        .map((p: any) => {
          const chip = p.bot_instance_id ? chipPor.get(p.bot_instance_id) : null;
          return {
            curyId: "", nome: [p.first_name, p.last_name].filter(Boolean).join(" "),
            apelido: p.first_name, profileId: p.id,
            checkins: 0, visitas: 0, vendas: 0,
            recebeLead: !!p.lead_assignment_enabled,
            chipVivo: chip ? chip.real_state === "open" : false,
            chipEstado: chip?.real_state ?? null,
            botInstanceId: p.bot_instance_id ?? null,
            ultimaVez: p.last_seen_at ?? null,
          };
        });

      const soma = (xs: PessoaAoVivo[], f: (x: PessoaAoVivo) => number) =>
        xs.reduce((a, x) => a + f(x), 0);

      return {
        emPlantao: emPlantao.sort((a, b) => b.visitas - a.visitas || b.checkins - a.checkins),
        semCadastro,
        ausentes: ausentes.sort((a, b) =>
          (a.nome ?? "").localeCompare(b.nome ?? "")),
        totais: {
          checkins: soma(bateram, (x) => x.checkins),
          visitas: soma(bateram, (x) => x.visitas),
          vendas: soma(bateram, (x) => x.vendas),
        },
        atualizadoEm: (linhas ?? []).reduce<string | null>(
          (m, l: any) => (!m || l.atualizado_em > m ? l.atualizado_em : m), null),
        gerenteCuryId,
      };
    },
  });
}

/** Liga/desliga o corretor no rodízio. A tela SUGERE, o gerente decide — foi
 *  decisão do Junior (14/09): ligar sozinho faria o sistema distribuir lead pra
 *  quem o gerente não conferiu. */
export async function definirRecebeLead(profileId: string, receber: boolean) {
  const { error } = await supabase
    .from("profiles")
    .update({ lead_assignment_enabled: receber })
    .eq("id", profileId);
  if (error) throw error;
}
