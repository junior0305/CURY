// PASTAS — quais propostas a equipe tem no Junix, em que etapa, e há quanto
// tempo paradas.
//
// Fonte: junix_pastas, espelho de hora em hora do kanban do Junix. O kanban
// não diz de quem é a pasta — só o nome do cliente. A atribuição sai daqui:
// casa o nome do cliente com os leads da equipe no Comandra.
//
//   1. nome normalizado idêntico        → casou
//   2. primeiro E último nome iguais    → casou (pega "MARIA S. SOUZA" x "MARIA SOUZA")
//
// O que não casa com ninguém NÃO some: vai para "sem dono identificado", que
// todo gestor vê. Esconder pasta por falha de nome é pior que mostrar a mais.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Pasta parada há esse tanto de dias na mesma etapa merece cobrança. */
export const DIAS_TRAVADA = 7;

export interface Pasta {
  id: string;
  cliente: string;
  etapa: string;
  etapaOrdem: number;
  status: string | null;
  dias: number;
  fluxo: string | null;
  corretorId: string | null;
  /** first_name do corretor; null = lead sem corretor ou pasta sem lead */
  corretor: string | null;
  /** casou com algum lead da equipe */
  daEquipe: boolean;
}

export interface DadosPastas {
  /** pastas casadas com leads da equipe */
  minhas: Pasta[];
  /** pastas que não casaram com lead de ninguém da equipe */
  semDono: Pasta[];
  /** etapas na ordem do kanban, com contagem das MINHAS */
  etapas: { etapa: string; ordem: number; n: number; travadas: number }[];
  porCorretor: { id: string | null; nome: string; total: number; travadas: number;
    porEtapa: { etapa: string; n: number }[] }[];
  /** max(atualizado_em) — quando o espelho rodou pela última vez */
  atualizadoEm: string | null;
}

/** Sem acento, maiúsculo, espaço único. O Junix grava tudo em CAIXA ALTA. */
export const normNome = (s: string | null) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();

const pontas = (n: string) => {
  const t = n.split(" ");
  return t.length >= 2 ? `${t[0]}|${t[t.length - 1]}` : null;
};

/** PostgREST corta em 1000 linhas: pagina até acabar. */
async function todas<T>(q: (de: number, ate: number) => PromiseLike<{ data: unknown; error: any }>) {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q(de, de + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

type LeadRow = { name: string | null; broker_id: string | null; created_at: string };

export function usePastas(managerId: string | undefined) {
  return useQuery<DadosPastas>({
    queryKey: ["pastas", managerId],
    enabled: !!managerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: equipe } = await supabase.from("profiles")
        .select("id,first_name").eq("manager_id", managerId!);
      const nomes = new Map<string, string>(
        ((equipe ?? []) as any[]).map((p) => [p.id, (p.first_name ?? "").trim() || "sem nome"]));
      const ids = [...nomes.keys()];

      // Leads da equipe: os do gerente e os dos corretores dele. O `or` com
      // in.(...) fica num pedido só; sem corretor, basta o manager_id.
      const filtro = ids.length
        ? `manager_id.eq.${managerId},broker_id.in.(${ids.join(",")})`
        : `manager_id.eq.${managerId}`;

      const [leads, pastas] = await Promise.all([
        todas<LeadRow>((de, ate) => supabase.from("leads")
          .select("name,broker_id,created_at").or(filtro)
          .order("created_at", { ascending: false }).range(de, ate)),
        todas<any>((de, ate) => supabase.from("junix_pastas" as any)
          .select("proposta_id,cliente,etapa,etapa_ordem,status_texto,dias,fluxo,atualizado_em")
          .order("proposta_id").range(de, ate)),
      ]);

      // Índices de nome → corretor. Lead mais novo primeiro: se o mesmo cliente
      // entrou duas vezes, vale quem atende agora. Lead com corretor vence lead
      // sem corretor, senão um cadastro antigo "sem dono" apagaria a atribuição.
      const exato = new Map<string, string | null>();
      const porPontas = new Map<string, string | null>();
      const guarda = (m: Map<string, string | null>, k: string, b: string | null) => {
        if (!m.has(k) || (m.get(k) === null && b)) m.set(k, b);
      };
      for (const l of leads) {
        const n = normNome(l.name);
        if (!n) continue;
        guarda(exato, n, l.broker_id);
        const p = pontas(n);
        if (p) guarda(porPontas, p, l.broker_id);
      }

      const todasPastas: Pasta[] = pastas.map((r) => {
        const n = normNome(r.cliente);
        const p = pontas(n);
        const achou = exato.has(n) ? exato.get(n)! : p && porPontas.has(p) ? porPontas.get(p)! : undefined;
        const corretorId = achou ?? null;
        return {
          id: r.proposta_id, cliente: r.cliente ?? "sem nome",
          etapa: r.etapa ?? "sem etapa", etapaOrdem: r.etapa_ordem ?? -1,
          status: r.status_texto || null, dias: r.dias ?? 0, fluxo: r.fluxo || null,
          corretorId,
          corretor: corretorId ? nomes.get(corretorId) ?? null : null,
          daEquipe: achou !== undefined,
        };
      });

      // Mais parada primeiro: é por ela que a conversa com o corretor começa.
      todasPastas.sort((a, b) => b.dias - a.dias);
      const minhas = todasPastas.filter((x) => x.daEquipe);
      const semDono = todasPastas.filter((x) => !x.daEquipe);

      // Ordem do kanban; etapa desconhecida (-1) vai para o fim.
      const ord = (o: number) => (o < 0 ? 9999 : o);
      const etapaMap = new Map<string, { etapa: string; ordem: number; n: number; travadas: number }>();
      for (const x of minhas) {
        const e = etapaMap.get(x.etapa) ?? { etapa: x.etapa, ordem: x.etapaOrdem, n: 0, travadas: 0 };
        e.n++; if (x.dias >= DIAS_TRAVADA) e.travadas++;
        etapaMap.set(x.etapa, e);
      }
      const etapas = [...etapaMap.values()].sort((a, b) => ord(a.ordem) - ord(b.ordem));
      const posEtapa = new Map(etapas.map((e, i) => [e.etapa, i]));

      const corMap = new Map<string, DadosPastas["porCorretor"][number]>();
      for (const x of minhas) {
        const k = x.corretorId ?? "";
        const c = corMap.get(k) ?? {
          id: x.corretorId, nome: x.corretor ?? "sem corretor no Comandra",
          total: 0, travadas: 0, porEtapa: [],
        };
        c.total++; if (x.dias >= DIAS_TRAVADA) c.travadas++;
        const e = c.porEtapa.find((y) => y.etapa === x.etapa);
        if (e) e.n++; else c.porEtapa.push({ etapa: x.etapa, n: 1 });
        corMap.set(k, c);
      }
      const porCorretor = [...corMap.values()]
        .map((c) => ({ ...c, porEtapa: c.porEtapa.sort((a, b) =>
          (posEtapa.get(a.etapa) ?? 0) - (posEtapa.get(b.etapa) ?? 0)) }))
        // "sem corretor" por último: não é alguém para cobrar.
        .sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.total - a.total);

      const atualizadoEm = pastas.reduce<string | null>(
        (m, r) => (r.atualizado_em && (!m || r.atualizado_em > m) ? r.atualizado_em : m), null);

      return { minhas, semDono, etapas, porCorretor, atualizadoEm };
    },
  });
}
