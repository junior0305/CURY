import React from "react";
/* Base de contatos (20/10) — Configurar do gerente, super e diretor.
 * Protótipo aprovado: https://claude.ai/artifact/VhYLDdpVWaBetEMsiJb4YY
 * O líder sobe um CSV (nome, telefone, região) e escolhe:
 *  · Pool (Pescar): os contatos vão para o carrossel, só para a equipe dele (cold_contacts.dono_equipe);
 *  · Gotejamento: o robô /root/econ/gotejar.py solta um por vez, no intervalo e horário, pela entrada
 *    normal de leads (fila LISTA_<id>) para a roleta da equipe ou os corretores escolhidos.
 * O corretor NÃO vê que veio de lista (decisão do Junior): a origem "Lista" só aparece nos relatórios.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

type Linha = { n: number; nome: string; telefone: string; original: string; regiao: string; motivo?: string;
  situacao: "ok" | "invalido" | "repetido" | "lead" | "base" | "bloqueado" };
type Pessoa = { id: string; first_name: string | null; last_name: string | null; role: string; manager_id: string | null };
const sb = supabase as any;
const nomeDe = (p?: Pessoa) => (p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || "—" : "—");
/** por que o telefone não serve (para o checkup do arquivo) */
const porqueInvalido = (t: string) => {
  const d = (t || "").replace(/\D/g, "");
  if (!t.trim()) return "sem telefone";
  if (/[a-z@]/i.test(t)) return "tem letras (parece e-mail ou texto)";
  const sem55 = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (sem55.length < 10) return "faltam dígitos (sem DDD?)";
  if (sem55.length > 11) return "dígitos demais";
  if (sem55.length === 10) return "parece fixo (celular tem 9 na frente)";
  if (sem55[2] !== "9") return "não é celular (o 3º dígito deve ser 9)";
  return "DDD inválido";
};
const celular = (t: string) => { let d = (t || "").replace(/\D/g, ""); if (d.length === 10 || d.length === 11) d = "55" + d; return /^55[1-9][1-9]9\d{8}$/.test(d) ? d : null; };
const ERROS: Record<string, string> = {
  confirme_lgpd: "Confirme que os contatos foram obtidos com autorização.",
  corretor_fora_da_sua_equipe: "Algum corretor escolhido não é da sua equipe.",
  escolha_corretores: "Escolha pelo menos um corretor (ou use a roleta da equipe).",
  sem_permissao: "Você não tem permissão para mexer nesta lista.",
  nome_obrigatorio: "Escreva o nome da lista.",
};

// Excel salva CSV em Windows-1252: lido como UTF-8, "José" vira "Jos�". Tenta UTF-8 e cai para 1252.
async function lerTexto(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

type Leitura = { linhas: { n: number; nome: string; telefone: string; regiao: string }[]; temCab: boolean; semRegiao: boolean; regiaoIgnorada: boolean; sep: string };
function lerCsv(texto: string): Leitura {
  const linhas = texto.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!linhas.length) return { linhas: [], temCab: false, semRegiao: true, regiaoIgnorada: false, sep: "," };
  const sep = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ";" : ",";
  const cols = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const cab = cols(linhas[0]).map((c) => c.toLowerCase());
  const temCab = cab.some((c) => /nome|telefone|fone|celular|regi/.test(c));
  const iN = temCab ? cab.findIndex((c) => /nome/.test(c)) : 0;
  const iT = temCab ? cab.findIndex((c) => /telefone|fone|celular|whats/.test(c)) : 1;
  let iR = temCab ? cab.findIndex((c) => /regi|bairro|zona/.test(c)) : 2;
  const corpo = temCab ? linhas.slice(1) : linhas;
  // 30/10 (planilha do Alisson sem cabeçalho: nome, telefone, e-mail): coluna que é e-mail ou telefone não é região.
  // Sem região, a lista usa o próprio nome da lista (ex.: "Zona Sul").
  let regiaoIgnorada = false;
  if (iR >= 0) {
    const amostra = corpo.slice(0, 200).map((l) => cols(l)[iR] ?? "").filter(Boolean);
    const ruim = amostra.filter((v) => /@/.test(v) || /^\+?\d[\d\s()-]{6,}$/.test(v)).length;
    if (amostra.length && ruim / amostra.length > 0.2) { iR = -1; regiaoIgnorada = true; }
  }
  return {
    temCab, sep, regiaoIgnorada, semRegiao: iR < 0,
    linhas: corpo.map((l, k) => {
      const c = cols(l);
      return { n: k + (temCab ? 2 : 1), nome: c[iN] ?? "", telefone: c[iT] ?? "", regiao: iR >= 0 ? c[iR] ?? "" : "" };
    }),
  };
}

