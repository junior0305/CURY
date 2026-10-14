// Escopo do superintendente: as superintendências que a tela enxerga (a dele; diretor/admin vê todas)
// e as pastas do Junix que são dessas equipes.
//
// O Junix tem a própria árvore (ex.: a Ester, corretora do Dudu no Comandra, aparece no Junix embaixo
// do gerente Adajes, e a Liliane não aparece como superintendente). Para o super, quem manda é a equipe
// no Comandra: a pasta é dele se o CORRETOR da pasta é de uma das equipes dele; senão, se o gerente
// casa pelo nome. A pasta sai reetiquetada com o gerente e o super do Comandra, para os painéis da
// diretoria (PastasPainel, donoJunix) agruparem certo.
import { useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useDiretorId, useDiretoria, chaveGerente, type SuperDiretoria, type PastaJunix } from "@/hooks/useDiretoria";

const chaveNome = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").trim().split(/\s+/).filter(Boolean);

export function useEscopoSuper(superId: string | undefined, dias = 30) {
  const { role, session } = useAuth();
  const { data: diretorId } = useDiretorId(role, session?.user?.id);
  const q = useDiretoria(diretorId, dias);
  const todos = q.data?.supers ?? [];
  const supers: SuperDiretoria[] = useMemo(() => {
    const meu = todos.filter((s) => s.id === superId);
    return meu.length ? meu : todos; // diretor/admin (superId = diretor): todas
  }, [todos, superId]);

  const pastas: PastaJunix[] = useMemo(() => {
    const brutas = q.data?.pastas ?? [];
    // corretor do Comandra → [super, gerente], pelo primeiro + último nome
    const porCorretor: { primeiro: string; ultimo: string; s: SuperDiretoria; g: { id: string; nome: string } }[] = [];
    for (const s of supers) for (const g of s.gerentes) for (const c of g.corretores_lista ?? []) {
      const t = chaveNome(c.nome);
      if (t.length) porCorretor.push({ primeiro: t[0], ultimo: t[t.length - 1], s, g: { id: g.id, nome: g.nome } });
    }
    const out: PastaJunix[] = [];
    for (const p of brutas) {
      const t = chaveNome(p.corretor);
      let dono = t.length ? porCorretor.find((x) => x.primeiro === t[0] && (t.length === 1 || x.ultimo === t[t.length - 1] || x.primeiro === x.ultimo)) : undefined;
      if (!dono) {
        const kg = chaveGerente(p.gerente);
        for (const s of supers) { const g = s.gerentes.find((x) => chaveGerente(x.nome) === kg); if (g) { dono = { primeiro: "", ultimo: "", s, g: { id: g.id, nome: g.nome } }; break; } }
      }
      if (dono) out.push({ ...p, gerente: dono.g.nome, superintendente: dono.s.nome });
    }
    return out;
  }, [q.data?.pastas, supers]);

  return { diretorId: diretorId ?? null, supers, pastas, carregando: q.isLoading, dados: q.data };
}
