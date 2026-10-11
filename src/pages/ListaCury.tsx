// Lista de clientes da base que baixamos do app da Cury (visitantes de plantão,
// 2023–2025, ~19 mil). Página de IMPRESSÃO: filtra e manda para a impressora.
// Só ADMIN abre a página (a tabela cury_clientes tem RLS para admin/diretor).
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

type Cliente = { nome: string | null; celular: string | null; telefone: string | null;
  corretor_apelido: string | null; imovel_nome: string | null; plantao_criado: string | null };
type Colunas = "nome" | "nome_tel" | "tudo";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const anoDe = (d: string | null) => (d ?? "").slice(-4);
const fone = (c: Cliente) => c.celular || c.telefone || "";
const titulo = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());

export default function ListaCury() {
  const { session, role, loading } = useAuth();
  const [empreendimento, setEmpreendimento] = useState("");
  const [corretor, setCorretor] = useState("");
  const [ano, setAno] = useState("");
  const [busca, setBusca] = useState("");
  const [colunas, setColunas] = useState<Colunas>("nome_tel");
  const [unicos, setUnicos] = useState(true);

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["lista-cury"],
    enabled: role === "ADMIN",
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const out: Cliente[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from("cury_clientes" as any)
          .select("nome,celular,telefone,corretor_apelido,imovel_nome,plantao_criado")
          .order("cury_id").range(de, de + 999);
        if (error) throw error;
        out.push(...((data ?? []) as Cliente[]));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });

  const opcoes = useMemo(() => {
    const conta = (f: (c: Cliente) => string) => {
      const m = new Map<string, number>();
      for (const c of todos) { const k = f(c).trim(); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
      return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
    };
    return { emp: conta((c) => c.imovel_nome ?? ""), cor: conta((c) => c.corretor_apelido ?? ""),
      anos: conta((c) => anoDe(c.plantao_criado)).reverse() };
  }, [todos]);

  const lista = useMemo(() => {
    const b = semAcento(busca.trim());
    let r = todos.filter((c) =>
      (!empreendimento || c.imovel_nome === empreendimento) &&
      (!corretor || c.corretor_apelido === corretor) &&
      (!ano || anoDe(c.plantao_criado) === ano) &&
      (!b || semAcento(c.nome ?? "").includes(b) || fone(c).replace(/\D/g, "").includes(b.replace(/\D/g, "") || "§")));
    if (unicos) {
      const vistos = new Set<string>();
      r = r.filter((c) => { const k = fone(c).replace(/\D/g, "") || semAcento(c.nome ?? ""); if (vistos.has(k)) return false; vistos.add(k); return true; });
    }
    return r.sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
  }, [todos, empreendimento, corretor, ano, busca, unicos]);

  // logo após o login a sessão chega antes do perfil: espera o papel, senão
  // "ainda sem papel" vira "não é admin" e a página expulsa quem é.
  if (loading || (session && !role)) return <p className="p-10 text-center text-slate-500">Carregando…</p>;
  if (!session) return <Navigate to="/login" replace />;
  if (role !== "ADMIN") return (
    <div className="p-10 text-center">
      <p className="text-lg font-bold text-slate-800">Esta lista é só do administrador.</p>
      <p className="mt-1 text-sm text-slate-500">Entre com o login de admin para ver e imprimir.</p>
    </div>
  );

  const filtro = [empreendimento, corretor && `corretor ${corretor}`, ano, busca && `"${busca}"`].filter(Boolean).join(" · ") || "todos";
  const paginas = Math.max(1, Math.ceil(lista.length / (colunas === "nome" ? 120 : 45)));

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm 10mm; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .lc-nomes { column-count: 3; column-gap: 18px; }
        @media (max-width: 640px) { .lc-nomes { column-count: 1; } }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-b bg-slate-50 px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-lg font-extrabold">Clientes da base Cury</h1>
            <p className="text-xs text-slate-500">
              {isLoading ? "Carregando…" : `${lista.length.toLocaleString("pt-BR")} na lista · ~${paginas} página${paginas > 1 ? "s" : ""} A4`}
            </p>
          </div>
          <label className="text-xs font-semibold text-slate-600">Empreendimento
            <select className="mt-1 block w-52 rounded border bg-white px-2 py-1.5 text-sm" value={empreendimento} onChange={(e) => setEmpreendimento(e.target.value)}>
              <option value="">Todos</option>
              {opcoes.emp.map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Corretor
            <select className="mt-1 block w-40 rounded border bg-white px-2 py-1.5 text-sm" value={corretor} onChange={(e) => setCorretor(e.target.value)}>
              <option value="">Todos</option>
              {opcoes.cor.map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Ano
            <select className="mt-1 block w-24 rounded border bg-white px-2 py-1.5 text-sm" value={ano} onChange={(e) => setAno(e.target.value)}>
              <option value="">Todos</option>
              {opcoes.anos.map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Buscar
            <input className="mt-1 block w-40 rounded border px-2 py-1.5 text-sm" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="nome ou telefone" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Imprimir
            <select className="mt-1 block w-40 rounded border bg-white px-2 py-1.5 text-sm" value={colunas} onChange={(e) => setColunas(e.target.value as Colunas)}>
              <option value="nome">Só os nomes</option>
              <option value="nome_tel">Nome e telefone</option>
              <option value="tudo">Completo</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={unicos} onChange={(e) => setUnicos(e.target.checked)} /> sem repetidos
          </label>
          <button type="button" disabled={isLoading || !lista.length} onClick={() => window.print()}
            className="flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
            <Printer size={16} /> Imprimir
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-4 text-[11px] leading-tight">
        <div className="mb-2 flex justify-between border-b pb-1 text-[10px] text-slate-500">
          <span><b className="text-slate-800">Clientes da base Cury</b> · {filtro}</span>
          <span>{lista.length.toLocaleString("pt-BR")} nomes · impresso em {new Date().toLocaleDateString("pt-BR")}</span>
        </div>
        {isLoading ? <p className="py-10 text-center text-slate-500">Carregando os 19 mil nomes…</p>
          : colunas === "nome" ? (
            <ol className="lc-nomes list-decimal pl-6">
              {lista.map((c, i) => <li key={i} className="break-inside-avoid py-[1px]">{titulo(c.nome) || "—"}</li>)}
            </ol>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-left text-[10px] uppercase text-slate-500">
                  <th className="w-10 py-1 pr-2 text-right">#</th><th className="py-1 pr-2">Nome</th><th className="py-1 pr-2">Telefone</th>
                  {colunas === "tudo" ? <><th className="py-1 pr-2">Empreendimento</th><th className="py-1 pr-2">Corretor</th><th className="py-1">Plantão</th></> : null}
                </tr>
              </thead>
              <tbody>
                {lista.map((c, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-[3px] pr-2 text-right text-slate-400">{i + 1}</td>
                    <td className="py-[3px] pr-2">{titulo(c.nome) || "—"}</td>
                    <td className="whitespace-nowrap py-[3px] pr-2">{fone(c) || "—"}</td>
                    {colunas === "tudo" ? <>
                      <td className="py-[3px] pr-2">{c.imovel_nome ?? "—"}</td>
                      <td className="py-[3px] pr-2">{c.corretor_apelido ?? "—"}</td>
                      <td className="whitespace-nowrap py-[3px]">{c.plantao_criado ?? "—"}</td>
                    </> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
