// PASTAS — Controle de propostas no Junix e crédito Caixa por cadeia de comando.
//
// Regras Estritas de Visibilidade da Operação:
// 1. Gerente (MANAGER): Vê APENAS as pastas da sua equipe (seus corretores + pastas com seu nome no Junix).
//    Zero propostas de outras equipes.
// 2. Superintendente (SUPERINTENDENT): Vê todas as propostas dos gerentes e corretores da sua superintendência.
//    Não vê propostas de outras superintendências.
// 3. Diretor (DIRECTOR / ADMIN): Vê toda a cadeia abaixo dele (todas as superintendências, gerentes e corretores).

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
  corretor: string | null;
  gerenteId: string | null;
  gerenteNome: string | null;
  superintendenteNome: string | null;
  daEquipe: boolean;
}

export interface DadosPastas {
  /** pastas autorizadas para o escopo do usuário logado */
  minhas: Pasta[];
  /** sempre vazio para gerente/super para garantir zero vazamento de dados */
  semDono: Pasta[];
  /** etapas na ordem do kanban, com contagem das MINHAS */
  etapas: { etapa: string; ordem: number; n: number; travadas: number }[];
  porCorretor: {
    id: string | null;
    nome: string;
    total: number;
    travadas: number;
    porEtapa: { etapa: string; n: number }[];
  }[];
  /** lista de gerentes do escopo para filtro rápido (Superintendente / Diretor) */
  gerentesLista: { id: string; nome: string; total: number }[];
  atualizadoEm: string | null;
  papelUsuario: "MANAGER" | "SUPERINTENDENT" | "DIRECTOR" | "ADMIN" | "BROKER";
  escopoTitulo: string;
}

/** Sem acento, maiúsculo, espaço único. O Junix grava tudo em CAIXA ALTA. */
export const normNome = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

/** Gerente no Junix: apelidos mapeados (ex.: "OTAVIONETO" = Jaguar no Comandra). */
const APELIDO_GER: Record<string, string> = { OTAVIONETO: "JAGUAR" };
const chaveGer = (g: string | null | undefined) => {
  const k = normNome(g ?? "").replace(/\s/g, "");
  return APELIDO_GER[k] ?? chave(g);
};

