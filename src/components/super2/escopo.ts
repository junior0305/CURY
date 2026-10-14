// Escopo do superintendente: as superintendências que a tela enxerga (a dele; diretor/admin vê todas)
// e as pastas do Junix que são dessas equipes.
//
// O Junix tem a própria árvore (ex.: a Ester, corretora do Dudu no Comandra, aparece no Junix embaixo
// do gerente Adajes, e a Liliane não aparece como superintendente). Para o super, quem manda é a equipe
// no Comandra: a pasta é dele se o CORRETOR da pasta é de uma das equipes dele; senão, se o gerente
// casa pelo nome. A pasta sai reetiquetada com o gerente e o super do Comandra, para os painéis da
// diretoria (PastasPainel, donoJunix) agruparem certo.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import {
  useDiretorId,
  useDiretoria,
  chaveGerente,
  colado,
  superJunix,
  type SuperDiretoria,
  type PastaJunix,
} from "@/hooks/useDiretoria";

const chaveNome = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

export function useEscopoSuper(superId: string | undefined, dias = 30) {
  const { role, session } = useAuth();
  const { data: diretorId } = useDiretorId(role, session?.user?.id);
  const q = useDiretoria(diretorId, dias);

  // Busca direta como garantia de resiliência caso useDiretoria demore ou falhe
  const { data: pastasDiretas } = useQuery({
    queryKey: ["junix-pastas-escopo-super"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("junix_pastas" as any)
        .select("proposta_id,cliente,etapa,dias,corretor,gerente,superintendente,empreendimento,status_texto,cadastrada_em");
      return ((data ?? []) as unknown) as PastaJunix[];
    },
  });

  const todos = q.data?.supers ?? [];
  const ehDiretoria = role === "DIRECTOR" || role === "ADMIN";

  const supers: SuperDiretoria[] = useMemo(() => {
    if (!todos.length) return [];
    if (ehDiretoria && (!superId || superId === diretorId)) {
      return todos;
    }
    const meu = todos.filter((s) => s.id === superId);
    return meu.length ? meu : todos;
  }, [todos, superId, ehDiretoria, diretorId]);

  const pastas: PastaJunix[] = useMemo(() => {
    const brutas = (q.data?.pastas && q.data.pastas.length > 0) ? q.data.pastas : (pastasDiretas ?? []);
    if (!brutas.length) return [];

    // Mapeamento de corretores das superintendências no escopo
    const porCorretor: {
      primeiro: string;
      ultimo: string;
      s: SuperDiretoria;
      g: { id: string; nome: string };
    }[] = [];

    for (const s of supers) {
      for (const g of s.gerentes) {
        for (const c of g.corretores_lista ?? []) {
          const t = chaveNome(c.nome);
          if (t.length) {
            porCorretor.push({
              primeiro: t[0],
              ultimo: t[t.length - 1],
              s,
              g: { id: g.id, nome: g.nome },
            });
          }
        }
      }
    }

    const out: PastaJunix[] = [];

    for (const p of brutas) {
      let dono: { s: SuperDiretoria | { id: string; nome: string }; g: { id?: string | null; nome: string } } | undefined;

      // 1. Casa por corretor da equipe no Comandra
      const t = chaveNome(p.corretor);
      if (t.length) {
        const achado = porCorretor.find(
          (x) =>
            x.primeiro === t[0] &&
            (t.length === 1 || x.ultimo === t[t.length - 1] || x.primeiro === x.ultimo)
        );
        if (achado) {
          dono = { s: achado.s, g: achado.g };
        }
      }

      // 2. Senão, casa pelo gerente da equipe no Comandra
      if (!dono && p.gerente) {
        const kg = chaveGerente(p.gerente);
        for (const s of supers) {
          const g = s.gerentes.find((x) => chaveGerente(x.nome) === kg);
          if (g) {
            dono = { s, g: { id: g.id, nome: g.nome } };
            break;
          }
        }
      }

      // 3. Senão, casa pela superintendência (tokens / apelidos)
      if (!dono && p.superintendente) {
        const ks = colado(superJunix(p.superintendente));
        for (const s of supers) {
          if (s.tokens && s.tokens.some((tok) => ks.includes(tok))) {
            dono = { s, g: { id: null, nome: p.gerente || "Sem gerente" } };
            break;
          }
        }
      }

      // 4. Se for Diretor/Admin vendo a visão geral, inclui também as pastas que não casaram com nenhuma super específica
      if (!dono && ehDiretoria && (!superId || superId === diretorId)) {
        dono = {
          s: { id: "outros", nome: p.superintendente || "Outros" },
          g: { id: null, nome: p.gerente || "Sem gerente" },
        };
      }

      if (dono) {
        out.push({
          ...p,
          gerente: dono.g.nome,
          superintendente: dono.s.nome,
        });
      }
    }

    return out;
  }, [q.data?.pastas, pastasDiretas, supers, ehDiretoria, superId, diretorId]);

  return {
    diretorId: diretorId ?? null,
    supers,
    pastas,
    carregando: q.isLoading && !pastasDiretas,
    dados: q.data,
  };
}
