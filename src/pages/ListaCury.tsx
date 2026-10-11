// Listas para IMPRESSÃO: a base de clientes baixada do app da Cury (visitantes
// de plantão 2023–2025, ~19 mil, cury_clientes) e o pool de leads do Pescar
// (cold_contacts). Filtra, separa em lotes e manda para a impressora.
// Só ADMIN abre a página (a tabela cury_clientes tem RLS para admin/diretor).
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

type Cliente = { nome: string | null; celular: string | null; telefone: string | null;
  corretor_apelido: string | null; imovel_nome: string | null; plantao_criado: string | null };
type Colunas = "nome" | "nome_tel" | "tudo";
type Fonte = "cury" | "pool";
// O pool reaproveita as mesmas colunas: região no lugar do empreendimento,
// situação no lugar do corretor, data de entrada no lugar do plantão.
const SITUACAO: Record<string, string> = { available: "Disponível", claimed: "Pescado", promoted: "Virou lead" };
const ROTULO: Record<Fonte, { titulo: string; grupo: string; quem: string; data: string }> = {
  cury: { titulo: "Clientes da base Cury", grupo: "Empreendimento", quem: "Corretor", data: "Plantão" },
  pool: { titulo: "Pool de leads", grupo: "Região", quem: "Situação", data: "Entrou" },
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const anoDe = (d: string | null) => (d ?? "").slice(-4);
const fone = (c: Cliente) => c.celular || c.telefone || "";
const titulo = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());