const titulo = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export function usePastas(managerId: string | undefined) {
  return useQuery<DadosPastas>({
    queryKey: ["pastas", managerId],
    enabled: !!managerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // 1. Identificar usuário atual e seu papel na hierarquia
      const { data: eu } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,role,manager_id")
        .eq("id", managerId!)
        .maybeSingle();

      const papel = (((eu as any)?.role ?? "MANAGER") as string).toUpperCase() as
        | "MANAGER"
        | "SUPERINTENDENT"
        | "DIRECTOR"
        | "ADMIN"
        | "BROKER";

      const isDirector = papel === "DIRECTOR" || papel === "ADMIN";
      const isSuper = papel === "SUPERINTENDENT";
      const isManager = papel === "MANAGER";
      const isBroker = papel === "BROKER";

      // 2. Mapear a árvore de pessoas autorizadas sob este usuário
      let brokers: { id: string; first_name: string | null; last_name: string | null; manager_id?: string | null }[] = [];
      let gerentes: { id: string; first_name: string | null; last_name: string | null; manager_id?: string | null }[] = [];
      let supers: { id: string; first_name: string | null; last_name: string | null }[] = [];

      if (isBroker) {
        brokers = [eu as any];
      } else if (isManager) {
        gerentes = [eu as any];
        const { data: cors } = await supabase
          .from("profiles")
          .select("id,first_name,last_name,manager_id")
          .eq("manager_id", managerId!)
          .eq("is_active", true);
        brokers = (cors ?? []) as any[];
      } else if (isSuper) {
        supers = [eu as any];
        const { data: gers } = await supabase
          .from("profiles")
          .select("id,first_name,last_name,role,manager_id")
          .eq("manager_id", managerId!)
          .eq("is_active", true);
        gerentes = (gers ?? []) as any[];
        if (gerentes.length) {
          const { data: cors } = await supabase
            .from("profiles")
            .select("id,first_name,last_name,manager_id")
            .in("manager_id", gerentes.map((g) => g.id))
            .eq("is_active", true);
          brokers = (cors ?? []) as any[];
        }
      } else {
        // Director / Admin: carrega superintendentes, gerentes e corretores
        const { data: sups } = await supabase
          .from("profiles")
          .select("id,first_name,last_name,role")
          .eq("role", "SUPERINTENDENT")
          .eq("is_active", true);
        supers = (sups ?? []) as any[];

        const { data: gers } = await supabase
          .from("profiles")
          .select("id,first_name,last_name,role,manager_id")
          .eq("role", "MANAGER")
          .eq("is_active", true);
        gerentes = (gers ?? []) as any[];

        const { data: cors } = await supabase
          .from("profiles")
          .select("id,first_name,last_name,manager_id")
          .eq("role", "BROKER")
          .eq("is_active", true);
        brokers = (cors ?? []) as any[];
      }

      // 3. Buscar vínculos confirmados de nomes para corretores (econ_vinculos)
      const vinculosMap = new Map<string, string>(); // nome_chave -> profile_id
      const gerentesIds = gerentes.map((g) => g.id);
      if (gerentesIds.length) {
        const { data: vincs } = await supabase
          .from("econ_vinculos" as any)
          .select("nome_chave,profile_id,gerente_id")
          .in("gerente_id", gerentesIds)
          .eq("acao", "corretor");
        if (vincs) {
          for (const v of vincs as any[]) {
            if (v.nome_chave && v.profile_id) {
              vinculosMap.set(normNome(v.nome_chave), v.profile_id);
              vinculosMap.set(chave(v.nome_chave), v.profile_id);
            }
          }
        }
      }

      // 4. Mapas rápidos de corretores
      const nomes = new Map<string, string>();
      for (const b of brokers) {
        nomes.set(b.id, [b.first_name, b.last_name].filter(Boolean).join(" ") || "sem nome");
      }
      const porPrimeiro = new Map<string, string>();
      for (const b of brokers) {
        const c = chave(b.first_name);
        if (c) porPrimeiro.set(c, b.id);
      }

      // 5. Tokens de Gerentes do escopo
      const tokensGerentes = new Set<string>();
      for (const g of gerentes) {
        const f = chave(g.first_name);
        const l = chave(g.last_name);
        const ap = chaveGer(g.first_name);
        if (f && f.length >= 3) tokensGerentes.add(f);
        if (l && l.length >= 3) tokensGerentes.add(l);
        if (ap && ap.length >= 3) tokensGerentes.add(ap);
      }

      // 6. Tokens de Superintendentes do escopo
      const tokensSupers = new Set<string>();
      if (isSuper) {
        const f = normNome((eu as any)?.first_name).replace(/\s/g, "");
        const l = normNome((eu as any)?.last_name).replace(/\s/g, "");
        if (f.length >= 3) tokensSupers.add(f);
        if (l.length >= 3) tokensSupers.add(l);
      } else if (isDirector) {
        for (const s of supers) {
          const f = normNome(s.first_name).replace(/\s/g, "");
          const l = normNome(s.last_name).replace(/\s/g, "");
          if (f.length >= 3) tokensSupers.add(f);
          if (l.length >= 3) tokensSupers.add(l);
        }
        const fEu = normNome((eu as any)?.first_name).replace(/\s/g, "");
        if (fEu.length >= 3) tokensSupers.add(fEu);
      }

      const doMeuGerente = (g: string | null) => {
        if (!g) return false;
        const k = chaveGer(g);
        if (tokensGerentes.has(k)) return true;
        const norm = normNome(g);
        for (const t of tokensGerentes) {
          if (norm.includes(t)) return true;
        }
        return false;
      };

      const daMinhaSuper = (sp: string | null) => {
        if (!sp) return false;
        const norm = normNome(sp).replace(/\s/g, "");
        for (const t of tokensSupers) {
          if (norm.includes(t)) return true;
        }
        return false;
      };

      // 7. Buscar todas as propostas no espelho junix_pastas
      const pastas = await todas<any>((de, ate) =>
        supabase
          .from("junix_pastas" as any)
          .select("proposta_id,cliente,etapa,etapa_ordem,status_texto,dias,fluxo,atualizado_em,corretor,gerente,superintendente")
          .order("proposta_id")
          .range(de, ate)
      );

      // 8. Filtrar com RIGOR ABSOLUTO segundo o papel do usuário
      const pastasEscopo: Pasta[] = [];

      for (const r of pastas) {
        const chaveCorretor = chave(r.corretor);
        const normCorretor = normNome(r.corretor);
        const corretorId =
          vinculosMap.get(normCorretor) ??
          vinculosMap.get(chaveCorretor) ??
          porPrimeiro.get(chaveCorretor) ??
          null;

        const ehMeuGerente = doMeuGerente(r.gerente);
        const ehMinhaSuper = daMinhaSuper(r.superintendente);
        const ehMeuCorretor = !!corretorId;

        let pertence = false;

        if (isBroker) {
          pertence = corretorId === eu?.id;
        } else if (isManager) {
          // GERENTE: Vê estritamente as propostas onde é o gerente OU corretor é da sua equipe
          pertence = ehMeuGerente || ehMeuCorretor;
        } else if (isSuper) {
          // SUPERINTENDENTE: Vê estritamente as propostas da sua superintendência, seus gerentes ou seus corretores
          pertence = ehMinhaSuper || ehMeuGerente || ehMeuCorretor;
        } else {
          // DIRETOR / ADMIN: Vê toda a cadeia abaixo dele
          pertence = isDirector || ehMinhaSuper || ehMeuGerente || ehMeuCorretor;
        }

        if (!pertence) {
          // DESCARTADO! Não vaza para outras equipes!
          continue;
        }

        pastasEscopo.push({
          id: String(r.proposta_id),
          cliente: r.cliente ?? "sem nome",
          etapa: r.etapa ?? "sem etapa",
          etapaOrdem: r.etapa_ordem ?? -1,
          status: r.status_texto || null,
          dias: r.dias ?? 0,
          fluxo: r.fluxo || null,
          corretorId,
          corretor: corretorId ? nomes.get(corretorId) ?? null : (r.corretor ? titulo(r.corretor) : null),
          gerenteId: null,
          gerenteNome: r.gerente ? titulo(r.gerente) : null,
          superintendenteNome: r.superintendente ? titulo(r.superintendente) : null,
          daEquipe: true,
        });
      }

      // Ordenar: mais parada primeiro
      pastasEscopo.sort((a, b) => b.dias - a.dias);
      const minhas = pastasEscopo;
      // semDono é sempre vazio para garantir que ninguém veja outras equipes
      const semDono: Pasta[] = [];

      // Ordem do kanban
      const ord = (o: number) => (o < 0 ? 9999 : o);
      const etapaMap = new Map<string, { etapa: string; ordem: number; n: number; travadas: number }>();
      for (const x of minhas) {
        const e = etapaMap.get(x.etapa) ?? { etapa: x.etapa, ordem: x.etapaOrdem, n: 0, travadas: 0 };
        e.n++;
        if (x.dias >= DIAS_TRAVADA) e.travadas++;
        etapaMap.set(x.etapa, e);
      }
      const etapas = [...etapaMap.values()].sort((a, b) => ord(a.ordem) - ord(b.ordem));
      const posEtapa = new Map(etapas.map((e, i) => [e.etapa, i]));

      // Resumo por corretor da equipe
      const corMap = new Map<string, DadosPastas["porCorretor"][number]>();
      for (const x of minhas) {
        const k = x.corretorId ?? x.corretor ?? "sem_corretor";
        const c = corMap.get(k) ?? {
          id: x.corretorId,
          nome: x.corretor ?? "Sem corretor no Comandra",
          total: 0,
          travadas: 0,
          porEtapa: [],
        };
        c.total++;
        if (x.dias >= DIAS_TRAVADA) c.travadas++;
        const e = c.porEtapa.find((y) => y.etapa === x.etapa);
        if (e) e.n++;
        else c.porEtapa.push({ etapa: x.etapa, n: 1 });
        corMap.set(k, c);
      }
      const porCorretor = [...corMap.values()]
        .map((c) => ({
          ...c,
          porEtapa: c.porEtapa.sort((a, b) => (posEtapa.get(a.etapa) ?? 0) - (posEtapa.get(b.etapa) ?? 0)),
        }))
        .sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.total - a.total);

      // Lista de gerentes das propostas (útil para filtro do Super ou Diretor)
      const gerMap = new Map<string, number>();
      for (const p of minhas) {
        const gNome = p.gerenteNome || "Equipe Direta";
        gerMap.set(gNome, (gerMap.get(gNome) || 0) + 1);
      }
      const gerentesLista = [...gerMap.entries()]
        .map(([nome, total]) => ({ id: nome, nome, total }))
        .sort((a, b) => b.total - a.total);

      const atualizadoEm = pastas.reduce<string | null>(
        (m, r) => (r.atualizado_em && (!m || r.atualizado_em > m) ? r.atualizado_em : m),
        null
      );

      const escopoTitulo = isDirector
        ? "Diretoria"
        : isSuper
        ? `Superintendência ${eu?.first_name || ""}`
        : `Equipe ${eu?.first_name || ""}`;

      return {
        minhas,
        semDono,
        etapas,
        porCorretor,
        gerentesLista,
        atualizadoEm,
        papelUsuario: papel,
        escopoTitulo,
      };
    },
  });
}
