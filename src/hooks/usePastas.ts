// PASTAS — quais propostas a equipe tem no Junix, em que etapa, e há quanto
// tempo paradas.
//
// Fonte: junix_pastas, espelho de hora em hora do kanban do Junix. O dono
// (corretor, gerente, superintendência) vem da Pesquisa de Proposta do Junix,
// gravado na mesma tabela pelo conector /root/junix/pastas.py.
//
// Gerente vê as pastas do seu nome; super vê a superintendência inteira.
// O resto da diretoria fica em "outras equipes" — nada some.

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

/** 1º nome sem acento, sem o sufixo " BN" do Junix/C2S. */
const chave = (s: string | null | undefined) =>
  normNome(s ?? "").replace(/\bBN\b/g, "").trim().split(" ")[0] ?? "";
/** Gerente no Junix: "DAIMON ", "OTAVIONETO" (= Jaguar no Comandra). */
const APELIDO_GER: Record<string, string> = { OTAVIONETO: "JAGUAR" };
const chaveGer = (g: string | null | undefined) => {
  const k = normNome(g ?? "").replace(/\s/g, "");
  return APELIDO_GER[k] ?? chave(g);
};
const titulo = (s: string) => s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function usePastas(managerId: string | undefined) {
  return useQuery<DadosPastas>({
    queryKey: ["pastas", managerId],
    enabled: !!managerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: eu }, { data: equipe }] = await Promise.all([
        supabase.from("profiles").select("first_name,last_name,role").eq("id", managerId!).maybeSingle(),
        supabase.from("profiles").select("id,first_name").eq("manager_id", managerId!),
      ]);
      // Super: a equipe dele são gerentes; os corretores estão um nível abaixo.
      let gente = (equipe ?? []) as any[];
      if (["SUPERINTENDENT", "DIRECTOR", "ADMIN"].includes((eu as any)?.role ?? "") && gente.length) {
        const { data: cors } = await supabase.from("profiles").select("id,first_name")
          .in("manager_id", gente.map((g) => g.id));
        gente = [...gente, ...((cors ?? []) as any[])];
      }
      const nomes = new Map<string, string>(
        gente.map((p) => [p.id, (p.first_name ?? "").trim() || "sem nome"]));
      // corretor do Junix ("GALILEIA BN") → profile da equipe, pelo 1º nome
      const porPrimeiro = new Map<string, string>();
      for (const [id, n] of nomes) porPrimeiro.set(chave(n), id);

      const pastas = await todas<any>((de, ate) => supabase.from("junix_pastas" as any)
        .select("proposta_id,cliente,etapa,etapa_ordem,status_texto,dias,fluxo,atualizado_em,corretor,gerente,superintendente")
        .order("proposta_id").range(de, ate));

      // Dono vem do próprio Junix (Pesquisa de Proposta): gerente e superintendência
      // por pasta. Gerente vê as do seu nome; super vê a superintendência inteira.
      const meus = [chave((eu as any)?.first_name), chave((eu as any)?.last_name)].filter((t) => t.length >= 3);
      const ehSuper = ["SUPERINTENDENT", "DIRECTOR", "ADMIN"].includes((eu as any)?.role ?? "");
      const doGerente = (g: string | null) => { const k = chaveGer(g); return !!k && meus.includes(k); };
      const daSuper = (sp: string | null) => { const k = normNome(sp).replace(/\s/g, ""); return meus.some((t) => k.includes(t)); };

      const todasPastas: Pasta[] = pastas.map((r) => {
        const corretorId = porPrimeiro.get(chave(r.corretor)) ?? null;
        return {
          id: r.proposta_id, cliente: r.cliente ?? "sem nome",
          etapa: r.etapa ?? "sem etapa", etapaOrdem: r.etapa_ordem ?? -1,
          status: r.status_texto || null, dias: r.dias ?? 0, fluxo: r.fluxo || null,
          corretorId,
          corretor: corretorId ? nomes.get(corretorId) ?? null : (r.corretor ? titulo(r.corretor) : null),
          daEquipe: doGerente(r.gerente) || (ehSuper && daSuper(r.superintendente)) || !!corretorId,
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