export default function ListaCury() {
  const { session, role, loading } = useAuth();
  const [fonte, setFonte] = useState<Fonte>("cury");
  const R = ROTULO[fonte];
  const [empreendimento, setEmpreendimento] = useState("");
  const [corretor, setCorretor] = useState("");
  const [ano, setAno] = useState("");
  const [busca, setBusca] = useState("");
  const [colunas, setColunas] = useState<Colunas>("nome_tel");
  const [unicos, setUnicos] = useState(true);
  // Lotes: a lista filtrada vira blocos (1 a 1.000, 1.001 a 2.000…) e só o bloco
  // escolhido vai para a impressora. A ordem é sempre a mesma (alfabética), então
  // o lote 3 de hoje é o mesmo lote 3 de amanhã.
  const [tamanho, setTamanho] = useState(1000);
  const [lote, setLote] = useState(0);

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["lista-imprimir", fonte],
    enabled: role === "ADMIN",
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const out: Cliente[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = fonte === "cury"
          ? await supabase.from("cury_clientes" as any)
              .select("nome,celular,telefone,corretor_apelido,imovel_nome,plantao_criado")
              .order("cury_id").range(de, de + 999)
          : await supabase.from("cold_contacts")
              .select("name,phone,tag,status,created_at").order("id").range(de, de + 999);
        if (error) throw error;
        out.push(...(fonte === "cury" ? (data ?? []) as Cliente[] : ((data ?? []) as any[]).map((c) => ({
          nome: c.name, celular: c.phone, telefone: null, imovel_nome: c.tag,
          corretor_apelido: SITUACAO[c.status] ?? c.status,
          plantao_criado: c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : null,
        }))));
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

  const chaveFiltro = [fonte, empreendimento, corretor, ano, busca.trim(), unicos ? "u" : "t", tamanho].join("|");
  useEffect(() => { setLote(0); }, [chaveFiltro]);
  const totalLotes = tamanho ? Math.max(1, Math.ceil(lista.length / tamanho)) : 1;
  const ini = tamanho ? lote * tamanho : 0;
  const visiveis = tamanho ? lista.slice(ini, ini + tamanho) : lista;

  // quais lotes já foram impressos com este filtro — fica neste navegador
  const [impressos, setImpressos] = useState<Record<string, number[]>>(() => {
    try { return JSON.parse(localStorage.getItem("lista-cury-impressos") || "{}"); } catch { return {}; }
  });
  const jaImpresso = (i: number) => (impressos[chaveFiltro] ?? []).includes(i);
  const imprimir = () => {
    window.print();
    const novo = { ...impressos, [chaveFiltro]: [...new Set([...(impressos[chaveFiltro] ?? []), lote])] };
    setImpressos(novo);
    try { localStorage.setItem("lista-cury-impressos", JSON.stringify(novo)); } catch { /* sem storage: só não lembra */ }
  };
  const faixa = (i: number) => `${(i * tamanho + 1).toLocaleString("pt-BR")} a ${Math.min((i + 1) * tamanho, lista.length).toLocaleString("pt-BR")}`;

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

  const filtro = [empreendimento, corretor && (fonte === "cury" ? `corretor ${corretor}` : corretor), ano, busca && `"${busca}"`].filter(Boolean).join(" · ") || "todos";
  const paginas = Math.max(1, Math.ceil(visiveis.length / (colunas === "nome" ? 120 : 45)));

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
            <h1 className="text-lg font-extrabold">{R.titulo}</h1>
            <p className="text-xs text-slate-500">
              {isLoading ? "Carregando…" : `${lista.length.toLocaleString("pt-BR")} na lista · este lote: ${visiveis.length.toLocaleString("pt-BR")} nomes, ~${paginas} página${paginas > 1 ? "s" : ""} A4`}
            </p>
          </div>
          <label className="text-xs font-semibold text-slate-600">Lista
            <select className="mt-1 block w-40 rounded border bg-white px-2 py-1.5 text-sm" value={fonte}
              onChange={(e) => { setFonte(e.target.value as Fonte); setEmpreendimento(""); setCorretor(""); setAno(""); }}>
              <option value="cury">Base Cury</option>
              <option value="pool">Pool de leads</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">{R.grupo}
            <select className="mt-1 block w-52 rounded border bg-white px-2 py-1.5 text-sm" value={empreendimento} onChange={(e) => setEmpreendimento(e.target.value)}>
              <option value="">Todos</option>
              {opcoes.emp.map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">{R.quem}
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
          <label className="text-xs font-semibold text-slate-600">Por lote
            <select className="mt-1 block w-28 rounded border bg-white px-2 py-1.5 text-sm" value={tamanho} onChange={(e) => setTamanho(Number(e.target.value))}>
              <option value={500}>500</option>
              <option value={1000}>1.000</option>
              <option value={2000}>2.000</option>
              <option value={0}>tudo junto</option>
            </select>
          </label>
          {tamanho && totalLotes > 1 ? (
            <label className="text-xs font-semibold text-slate-600">Lote
              <select className="mt-1 block w-52 rounded border bg-white px-2 py-1.5 text-sm" value={lote} onChange={(e) => setLote(Number(e.target.value))}>
                {Array.from({ length: totalLotes }, (_, i) => (
                  <option key={i} value={i}>{jaImpresso(i) ? "✓ " : ""}Lote {i + 1} · {faixa(i)}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={unicos} onChange={(e) => setUnicos(e.target.checked)} /> sem repetidos
          </label>
          <button type="button" disabled={isLoading || !lista.length} onClick={imprimir}
            className="flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
            <Printer size={16} /> Imprimir
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-4 text-[11px] leading-tight">
        <div className="mb-2 flex justify-between border-b pb-1 text-[10px] text-slate-500">
          <span><b className="text-slate-800">{R.titulo}</b> · {filtro}
            {tamanho && totalLotes > 1 ? <> · <b className="text-slate-800">Lote {lote + 1} de {totalLotes}</b> (nº {faixa(lote)})</> : null}</span>
          <span>{visiveis.length.toLocaleString("pt-BR")} nomes · impresso em {new Date().toLocaleDateString("pt-BR")}</span>
        </div>
        {isLoading ? <p className="py-10 text-center text-slate-500">Carregando a lista…</p>
          : colunas === "nome" ? (
            <ol className="lc-nomes list-decimal pl-6" start={ini + 1}>
              {visiveis.map((c, i) => <li key={i} className="break-inside-avoid py-[1px]">{titulo(c.nome) || "—"}</li>)}
            </ol>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-left text-[10px] uppercase text-slate-500">
                  <th className="w-10 py-1 pr-2 text-right">#</th><th className="py-1 pr-2">Nome</th><th className="py-1 pr-2">Telefone</th>
                  {colunas === "tudo" ? <><th className="py-1 pr-2">{R.grupo}</th><th className="py-1 pr-2">{R.quem}</th><th className="py-1">{R.data}</th></> : null}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((c, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-[3px] pr-2 text-right text-slate-400">{ini + i + 1}</td>
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