/** Modelo para o líder preencher (abre certo no Excel: separador ; e acentos em UTF-8 com BOM). */
function baixarModelo() {
  const txt = "\uFEFFnome;telefone;regiao\nMaria Silva;11987654321;Zona Sul\nJoão Souza;(11) 97654-3210;Santo Amaro\nAna Lima;5511912345678;Campo Limpo\n";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
  a.download = "modelo-lista-comandra.csv"; a.click(); URL.revokeObjectURL(a.href);
}
function baixarProblemas(ls: Linha[], arquivo: string) {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const txt = "\uFEFF" + ["linha;nome;telefone;regiao;problema", ...ls.map((l) => [l.n, esc(l.nome), esc(l.original), esc(l.regiao), esc(l.motivo || "")].join(";"))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
  a.download = `problemas-${arquivo.replace(/\.(csv|txt)$/i, "")}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

export default function BaseContatos({ donoId }: { donoId?: string | null }) {
  const { session, role } = useAuth();
  // "Ver como": admin/diretor vendo a tela de um líder sobe a lista em nome dele
  const eu = donoId || session?.user?.id;
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [arquivo, setArquivo] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [destino, setDestino] = useState<"pool" | "gota">("pool");
  const [intervalo, setIntervalo] = useState(15);
  const [para, setPara] = useState<"roleta" | "escolher">("roleta");
  const [marc, setMarc] = useState<Set<string>>(new Set());
  const [lgpd, setLgpd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [renomear, setRenomear] = useState<{ id: string; nome: string } | null>(null);
  const [editar, setEditar] = useState<{ id: string; nome: string; brokers: Set<string> } | null>(null);

  async function abrirEditar(l: any) {
    const { data } = await sb.from("listas_contatos").select("broker_ids").eq("id", l.id).maybeSingle();
    setEditar({ id: l.id, nome: l.nome, brokers: new Set(((data?.broker_ids ?? []) as string[])) });
  }
  async function salvarCorretores() {
    if (!editar) return;
    if (!editar.brokers.size) { toast.error("Escolha pelo menos um corretor."); return; }
    const { error } = await sb.rpc("editar_corretores_lista", { p_lista: editar.id, p_broker_ids: [...editar.brokers] });
    if (error) { toast.error((error as any).details || error.message); return; }
    toast.success("Corretores da lista atualizados. O gotejamento passa a cair para eles."); setEditar(null);
    qc.invalidateQueries({ queryKey: ["base-listas"] });
  }
  const porDia = Math.floor((10 * 60) / intervalo); // 9h às 19h

  const { data: pessoas = [] } = useQuery<Pessoa[]>({
    queryKey: ["base-equipe", eu, role],
    enabled: !!eu,
    queryFn: async () => {
      const tudo = !donoId && (role === "ADMIN" || role === "DIRECTOR");
      const arv = tudo ? null : (((await sb.rpc("ids_da_arvore", { p: eu })).data ?? []) as any[]).map((r) => (typeof r === "string" ? r : r.ids_da_arvore));
      let q = sb.from("profiles").select("id,first_name,last_name,role,manager_id").eq("is_active", true);
      if (arv) q = q.in("id", arv);
      return ((await q).data ?? []) as Pessoa[];
    },
  });
  const porId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
  const grupos = useMemo(() => {
    const m = new Map<string, Pessoa[]>();
    for (const p of pessoas) if (p.role === "BROKER") m.set(p.manager_id ?? "—", [...(m.get(p.manager_id ?? "—") ?? []), p]);
    return [...m.entries()].map(([k, cs]) => ({ k, nome: nomeDe(porId.get(k)), cs })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [pessoas, porId]);

  const { data: listas = [] } = useQuery({
    queryKey: ["base-listas", eu],
    enabled: !!eu,
    refetchInterval: 60_000,
    queryFn: async () => ((await sb.from("v_listas_resumo").select("*").order("criado_em", { ascending: false })).data ?? []) as any[],
  });

  async function escolherArquivo(f?: File) {
    if (!f) return;
    setArquivo(f.name);
    if (!nome) setNome(f.name.replace(/\.(csv|txt)$/i, ""));
    const leitura = lerCsv(await lerTexto(f));
    setLeitura(leitura);
    const brutas = leitura.linhas;
    const vistos = new Map<string, number>();
    const pre: Linha[] = brutas.map((r) => {
      const t = celular(r.telefone);
      if (!t) return { ...r, original: r.telefone, situacao: "invalido" as const, motivo: porqueInvalido(r.telefone) };
      if (vistos.has(t)) return { ...r, original: r.telefone, telefone: t, situacao: "repetido" as const, motivo: `repetido (igual à linha ${vistos.get(t)})` };
      vistos.set(t, r.n);
      return { ...r, original: r.telefone, telefone: t, situacao: "ok" as const };
    });
    const tels = pre.filter((l) => l.situacao === "ok").map((l) => l.telefone);
    const sit = new Map<string, string>();
    for (let i = 0; i < tels.length; i += 500) {
      const { data } = await sb.rpc("previa_lista_contatos", { p_telefones: tels.slice(i, i + 500) });
      for (const r of (data ?? []) as any[]) sit.set(r.telefone, r.situacao);
    }
    const MOTIVO: Record<string, string> = { lead: "já é lead no Comandra", base: "já está numa lista/base", bloqueado: "pediu para não receber" };
    setLinhas(pre.map((l) => { if (l.situacao !== "ok") return l; const st = (sit.get(l.telefone) ?? "ok") as Linha["situacao"];
      return st === "ok" ? l : { ...l, situacao: st, motivo: MOTIVO[st] || st }; }));
  }

  const conta = (s: Linha["situacao"]) => linhas.filter((l) => l.situacao === s).length;
  const validos = conta("ok");
  const pronto = validos > 0 && lgpd && nome.trim() && (destino === "pool" || para === "roleta" || marc.size > 0);

  async function subir() {
    if (!pronto) return;
    setBusy(true);
    const { data, error } = await sb.rpc("subir_lista_contatos", {
      p_nome: nome.trim(), p_destino: destino, p_intervalo: intervalo, p_max_dia: porDia, p_para: para,
      p_broker_ids: [...marc], p_lgpd: lgpd, p_dono: donoId && donoId !== session?.user?.id ? donoId : null,
      p_contatos: linhas.filter((l) => l.situacao === "ok").map((l) => ({ nome: l.nome, telefone: l.telefone, regiao: l.regiao || nome.trim() })),
    });
    setBusy(false);
    if (error) { toast.error(ERROS[(error.message || "").trim()] ?? `Não consegui subir: ${error.message}`); return; }
    toast.success(destino === "pool"
      ? `${data?.inseridos ?? 0} contatos no Pescar da sua equipe.`
      : `Gotejamento começou: ${data?.inseridos ?? 0} contatos, 1 a cada ${intervalo} min no horário da equipe.`, { duration: 8000 });
    setLinhas([]); setArquivo(""); setNome(""); setLgpd(false); setLeitura(null);
    qc.invalidateQueries({ queryKey: ["base-listas"] });
  }

  async function salvarNome() {
    if (!renomear) return;
    const { error } = await sb.rpc("renomear_lista_contatos", { p_lista: renomear.id, p_nome: renomear.nome });
    if (error) { toast.error(ERROS[(error.message || "").trim()] ?? error.message); return; }
    toast.success("Nome da lista trocado."); setRenomear(null);
    qc.invalidateQueries({ queryKey: ["base-listas"] });
  }

  async function pausar(id: string, p: boolean) {
    const { error } = await sb.rpc("pausar_lista_contatos", { p_lista: id, p_pausar: p });
    if (error) { toast.error(ERROS[(error.message || "").trim()] ?? error.message); return; }
    toast.success(p ? "Lista pausada." : "Lista retomada.");
    qc.invalidateQueries({ queryKey: ["base-listas"] });
  }

  const nEsc = marc.size;
  const semanas = validos ? Math.ceil(validos / (porDia * 6)) : 0;

  return (
    <div className="bc">
      <style>{CSS}</style>
      <p className="bc-mut">Suba uma lista e escolha se ela vai para o Pescar ou se cai como lead novo, aos poucos, para a sua equipe. Para o corretor é um lead novo; a origem "Lista" aparece só nos relatórios de gerente, super e diretor.</p>

      <section className="bc-box">
        <h3>1 · Subir a lista</h3>
        <div className="bc-2">
          <label className="bc-campo">Nome da lista
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Campo Limpo · outubro" />
          </label>
          <label className="bc-campo">Arquivo CSV (nome, telefone, região)
            <input type="file" accept=".csv,.txt,text/csv" onChange={(e) => escolherArquivo(e.target.files?.[0])} />
          </label>
        </div>
        <span className="bc-mut">Não sabe montar o arquivo? <button type="button" className="bc-link" onClick={baixarModelo}>Baixar o modelo CSV</button> · 3 colunas: <b>nome</b>, <b>telefone</b> com DDD (celular, com 9) e <b>região</b>. Abre no Excel; salve como CSV.</span>
        {linhas.length > 0 && (
          <>
            <div className="bc-cont">
              <div><span>Lidos</span><b>{linhas.length}</b></div>
              <div className="ok"><span>Válidos para subir</span><b>{validos}</b></div>
              <div><span>Já são leads</span><b>{conta("lead")}</b></div>
              <div><span>Já estão na base</span><b>{conta("base")}</b></div>
              <div><span>Inválidos · repetidos · não querem</span><b>{conta("invalido") + conta("repetido") + conta("bloqueado")}</b></div>
            </div>
            <span className="bc-mut">{arquivo}</span>
            {(() => {
              const prob = linhas.filter((l) => l.situacao === "invalido" || l.situacao === "repetido");
              const pctRuim = linhas.length ? prob.length / linhas.length : 0;
              const semNome = linhas.filter((l) => l.situacao === "ok" && !l.nome.trim()).length;
              const avisos: string[] = [];
              if (leitura && !leitura.temCab) avisos.push("O arquivo não tem cabeçalho: usei a ordem nome, telefone, região.");
              if (leitura?.regiaoIgnorada) avisos.push(`A coluna de região tinha e-mail ou telefone e foi ignorada: todos ficam com a região "${nome.trim() || "nome da lista"}".`);
              else if (leitura?.semRegiao) avisos.push(`Sem coluna de região: todos ficam com a região "${nome.trim() || "nome da lista"}".`);
              if (semNome) avisos.push(`${semNome} contato${semNome > 1 ? "s" : ""} sem nome: o corretor vai ver só o telefone.`);
              const porMotivo = new Map<string, number>();
              for (const l of prob) porMotivo.set(l.motivo || l.situacao, (porMotivo.get(l.motivo || l.situacao) || 0) + 1);
              return (
                <div className={`bc-check${pctRuim > 0.3 ? " ruim" : prob.length || avisos.length ? " atencao" : " ok"}`}>
                  <b>{pctRuim > 0.3 ? `Arquivo com muitos erros: ${Math.round(pctRuim * 100)}% das linhas não servem. Confira antes de subir.`
                    : prob.length || avisos.length ? "Checkup do arquivo: dá para subir, mas confira" : "Checkup do arquivo: tudo certo ✅"}</b>
                  {avisos.map((a) => <span key={a}>• {a}</span>)}
                  {[...porMotivo.entries()].map(([m, n]) => <span key={m}>• {n} linha{n > 1 ? "s" : ""} com {m} — não sobe{n > 1 ? "m" : ""}</span>)}
                  {prob.slice(0, 5).map((l) => <span key={l.n} className="bc-ex">linha {l.n}: {l.nome || "(sem nome)"} · "{l.original}" → {l.motivo}</span>)}
                  {prob.length > 0 && <div><button type="button" className="bc-link" onClick={() => baixarProblemas(prob, arquivo)}>Baixar as {prob.length} linhas com problema</button> para corrigir e subir de novo.</div>}
                  <span>Só os <b>{validos}</b> válidos sobem; os outros ficam de fora.</span>
                </div>);
            })()}
          </>
        )}
      </section>

      <section className="bc-box">
        <h3>2 · Para onde vai a lista</h3>
        <div className="bc-2">
          <button type="button" className={`bc-op${destino === "pool" ? " on" : ""}`} onClick={() => setDestino("pool")} aria-pressed={destino === "pool"}>
            <b>Pool (Pescar)</b>
            <span>Os contatos ficam no carrossel do Pescar, por região, só para a sua equipe. O corretor escolhe quem pega (até 50 por dia).</span>
          </button>
          <button type="button" className={`bc-op${destino === "gota" ? " on" : ""}`} onClick={() => setDestino("gota")} aria-pressed={destino === "gota"}>
            <b>Gotejamento (lead caindo)</b>
            <span>O sistema solta um contato de cada vez como lead novo para a equipe, no ritmo escolhido, das 9h às 19h, de segunda a sábado.</span>
          </button>
        </div>

        {destino === "gota" && (
          <div className="bc-gota">
            <div className="bc-linha">
              <span className="bc-lbl">Um lead a cada</span>
              <div className="bc-seg">
                {[10, 15, 30, 60].map((m) => (
                  <button key={m} type="button" className={intervalo === m ? "on" : ""} onClick={() => setIntervalo(m)} aria-pressed={intervalo === m}>{m} min</button>
                ))}
              </div>
              <span className="bc-mut">= até {porDia} por dia</span>
            </div>
            <div className="bc-linha">
              <span className="bc-lbl">Quem recebe</span>
              <button type="button" className={`bc-pill${para === "roleta" ? " on" : ""}`} onClick={() => setPara("roleta")}>Roleta da equipe (quem está recebendo)</button>
              <button type="button" className={`bc-pill${para === "escolher" ? " on" : ""}`} onClick={() => setPara("escolher")}>Corretores que eu escolher</button>
            </div>
            {para === "escolher" && (
              <div className="bc-esc">
                {grupos.length === 0 && <span className="bc-mut">Nenhum corretor na sua equipe.</span>}
                {grupos.map((g) => (
                  <div key={g.k} className="bc-grupo">
                    <span className="bc-lbl">{g.nome}</span>
                    <div className="bc-pills">
                      {g.cs.map((c) => (
                        <button key={c.id} type="button" className={`bc-pill${marc.has(c.id) ? " on" : ""}`} aria-pressed={marc.has(c.id)}
                          onClick={() => setMarc((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}>{nomeDe(c)}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {validos > 0 && (
              <span><b>Previsão:</b> 1 lead a cada {intervalo} min, até {porDia} por dia, {para === "roleta" ? "para quem estiver na roleta" : nEsc ? `para ${nEsc} corretor${nEsc > 1 ? "es" : ""}` : "escolha os corretores"}. Os {validos} contatos levam cerca de {semanas} semana{semanas > 1 ? "s" : ""}.</span>
            )}
          </div>
        )}

        <label className="bc-lgpd">
          <input type="checkbox" checked={lgpd} onChange={(e) => setLgpd(e.target.checked)} />
          <span>Confirmo que estes contatos foram obtidos com autorização para contato (LGPD).</span>
        </label>
        <button type="button" className="bc-btn" disabled={!pronto || busy} onClick={subir}>
          {busy ? "Subindo…" : destino === "pool" ? `Subir ${validos || ""} contatos para o Pescar` : `Começar o gotejamento (${validos || 0} contatos)`}
        </button>
      </section>

      <section className="bc-box">
        <h3>Minhas listas</h3>
        {listas.length === 0 ? <p className="bc-mut">Nenhuma lista ainda.</p> : (
          <div className="bc-tab"><table>
            <thead><tr><th>Lista</th><th>Para onde</th><th>Andamento</th><th>Viraram lead</th><th>Contato · visita · venda</th><th /></tr></thead>
            <tbody>{listas.map((l) => {
              const feitos = l.total - l.restantes;
              return (
                <React.Fragment key={l.id}>
                <tr>
                  <td>{renomear?.id === l.id ? (
                      <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <input className="bc-ren" value={renomear.nome} onChange={(e) => setRenomear({ id: l.id, nome: e.target.value })} aria-label="Novo nome da lista"
                          onKeyDown={(e) => { if (e.key === "Enter") salvarNome(); if (e.key === "Escape") setRenomear(null); }} autoFocus />
                        <button type="button" className="bc-link" onClick={salvarNome}>Salvar</button>
                        <button type="button" className="bc-link" onClick={() => setRenomear(null)}>Cancelar</button>
                      </span>
                    ) : <><b>{l.nome}</b> <button type="button" className="bc-link" style={{ fontSize: 12 }} onClick={() => setRenomear({ id: l.id, nome: l.nome })}>Renomear</button></>}
                    <br /><small>por {l.criado_por_nome ?? "—"} em {new Date(l.criado_em).toLocaleDateString("pt-BR")}</small></td>
                  <td>{l.destino === "pool" ? "Pool (Pescar)" : `Gotejamento · 1 a cada ${l.intervalo_min} min · ${l.para === "roleta" ? "roleta" : "escolhidos"}`}</td>
                  <td style={{ minWidth: 170 }}>
                    <div className="bc-bar"><div style={{ width: `${l.total ? Math.round((feitos / l.total) * 100) : 0}%` }} /></div>
                    <small>{feitos} de {l.total} {l.destino === "pool" ? "pescados" : "caíram"} · {l.status === "pausada" ? "pausada" : l.status === "concluida" ? "concluída" : "ativa"}</small>
                  </td>
                  <td className="m">{l.viraram_lead}</td>
                  <td className="m">{l.com_contato} · {l.visitas} · {l.vendas}</td>
                  <td style={{ textAlign: "right" }}>
                    {l.destino !== "pool" && l.status !== "concluida" && <button type="button" className="bc-link" onClick={() => abrirEditar(l)}>Trocar corretores</button>}
                    {l.status === "ativa" && <button type="button" className="bc-link" onClick={() => pausar(l.id, true)}>Pausar</button>}
                    {l.status === "pausada" && <button type="button" className="bc-link" onClick={() => pausar(l.id, false)}>Retomar</button>}
                  </td>
                </tr>
                {editar?.id === l.id && (
                  <tr><td colSpan={6}>
                    <div className="bc-esc" style={{ padding: "6px 2px 12px" }}>
                      <span className="bc-lbl">Quem recebe o gotejamento de "{editar.nome}" (a lista passa a ir só para os marcados):</span>
                      {grupos.length === 0 && <span className="bc-mut">Nenhum corretor na sua equipe.</span>}
                      {grupos.map((g) => (
                        <div key={g.k} className="bc-grupo">
                          <span className="bc-lbl">{g.nome}</span>
                          <div className="bc-pills">
                            {g.cs.map((c) => {
                              const on = editar.brokers.has(c.id);
                              return <button key={c.id} type="button" className={`bc-pill${on ? " on" : ""}`} aria-pressed={on}
                                onClick={() => setEditar((e) => e ? { ...e, brokers: (() => { const n = new Set(e.brokers); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })() } : e)}>{nomeDe(c)}</button>;
                            })}
                          </div>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="bc-btn" onClick={salvarCorretores}>Salvar ({editar.brokers.size})</button>
                        <button type="button" className="bc-link" onClick={() => setEditar(null)}>Cancelar</button>
                      </div>
                    </div>
                  </td></tr>
                )}
                </React.Fragment>
              );
            })}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

const CSS = `
.bc{display:flex;flex-direction:column;gap:16px}
.bc-mut{font-size:13px;color:var(--cv-text-muted,#5B6B80);margin:0}
.bc-box{background:var(--cv-surface,#fff);border:1px solid var(--cv-border,#E1E6EE);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.bc-box h3{margin:0;font-size:16px;font-weight:800}
.bc-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.bc-campo{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700}
.bc-campo input{min-height:42px;padding:0 10px;border:1px solid var(--cv-border,#CFD7E3);border-radius:10px;font:inherit;font-weight:500;background:transparent;color:inherit}
.bc-campo input[type=file]{padding:8px 10px}
.bc-cont{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.bc-cont div{padding:10px 12px;border-radius:10px;background:rgba(91,107,128,.08);display:flex;flex-direction:column;gap:2px}
.bc-cont div.ok{background:rgba(29,107,69,.1)}
.bc-cont span{font-size:11.5px;font-weight:700;text-transform:uppercase;color:var(--cv-text-muted,#3C4B5F)}
.bc-cont b{font-family:"JetBrains Mono",monospace;font-size:22px}
.bc-cont div.ok b{color:#1D6B45}
.mgr10 button.bc-op,.bc-op{display:flex;flex-direction:column;gap:6px;align-items:flex-start;text-align:left;padding:14px 16px;border-radius:12px;border:1px solid var(--cv-border,#E1E6EE);background:transparent;color:inherit;cursor:pointer}
.mgr10 button.bc-op.on,.bc-op.on{border:2px solid #0E7C7B;background:rgba(14,124,123,.06)}
.bc-op b{font-size:15px}
.bc-op span{font-size:13px;color:var(--cv-text-muted,#3C4B5F)}
.bc-gota{display:flex;flex-direction:column;gap:12px;padding:12px;border-radius:12px;background:rgba(91,107,128,.06);font-size:13.5px}
.bc-linha{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.bc-lbl{font-size:13px;font-weight:700}
.bc-seg{display:flex;gap:4px;padding:4px;border-radius:10px;background:rgba(91,107,128,.12)}
.mgr10 .bc-seg button,.bc-seg button{min-height:34px;padding:0 12px;border-radius:8px;border:0;background:transparent;color:inherit;font-weight:600;font-size:13px;cursor:pointer}
.mgr10 .bc-seg button.on,.bc-seg button.on{background:var(--cv-surface,#fff);box-shadow:0 1px 2px rgba(15,27,45,.12)}
.mgr10 button.bc-pill,.bc-pill{min-height:38px;padding:0 13px;border-radius:99px;border:1px solid var(--cv-border,#CFD7E3) !important;background:transparent !important;color:inherit !important;font-size:13px;font-weight:600;cursor:pointer}
.mgr10 button.bc-pill.on,.bc-pill.on{background:#0E7C7B !important;border-color:#0E7C7B !important;color:#fff !important}
.bc-esc{display:flex;flex-direction:column;gap:10px}
.bc-grupo{display:flex;flex-direction:column;gap:6px}
.bc-pills{display:flex;gap:7px;flex-wrap:wrap}
.bc-lgpd{display:flex;align-items:flex-start;gap:10px;font-size:13.5px;cursor:pointer}
.bc-lgpd input{width:18px;height:18px;accent-color:#0E7C7B;margin-top:1px}
.mgr10 button.bc-btn,.bc-btn{align-self:flex-start;min-height:44px;padding:0 18px;border-radius:10px;border:0 !important;background:#0E7C7B !important;color:#fff !important;font-weight:700;font-size:14px;cursor:pointer}
.bc-btn:disabled{opacity:.45;cursor:not-allowed}
.bc-tab{overflow-x:auto}
.bc-tab table{width:100%;border-collapse:collapse;font-size:13.5px}
.bc-tab th{text-align:left;font-size:12px;text-transform:uppercase;color:var(--cv-text-muted,#5B6B80);padding:8px 10px;border-bottom:1px solid var(--cv-border,#E1E6EE)}
.bc-tab td{padding:9px 10px;border-bottom:1px solid var(--cv-border,#E1E6EE)}
.bc-tab td.m{font-family:"JetBrains Mono",monospace}
.bc-check{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:10px;font-size:13.5px;line-height:1.45}
.bc-check.ok{background:rgba(29,107,69,.1)}.bc-check.atencao{background:rgba(201,146,42,.14)}.bc-check.ruim{background:rgba(180,70,47,.14)}
.bc-check .bc-ex{font-family:"JetBrains Mono",monospace;font-size:12px;opacity:.85}
.bc-ren{min-height:34px;padding:0 8px;border:1px solid var(--cv-border,#CFD7E3);border-radius:8px;font:inherit;background:transparent;color:inherit;min-width:220px}
.bc-tab small{color:var(--cv-text-muted,#5B6B80);font-size:12px}
.bc-bar{height:8px;border-radius:99px;background:rgba(91,107,128,.15);overflow:hidden}
.bc-bar div{height:100%;background:#0E7C7B;border-radius:99px}
.mgr10 button.bc-link,.bc-link{background:none !important;border:0 !important;color:#0E7C7B !important;font-weight:700;cursor:pointer}
@media (max-width:900px){.bc-2{grid-template-columns:1fr}.bc-cont{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
