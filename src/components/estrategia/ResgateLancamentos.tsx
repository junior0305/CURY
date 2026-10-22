/* Resgate para lançamentos (22/10, ideia do Junior).
 * Quem já abriu pasta ou virou lead já quis comprar. Um lançamento novo na região dele é o motivo para voltar a chamar.
 *
 * Ciclo de cada lançamento (resgate_lancamentos): planejado → em andamento (ao distribuir) → encerrado (com feedback).
 * Fontes:
 *   · resgate_pastas — servidor /root/junix/resgate.py: toda proposta do Junix sem venda, com região e motivo;
 *     resgate_fones.py busca o celular na ficha do cliente, de madrugada.
 *   · leads do Comandra parados há N dias — RPC resgate_leads_parados / resgate_leads_da_regiao.
 * Distribuir: a tela escolhe os itens (escopo do super pela regra de dono das pastas, donoJunix) e a RPC
 * resgate_distribuir valida e agenda no ritmo. Quem entrega, avisa no WhatsApp e cuida do prazo é
 * /root/junix/resgate_entregar.py (de hora em hora). Placar: RPC resgate_placar. Encerrar: resgate_encerrar.
 * "Parada há mais de N dias" = sem mudança no Junix (ou sem interação no Comandra) há N dias: quem está
 * negociando agora fica de fora.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { chaveNome, donoJunix, type SuperDiretoria } from "@/hooks/useDiretoria";

type Resumo = { superintendente: string | null; gerente: string | null; regiao: string | null; motivo: string; recente: boolean; parada: number; com_celular: boolean; buscado: boolean; n: number };
type LeadsResumo = { regiao: string | null; gerente_id: string | null; gerente: string; super_id: string | null; sup: string | null; n: number };
type Lanc = {
  id: string; nome: string; regiao: string; bairros: string | null; inicio: string | null; fim: string | null; meta_vendas: number | null;
  responsavel_id: string | null; empreendimento_junix: string | null; status: "planejado" | "andamento" | "encerrado";
  resultado: "certo" | "parte" | "nao" | null; funcionou: string | null; nao_funcionou: string | null; proximo: string | null;
  sobras: string | null; placar_final: Placar | null; encerrado_em: string | null;
};
type Placar = { agendados: number; entregues: number; chamados: number; visitas: number; pastas: number; vendas: number; expirados: number };
type LinhaPlacar = Placar & { corretor_id: string; corretor: string | null; gerente_id: string | null; gerente: string | null; motivo: string };
type Pasta = { proposta_id: string; cliente: string | null; motivo: string; corretor: string | null; gerente: string | null; superintendente: string | null;
  celular: string | null; cadastrada_em: string | null; alterada_em: string | null };

const REGIOES = ["ZONA OESTE", "ZONA SUL", "ZONA NORTE", "ZONA LESTE", "CENTRO", "GRANDE SÃO PAULO"];
const MOTIVOS: { k: string; nome: string; dica: string }[] = [
  { k: "aprovada", nome: "Aprovadas que não compraram", dica: "crédito aprovado na Caixa" },
  { k: "documento", nome: "Pastas com pendência", dica: "parou em documento ou análise" },
  { k: "reprovada", nome: "Clientes não aprovados", dica: "refazer análise, unidade mais barata" },
  { k: "unidade", nome: "Parou na unidade / simulação", dica: "faltou unidade ou preço" },
  { k: "cancelada", nome: "Canceladas / distrato", dica: "já comprou uma vez" },
];
const ORDEM_QUENTE = ["aprovada", "documento", "unidade", "reprovada", "cancelada", "lead"];
const RESULTADO = { certo: "Deu certo", parte: "Em parte", nao: "Não deu" } as const;
const ERROS: Record<string, string> = {
  sem_permissao: "Só o diretor cadastra e encerra lançamentos.",
  nome_e_regiao: "Informe o nome e a região do lançamento.",
  escolha_corretores: "Escolha pelo menos um corretor.",
  corretor_fora_da_sua_equipe: "Algum corretor escolhido não é da sua equipe.",
  corretor_inativo: "Algum corretor escolhido está desligado ou sem receber leads.",
  lancamento_invalido: "Este lançamento já foi encerrado.",
};
const erro = (e: any) => ERROS[String(e?.message ?? "").trim()] ?? `Não consegui: ${e?.message ?? e}`;
const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const dm = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const regiaoTxt = (r: string) => r.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace("São Paulo", "São Paulo");
const diasTxt = (d: number) => (d === 365 ? "1 ano" : `${d} dias`);
const vazio: Placar = { agendados: 0, entregues: 0, chamados: 0, visitas: 0, pastas: 0, vendas: 0, expirados: 0 };
const somaPlacar = (ls: LinhaPlacar[]) => ls.reduce((a, l) => ({
  agendados: a.agendados + Number(l.agendados), entregues: a.entregues + Number(l.entregues), chamados: a.chamados + Number(l.chamados),
  visitas: a.visitas + Number(l.visitas), pastas: a.pastas + Number(l.pastas), vendas: a.vendas + Number(l.vendas), expirados: a.expirados + Number(l.expirados),
}), { ...vazio });

export default function ResgateLancamentos({ supers }: { supers: SuperDiretoria[] }) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const diretoria = (role === "ADMIN" || role === "DIRECTOR") && supers.length > 1;
  const podeEditar = role === "ADMIN" || role === "DIRECTOR";
  const [parada, setParada] = useState(60);
  const [soRecentes, setSoRecentes] = useState(true);
  const [form, setForm] = useState<Lanc | "novo" | null>(null);
  const [distribuir, setDistribuir] = useState<Lanc | null>(null);
  const [encerrar, setEncerrar] = useState<Lanc | null>(null);
  const [filtroTabela, setFiltroTabela] = useState<string>("todos");

  const { data: lancs = [] } = useQuery({
    queryKey: ["resgate-lancamentos"], staleTime: 60_000,
    queryFn: async () => ((await supabase.from("resgate_lancamentos" as any).select("*").order("created_at")).data ?? []) as unknown as Lanc[],
  });
  const { data: resumo } = useQuery({
    queryKey: ["resgate-resumo"], staleTime: 5 * 60_000,
    queryFn: async () => ((await supabase.rpc("resgate_resumo" as any)).data ?? []) as unknown as Resumo[],
  });
  const { data: leadsRes = [] } = useQuery({
    queryKey: ["resgate-leads-parados", parada], staleTime: 5 * 60_000,
    queryFn: async () => ((await supabase.rpc("resgate_leads_parados" as any, { p_dias: parada })).data ?? []) as unknown as LeadsResumo[],
  });
  const ativos = lancs.filter((l) => l.status !== "encerrado");
  const encerrados = lancs.filter((l) => l.status === "encerrado").reverse();
  const { data: placares = {} } = useQuery({
    queryKey: ["resgate-placar", ativos.map((l) => l.id).join(",")], enabled: ativos.length > 0, staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, LinhaPlacar[]> = {};
      await Promise.all(ativos.filter((l) => l.status === "andamento").map(async (l) => {
        out[l.id] = ((await supabase.rpc("resgate_placar" as any, { p_lanc: l.id })).data ?? []) as unknown as LinhaPlacar[];
      }));
      return out;
    },
  });

  const ids = useMemo(() => new Set(supers.map((s) => s.id)), [supers]);
  const noEscopo = (sup: string | null, ger: string | null) => {
    const d = donoJunix(supers, sup, ger).superId;
    return ids.has(d) || (diretoria && d === "fora");
  };
  const linhas = useMemo(() => (resumo ?? []).filter((x) => (!soRecentes || x.recente) && Number(x.parada) >= parada && noEscopo(x.superintendente, x.gerente)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resumo, soRecentes, parada, supers, diretoria]);
  const leadsEsc = useMemo(() => leadsRes.filter((x) => (x.super_id ? ids.has(x.super_id) : diretoria)), [leadsRes, ids, diretoria]);
  const soma = (f: (x: Resumo) => boolean) => linhas.filter(f).reduce((a, x) => a + Number(x.n), 0);
  const leadsDa = (reg: string) => leadsEsc.filter((x) => x.regiao === reg).reduce((a, x) => a + Number(x.n), 0);

  const recarregar = () => {
    ["resgate-lancamentos", "resgate-placar", "resgate-leads-parados"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  // tabela por super/gerente
  const tabela = useMemo(() => {
    const alvo = filtroTabela === "todos" ? new Set(ativos.map((l) => l.regiao)) : new Set([ativos.find((l) => l.id === filtroTabela)?.regiao]);
    const m = new Map<string, { sup: string; ger: string; c: Record<string, number>; leads: number }>();
    const nomeSup = (id: string) => supers.find((s) => s.id === id)?.nome ?? "Fora do Comandra";
    for (const x of linhas) {
      if (!alvo.has(x.regiao ?? "")) continue;
      const d = donoJunix(supers, x.superintendente, x.gerente);
      const sup = d.superId === "fora" ? (x.superintendente ?? "Fora do Comandra") : nomeSup(d.superId);
      const ger = supers.flatMap((s) => s.gerentes).find((g) => g.id === d.gerenteId)?.nome ?? (x.gerente ?? "—");
      const k = `${sup}|${ger}`;
      if (!m.has(k)) m.set(k, { sup, ger, c: {}, leads: 0 });
      m.get(k)!.c[x.motivo] = (m.get(k)!.c[x.motivo] ?? 0) + Number(x.n);
    }
    for (const x of leadsEsc) {
      if (!alvo.has(x.regiao ?? "")) continue;
      const sup = x.sup ?? "Base geral"; const ger = x.gerente_id ? x.gerente : "sem corretor";
      const k = `${sup}|${ger}`;
      if (!m.has(k)) m.set(k, { sup, ger, c: {}, leads: 0 });
      m.get(k)!.leads += Number(x.n);
    }
    const rows = [...m.values()].map((r) => ({ ...r, total: Object.values(r.c).reduce((a, b) => a + b, 0) + r.leads }));
    return rows.sort((a, b) => a.sup.localeCompare(b.sup) || b.total - a.total);
  }, [linhas, leadsEsc, filtroTabela, ativos, supers]);

  return (
    <section className="dir-card rsg">
      <style>{CSS}</style>
      <div className="rsg-top">
        <div>
          <span className="rsg-chip">Resgate para lançamentos</span>
          <h3>Quem dá para recuperar em cada lançamento</h3>
          <p>Quem já abriu pasta ou virou lead já quis comprar. Cadastre os próximos lançamentos e a região de cada um: o Comandra separa quem dá para recuperar.</p>
        </div>
        <div className="rsg-filtros">
          <label className="rsg-sel">Parada há mais de
            <select value={parada} onChange={(e) => setParada(Number(e.target.value))}>
              {[30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{diasTxt(d)}</option>)}
            </select>
          </label>
          <label className="rsg-tg"><input type="checkbox" checked={soRecentes} onChange={(e) => setSoRecentes(e.target.checked)} />Pastas abertas nos últimos 2 anos</label>
        </div>
      </div>

      {/* 1 · lançamentos */}
      <div className="rsg-bloco">
        <div className="rsg-bh"><b>Lançamentos</b>{podeEditar && <button type="button" className="rsg-btn" onClick={() => setForm("novo")}>Cadastrar próximo lançamento</button>}</div>
        {!ativos.length && <div className="rsg-mut">Nenhum lançamento cadastrado.{podeEditar ? " Cadastre o próximo para começar." : ""}</div>}
        {ativos.map((l) => {
          const p = somaPlacar(placares[l.id] ?? []);
          const dia = l.inicio ? Math.max(1, Math.floor((Date.now() - new Date(l.inicio + "T12:00:00").getTime()) / 864e5) + 1) : null;
          return (
            <div key={l.id} className="rsg-lanc-row">
              <div className="rsg-lr-top">
                <span><b>{l.nome}</b> <small>· {regiaoTxt(l.regiao)}{l.inicio ? ` · ${dm(l.inicio)}${l.fim ? ` a ${dm(l.fim)}` : ""}` : ""}</small></span>
                <span className={`rsg-st ${l.status}`}>{l.status === "andamento" ? `Em andamento${dia ? ` · dia ${dia}` : ""}` : "Planejado"}</span>
              </div>
              {l.status === "andamento" && (
                <div className="rsg-placar">
                  <span>Distribuídos<b>{fmt(p.agendados + p.entregues)}</b>{p.agendados ? <small>{fmt(p.agendados)} ainda vão sair</small> : null}</span>
                  <span>Chamados<b>{fmt(p.chamados)}</b>{p.expirados ? <small>{fmt(p.expirados)} fora do prazo</small> : null}</span>
                  <span>Visitas<b>{fmt(p.visitas)}</b></span>
                  <span>Pastas novas<b>{fmt(p.pastas)}</b></span>
                  <span>Vendas<b>{fmt(p.vendas)}</b>{l.meta_vendas ? <small>meta {l.meta_vendas}</small> : null}</span>
                </div>
              )}
              <div className="rsg-acoes">
                <button type="button" className={l.status === "planejado" ? "rsg-btn" : "rsg-btn ghost"} onClick={() => setDistribuir(l)}>
                  {l.status === "planejado" ? "Começar: distribuir" : "Distribuir mais"}
                </button>
                {podeEditar && <button type="button" className="rsg-btn ghost" onClick={() => setForm(l)}>Editar</button>}
                {podeEditar && l.status === "andamento" && <button type="button" className="rsg-btn dark" onClick={() => setEncerrar(l)}>Encerrar e dar o feedback</button>}
              </div>
            </div>
          );
        })}
      </div>

      {/* 2 · cartões por lançamento */}
      {!resumo ? <div className="rsg-mut">Carregando as pastas do Junix…</div> : ativos.length > 0 && (
        <div className="rsg-grid">
          {ativos.map((l) => {
            const daRegiao = (x: Resumo) => x.regiao === l.regiao;
            const pastas = soma(daRegiao); const leads = leadsDa(l.regiao);
            const cel = soma((x) => daRegiao(x) && x.com_celular); const busc = soma((x) => daRegiao(x) && x.buscado);
            return (
              <div key={l.id} className="rsg-col">
                <div className="rsg-lanc"><b>{l.nome}</b><small>{regiaoTxt(l.regiao)}</small></div>
                <div className="rsg-num">{fmt(pastas + leads)}<small> contatos para resgatar</small></div>
                <ul className="rsg-mot">
                  {MOTIVOS.map((m) => {
                    const k = soma((x) => daRegiao(x) && x.motivo === m.k);
                    return k ? <li key={m.k}><span><b>{m.nome}</b><small>{m.dica}</small></span><b>{fmt(k)}</b></li> : null;
                  })}
                  <li><span><b>Leads parados há +{diasTxt(parada)}</b><small>interesse na {regiaoTxt(l.regiao)}</small></span><b>{fmt(leads)}</b></li>
                </ul>
                <div className="rsg-cel">{busc ? <>Celular: <b>{fmt(cel)}</b> de {fmt(pastas)} pastas já com telefone ({fmt(busc)} buscadas)</> : "Celular das pastas: o robô ainda vai buscar"} · leads já têm telefone</div>
                <button type="button" className="rsg-btn dark" onClick={() => setDistribuir(l)}>Distribuir para a equipe</button>
              </div>
            );
          })}
        </div>
      )}

      {/* 3 · por super e gerente */}
      {ativos.length > 0 && tabela.length > 0 && (
        <div className="rsg-bloco">
          <div className="rsg-bh"><b>Por superintendente e gerente</b>
            <div className="rsg-pills" role="group" aria-label="Lançamento">
              <button type="button" className={filtroTabela === "todos" ? "on" : ""} onClick={() => setFiltroTabela("todos")}>Todos</button>
              {ativos.map((l) => <button key={l.id} type="button" className={filtroTabela === l.id ? "on" : ""} onClick={() => setFiltroTabela(l.id)}>{l.nome}</button>)}
            </div>
          </div>
          <div className="rsg-tab-wrap">
            <table className="rsg-tab">
              <thead><tr><th>Super · Gerente</th><th>Aprovadas</th><th>Pendência</th><th>Não aprovados</th><th>Unidade</th><th>Leads +{parada}d</th><th>Total</th></tr></thead>
              <tbody>
                {tabela.map((r, i) => (
                  <tr key={i}><td><b>{r.sup}</b> · {r.ger}</td><td>{fmt(r.c.aprovada ?? 0)}</td><td>{fmt(r.c.documento ?? 0)}</td><td>{fmt(r.c.reprovada ?? 0)}</td>
                    <td>{fmt(r.c.unidade ?? 0)}</td><td>{fmt(r.leads)}</td><td><b>{fmt(r.total)}</b></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="rsg-mut">Pastas: propostas do Junix sem venda e sem mudança há mais de {diasTxt(parada)}. Leads: do Comandra, sem contato há mais de {diasTxt(parada)}, com interesse na região. "Base geral" = lead sem corretor hoje, só o diretor distribui.</span>
        </div>
      )}

      {/* 4 · histórico */}
      {encerrados.length > 0 && (
        <div className="rsg-bloco">
          <div className="rsg-bh"><b>Histórico dos resgates</b></div>
          <div className="rsg-tab-wrap">
            <table className="rsg-tab">
              <thead><tr><th>Lançamento</th><th>Período</th><th>Distribuídos</th><th>Visitas</th><th>Vendas / meta</th><th>Resultado</th><th>Para o próximo</th></tr></thead>
              <tbody>
                {encerrados.map((l) => {
                  const p = l.placar_final ?? vazio;
                  return (
                    <tr key={l.id}><td><b>{l.nome}</b><br /><small>{regiaoTxt(l.regiao)}</small></td><td>{dm(l.inicio)} a {dm(l.fim)}</td>
                      <td>{fmt(Number(p.agendados ?? 0) + Number(p.entregues ?? 0))}</td><td>{fmt(Number(p.visitas ?? 0))}</td>
                      <td>{fmt(Number(p.vendas ?? 0))}{l.meta_vendas ? ` / ${l.meta_vendas}` : ""}</td>
                      <td>{l.resultado ? <span className={`rsg-res ${l.resultado}`}>{RESULTADO[l.resultado]}</span> : "—"}</td>
                      <td className="rsg-txt">{l.proximo || l.funcionou || "—"}</td></tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {form && <FormLancamento lanc={form === "novo" ? null : form} supers={supers} ultimo={encerrados[0] ?? null} fechar={() => setForm(null)} salvo={recarregar} />}
      {distribuir && <Distribuir lanc={distribuir} supers={supers} diretoria={diretoria} paradaIni={parada} fechar={() => setDistribuir(null)} salvo={recarregar} />}
      {encerrar && <Encerrar lanc={encerrar} placar={somaPlacar(placares[encerrar.id] ?? [])} linhas={placares[encerrar.id] ?? []} fechar={() => setEncerrar(null)} salvo={recarregar} />}
    </section>
  );
}

function Gaveta({ titulo, sub, fechar, children }: { titulo: string; sub: string; fechar: () => void; children: React.ReactNode }) {
  return (
    <div className="rsg-fundo" onClick={fechar}>
      <style>{CSS}</style>
      <aside className="rsg-gaveta" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="rsg-g-top">
          <div><span className="rsg-kick">{sub}</span><h2>{titulo}</h2></div>
          <button type="button" className="rsg-x" aria-label="Fechar" onClick={fechar}>×</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function FormLancamento({ lanc, supers, ultimo, fechar, salvo }: { lanc: Lanc | null; supers: SuperDiretoria[]; ultimo: Lanc | null; fechar: () => void; salvo: () => void }) {
  const [v, setV] = useState({
    nome: lanc?.nome ?? "", regiao: lanc?.regiao ?? "ZONA OESTE", bairros: lanc?.bairros ?? "", inicio: lanc?.inicio ?? "", fim: lanc?.fim ?? "",
    meta: lanc?.meta_vendas != null ? String(lanc.meta_vendas) : "", resp: lanc?.responsavel_id ?? "", emp: lanc?.empreendimento_junix ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const { data: emps = [] } = useQuery({
    queryKey: ["junix-empreendimentos-nomes"], staleTime: 30 * 60_000,
    queryFn: async () => (((await supabase.from("junix_empreendimentos" as any).select("nome").order("nome")).data ?? []) as any[]).map((r) => r.nome as string),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.rpc("resgate_salvar_lancamento" as any, {
      p_id: lanc?.id ?? null, p_nome: v.nome, p_regiao: v.regiao, p_bairros: v.bairros, p_inicio: v.inicio || null, p_fim: v.fim || null,
      p_meta: v.meta ? Number(v.meta) : null, p_responsavel: v.resp || null, p_empreendimento: v.emp || null,
    });
    setSalvando(false);
    if (error) { toast.error(erro(error)); return; }
    toast.success(lanc ? "Lançamento atualizado." : "Lançamento cadastrado como planejado.");
    salvo(); fechar();
  }
  return (
    <Gaveta titulo={lanc ? `Editar ${lanc.nome}` : "Cadastrar próximo lançamento"} sub="Resgate para lançamentos" fechar={fechar}>
      {!lanc && ultimo?.proximo && <div className="rsg-licao"><b>Lição do último ({ultimo.nome}):</b> {ultimo.proximo}</div>}
      <div className="rsg-form">
        <label>Nome do lançamento<input value={v.nome} onChange={set("nome")} placeholder="Ex.: Condomínio Spin Zona Sul" /></label>
        <label>Empreendimento no Junix (opcional)
          <select value={v.emp} onChange={set("emp")}><option value="">Ainda não está no Junix</option>{emps.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <label>Região<select value={v.regiao} onChange={set("regiao")}>{REGIOES.map((r) => <option key={r} value={r}>{regiaoTxt(r)}</option>)}</select></label>
        <label>Bairros que contam (opcional)<input value={v.bairros} onChange={set("bairros")} placeholder="Ex.: Lapa, Barra Funda, Perdizes" /></label>
        <label>Começa em<input type="date" value={v.inicio} onChange={set("inicio")} /></label>
        <label>Termina em<input type="date" value={v.fim} onChange={set("fim")} /></label>
        <label>Meta de vendas do resgate<input type="number" min={0} value={v.meta} onChange={set("meta")} placeholder="Ex.: 10" /></label>
        <label>Responsável<select value={v.resp} onChange={set("resp")}><option value="">Diretoria</option>{supers.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
      </div>
      <div className="rsg-acoes"><button type="button" className="rsg-btn" disabled={salvando} onClick={salvar}>{lanc ? "Salvar" : "Salvar como planejado"}</button>
        <button type="button" className="rsg-btn ghost" onClick={fechar}>Cancelar</button></div>
    </Gaveta>
  );
}

function Distribuir({ lanc, supers, diretoria, paradaIni, fechar, salvo }: { lanc: Lanc; supers: SuperDiretoria[]; diretoria: boolean; paradaIni: number; fechar: () => void; salvo: () => void }) {
  const [cats, setCats] = useState<Set<string>>(new Set(["aprovada", "documento", "unidade"]));
  const [soCelular, setSoCelular] = useState(true);
  const [so2anos, setSo2anos] = useState(true);
  const [parada, setParada] = useState(paradaIni);
  const [quentes, setQuentes] = useState(true);
  const [devolver, setDevolver] = useState(true);
  const [marc, setMarc] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<"igual" | "qtd">("igual");
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [ritmo, setRitmo] = useState(10);
  const [prazo, setPrazo] = useState(48);
  const [seNao, setSeNao] = useState("proximo");
  const [avisar, setAvisar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const ids = useMemo(() => new Set(supers.map((s) => s.id)), [supers]);

  const { data: pastas } = useQuery({
    queryKey: ["resgate-pastas-regiao", lanc.regiao], staleTime: 5 * 60_000,
    queryFn: async () => {
      const out: Pasta[] = [];
      for (let de = 0; de < 20000; de += 1000) {
        const { data } = await supabase.from("resgate_pastas" as any).select("proposta_id,cliente,motivo,corretor,gerente,superintendente,celular,cadastrada_em,alterada_em")
          .eq("regiao", lanc.regiao).range(de, de + 999);
        out.push(...(((data ?? []) as unknown) as Pasta[]));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
  const { data: leads } = useQuery({
    queryKey: ["resgate-leads-regiao", lanc.regiao, parada], staleTime: 5 * 60_000,
    queryFn: async () => ((await supabase.rpc("resgate_leads_da_regiao" as any, { p_regiao: lanc.regiao, p_dias: parada })).data ?? []) as unknown as { id: string; nome: string; broker_id: string | null; gerente_id: string | null }[],
  });
  // quem já está num resgate não aparece de novo
  const { data: jaEnviados } = useQuery({
    queryKey: ["resgate-envios-ativos"], staleTime: 60_000,
    queryFn: async () => {
      const s = new Set<string>();
      for (let de = 0; de < 50000; de += 1000) {
        const { data } = await supabase.from("resgate_envios" as any).select("proposta_id,lead_id").in("status", ["agendado", "entregue", "descartado"]).range(de, de + 999);
        for (const r of ((data ?? []) as any[])) s.add(r.proposta_id ?? r.lead_id);
        if (!data || data.length < 1000) break;
      }
      return s;
    },
  });
  // corretores que podem receber: ativos e recebendo lead
  const corretoresIds = useMemo(() => supers.flatMap((s) => s.gerentes.flatMap((g) => g.corretores_lista.map((c) => c.id))), [supers]);
  const { data: recebendo } = useQuery({
    queryKey: ["resgate-recebendo", corretoresIds.length], enabled: corretoresIds.length > 0, staleTime: 60_000,
    queryFn: async () => {
      const s = new Set<string>();
      for (let i = 0; i < corretoresIds.length; i += 150) {
        const { data } = await supabase.from("profiles").select("id").in("id", corretoresIds.slice(i, i + 150)).eq("is_active", true).eq("lead_assignment_enabled", true);
        for (const r of data ?? []) s.add(r.id);
      }
      return s;
    },
  });
  const equipes = useMemo(() => supers.flatMap((s) => s.gerentes.map((g) => ({
    k: g.id, ger: g.nome, sup: s.nome, cs: g.corretores_lista.filter((c) => recebendo?.has(c.id)).sort((a, b) => a.nome.localeCompare(b.nome)),
  }))).filter((e) => e.cs.length), [supers, recebendo]);
  const todosCor = equipes.flatMap((e) => e.cs);
  const porChave = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of todosCor) { const k = chaveNome(c.nome); m.set(k, [...(m.get(k) ?? []), c.id]); }
    return m;
  }, [todosCor]);

  // candidatos dentro do escopo e dos filtros
  const candidatos = useMemo(() => {
    const hoje = Date.now();
    const dias = (d: string | null) => (d ? (hoje - new Date(d + "T12:00:00").getTime()) / 864e5 : 9999);
    const doisAnos = 730;
    const out: { origem: "pasta" | "lead"; ref: string; motivo: string; dono: string | null; quando: number }[] = [];
    for (const p of pastas ?? []) {
      if (!cats.has(p.motivo) || jaEnviados?.has(p.proposta_id)) continue;
      if (soCelular && !p.celular) continue;
      if (so2anos && dias(p.cadastrada_em) > doisAnos) continue;
      if (dias(p.alterada_em ?? p.cadastrada_em) < parada) continue;
      const d = donoJunix(supers, p.superintendente, p.gerente).superId;
      if (!(ids.has(d) || (diretoria && d === "fora"))) continue;
      const mesmo = porChave.get(chaveNome(p.corretor));
      out.push({ origem: "pasta", ref: p.proposta_id, motivo: p.motivo, dono: mesmo && mesmo.length === 1 ? mesmo[0] : null, quando: dias(p.alterada_em ?? p.cadastrada_em) });
    }
    if (cats.has("lead")) for (const l of leads ?? []) {
      if (jaEnviados?.has(l.id)) continue;
      out.push({ origem: "lead", ref: l.id, motivo: "lead", dono: l.broker_id, quando: 0 });
    }
    if (quentes) out.sort((a, b) => ORDEM_QUENTE.indexOf(a.motivo) - ORDEM_QUENTE.indexOf(b.motivo) || a.quando - b.quando);
    return out;
  }, [pastas, leads, cats, jaEnviados, soCelular, so2anos, parada, supers, ids, diretoria, porChave, quentes]);

  const contaCat = (k: string) => candidatos.filter((c) => c.motivo === k).length;
  const escolhidos = todosCor.filter((c) => marc.has(c.id));
  const cotaTotal = modo === "qtd" ? escolhidos.reduce((a, c) => a + (Number(qtd[c.id]) || 0), 0) : Infinity;
  const nItens = Math.min(candidatos.length, cotaTotal);
  const voltaDono = devolver ? candidatos.slice(0, nItens).filter((c) => c.dono && marc.has(c.dono)).length : 0;
  const porCorretor = escolhidos.length ? Math.ceil(nItens / escolhidos.length) : 0;
  const diasFim = ritmo > 0 && porCorretor ? Math.ceil(porCorretor / ritmo) : (nItens ? 1 : 0);
  const achados = busca.trim() ? todosCor.filter((c) => chaveNome(c.nome).includes(chaveNome(busca)) || c.nome.toLowerCase().includes(busca.trim().toLowerCase())) : [];
  const toggle = (id: string) => setMarc((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCat = (k: string) => setCats((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const pill = (c: { id: string; nome: string; carteira: number }) => (
    <label key={c.id} className={`rsg-cor${marc.has(c.id) ? " on" : ""}`}>
      <input type="checkbox" checked={marc.has(c.id)} onChange={() => toggle(c.id)} />
      <span><b>{c.nome}</b><small>{fmt(c.carteira ?? 0)} leads na carteira</small></span>
      {modo === "qtd" && marc.has(c.id) && (
        <input type="number" min={0} className="rsg-qtd" aria-label={`Quantos para ${c.nome}`} value={qtd[c.id] ?? ""} onChange={(e) => setQtd({ ...qtd, [c.id]: e.target.value })} placeholder="qtd" onClick={(e) => e.preventDefault()} />
      )}
    </label>
  );

  async function confirmar() {
    if (!escolhidos.length) { toast.error(ERROS.escolha_corretores); return; }
    if (!nItens) { toast.error("Nenhum contato com esses filtros."); return; }
    setEnviando(true);
    const itens = candidatos.slice(0, nItens).map((c) => ({ origem: c.origem, ref: c.ref, corretor: devolver && c.dono && marc.has(c.dono) ? c.dono : null }));
    const cota = modo === "qtd" ? Object.fromEntries(escolhidos.map((c) => [c.id, Number(qtd[c.id]) || 0])) : null;
    const { data, error } = await supabase.rpc("resgate_distribuir" as any, {
      p_lanc: lanc.id, p_itens: itens, p_corretores: escolhidos.map((c) => c.id), p_qtd: cota, p_ritmo: ritmo,
      p_prazo_h: prazo, p_se_nao: seNao, p_avisar: avisar, p_parada: parada, p_so_celular: soCelular,
    });
    setEnviando(false);
    if (error) { toast.error(erro(error)); return; }
    const r = data as any;
    toast.success(`${fmt(r?.agendados ?? 0)} contatos distribuídos${r?.pulados ? ` (${fmt(r.pulados)} pulados: já em outro resgate ou mexidos há pouco)` : ""}. A entrega começa na próxima hora.`);
    salvo(); fechar();
  }

  const carregando = !pastas || !leads || !jaEnviados || !recebendo;
  return (
    <Gaveta titulo={`${lanc.nome} · ${regiaoTxt(lanc.regiao)}`} sub="Distribuir para a equipe" fechar={fechar}>
      <section className="rsg-sec">
        <h4>1 · O que distribuir</h4>
        {carregando ? <span className="rsg-mut">Carregando pastas e leads da região…</span> : (
          <div className="rsg-lista">
            {MOTIVOS.map((m) => (
              <label key={m.k}><input type="checkbox" checked={cats.has(m.k)} onChange={() => toggleCat(m.k)} />
                <span><b>{m.nome}</b><small>{m.dica}</small></span><b>{cats.has(m.k) ? fmt(contaCat(m.k)) : "—"}</b></label>
            ))}
            <label><input type="checkbox" checked={cats.has("lead")} onChange={() => toggleCat("lead")} />
              <span><b>Leads parados há +{diasTxt(parada)}</b><small>interesse na {regiaoTxt(lanc.regiao)}{diretoria ? " (inclui a base sem corretor)" : ""}</small></span>
              <b>{cats.has("lead") ? fmt(contaCat("lead")) : "—"}</b></label>
          </div>
        )}
        <div className="rsg-chips">
          <label className="rsg-sel">Parada há mais de
            <select value={parada} onChange={(e) => setParada(Number(e.target.value))}>{[30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{diasTxt(d)}</option>)}</select>
          </label>
          <label className="rsg-tg box"><input type="checkbox" checked={soCelular} onChange={(e) => setSoCelular(e.target.checked)} />Só pasta com celular</label>
          <label className="rsg-tg box"><input type="checkbox" checked={so2anos} onChange={(e) => setSo2anos(e.target.checked)} />Abertas nos últimos 2 anos</label>
          <label className="rsg-tg box"><input type="checkbox" checked={quentes} onChange={(e) => setQuentes(e.target.checked)} />Mais quentes primeiro</label>
        </div>
      </section>

      <section className="rsg-sec">
        <h4>2 · Para quem</h4>
        <label className="rsg-dest"><input type="checkbox" checked={devolver} onChange={(e) => setDevolver(e.target.checked)} />
          <span><b>Devolver primeiro para quem abriu a pasta (ou atendia o lead)</b><small>Se o corretor está ativo e marcado abaixo, recebe o próprio cliente. Os outros vão para os escolhidos.</small></span></label>
        <input type="search" className="rsg-busca" aria-label="Procurar corretor" placeholder="Procurar corretor pelo nome…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {busca.trim() ? <div className="rsg-cors">{achados.length ? achados.map(pill) : <span className="rsg-mut">Ninguém com esse nome.</span>}</div> : equipes.map((e) => {
          const aberto = abertos.has(e.k) || equipes.length <= 3; const n = e.cs.filter((c) => marc.has(c.id)).length; const todos = e.cs.every((c) => marc.has(c.id));
          return (
            <div key={e.k} className="rsg-eq">
              <div className="rsg-eq-top">
                <button type="button" className="rsg-eq-btn" aria-expanded={aberto} onClick={() => setAbertos((s) => { const x = new Set(s); x.has(e.k) ? x.delete(e.k) : x.add(e.k); return x; })}>
                  <span>{aberto ? "▾" : "▸"} {e.ger}</span><small>super {e.sup} · {e.cs.length} corretor{e.cs.length > 1 ? "es" : ""}{n ? ` · ${n} escolhido${n > 1 ? "s" : ""}` : ""}</small>
                </button>
                <button type="button" className="rsg-link" onClick={() => setMarc((s) => { const x = new Set(s); e.cs.forEach((c) => (todos ? x.delete(c.id) : x.add(c.id))); return x; })}>{todos ? "desmarcar equipe" : "marcar equipe"}</button>
              </div>
              {aberto && <div className="rsg-cors">{e.cs.map(pill)}</div>}
            </div>
          );
        })}
        <span className="rsg-mut">Só aparecem corretores ativos e recebendo lead{diretoria ? "" : ", das suas equipes"}.</span>
      </section>

      <section className="rsg-sec">
        <h4>3 · Como dividir</h4>
        <div className="rsg-2" role="radiogroup" aria-label="Divisão">
          <label className={`rsg-op${modo === "igual" ? " on" : ""}`}><input type="radio" name="rsg-modo" checked={modo === "igual"} onChange={() => setModo("igual")} /><span><b>Igual entre todos</b><small>rodízio, um para cada</small></span></label>
          <label className={`rsg-op${modo === "qtd" ? " on" : ""}`}><input type="radio" name="rsg-modo" checked={modo === "qtd"} onChange={() => setModo("qtd")} /><span><b>Quantidade por corretor</b><small>você define quantos cada um recebe</small></span></label>
        </div>
        <div className="rsg-2">
          <label className="rsg-campo">Ritmo
            <select value={ritmo} onChange={(e) => setRitmo(Number(e.target.value))}><option value={5}>5 por corretor por dia</option><option value={10}>10 por corretor por dia</option><option value={20}>20 por corretor por dia</option><option value={0}>Tudo hoje</option></select>
          </label>
          <label className="rsg-campo">Prazo para chamar
            <select value={prazo} onChange={(e) => setPrazo(Number(e.target.value))}><option value={24}>24 horas</option><option value={48}>48 horas</option><option value={72}>72 horas</option></select>
          </label>
        </div>
        <label className="rsg-campo">Se não chamar no prazo
          <select value={seNao} onChange={(e) => setSeNao(e.target.value)}><option value="proximo">Passa para o próximo escolhido</option><option value="gerente">Volta para o gerente decidir</option><option value="avisa">Fica com ele, só avisa o gerente</option></select>
        </label>
      </section>

      <section className="rsg-sec">
        <h4>4 · Aviso ao corretor</h4>
        <label className="rsg-tg"><input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} />Avisar no WhatsApp (chip do gerente; sem chip, o do super ou o da diretoria)</label>
        <div className="rsg-msg"><b>Resgate {lanc.nome}: você recebeu [n] clientes hoje.</b><br />São pessoas que já abriram pasta ou falaram com a gente. Chame cada uma e conte do lançamento na região dela. Prazo: {prazo} horas.</div>
        <span className="rsg-mut">No painel do corretor o cliente chega com a origem "RESGATE · {lanc.nome}" e o motivo da parada nas anotações.</span>
      </section>

      <div className="rsg-resumo">
        <div className="rsg-3"><span>Contatos<b>{fmt(nItens)}</b></span><span>Corretores<b>{escolhidos.length}</b></span><span>Termina em<b>{diasFim ? `${diasFim} dia${diasFim > 1 ? "s" : ""}` : "—"}</b></span></div>
        <span className="rsg-mut">{escolhidos.length ? `Cerca de ${fmt(porCorretor)} por corretor${ritmo ? `, ${ritmo} por dia (seg a sáb)` : ", tudo hoje"}.` : "Escolha os corretores."}{voltaDono ? ` ${fmt(voltaDono)} voltam para o corretor que abriu a pasta.` : ""}</span>
        <div className="rsg-acoes">
          <button type="button" className="rsg-btn" disabled={enviando || carregando} onClick={confirmar}>Distribuir {fmt(nItens)} contatos</button>
          <button type="button" className="rsg-btn ghost" onClick={fechar}>Cancelar</button>
        </div>
      </div>
    </Gaveta>
  );
}

function Encerrar({ lanc, placar, linhas, fechar, salvo }: { lanc: Lanc; placar: Placar; linhas: LinhaPlacar[]; fechar: () => void; salvo: () => void }) {
  const [res, setRes] = useState<"certo" | "parte" | "nao">("certo");
  const [funcionou, setFuncionou] = useState("");
  const [nao, setNao] = useState("");
  const [prox, setProx] = useState("");
  const [sobras, setSobras] = useState("base");
  const [salvando, setSalvando] = useState(false);
  const porMotivo = new Map<string, number>(); const porGer = new Map<string, number>();
  for (const l of linhas) {
    porMotivo.set(l.motivo, (porMotivo.get(l.motivo) ?? 0) + Number(l.visitas) + Number(l.vendas) * 3);
    if (Number(l.entregues)) porGer.set(l.gerente ?? "—", (porGer.get(l.gerente ?? "—") ?? 0) + Number(l.chamados) / Number(l.entregues));
  }
  const melhor = [...porMotivo.entries()].sort((a, b) => b[1] - a[1])[0];
  const gers = [...porGer.entries()].sort((a, b) => b[1] - a[1]);
  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.rpc("resgate_encerrar" as any, { p_lanc: lanc.id, p_resultado: res, p_funcionou: funcionou, p_nao_funcionou: nao, p_proximo: prox, p_sobras: sobras });
    setSalvando(false);
    if (error) { toast.error(erro(error)); return; }
    toast.success(`${lanc.nome} encerrado. O resultado foi para o histórico.`);
    salvo(); fechar();
  }
  return (
    <Gaveta titulo={`${lanc.nome} · como foi?`} sub="Encerrar lançamento" fechar={fechar}>
      <div className="rsg-conta">
        <b>O sistema já contou</b>
        <div className="rsg-3">
          <span>Distribuídos<b>{fmt(placar.agendados + placar.entregues)}</b></span><span>Chamados<b>{fmt(placar.chamados)}</b></span><span>Visitas<b>{fmt(placar.visitas)}</b></span>
          <span>Pastas novas<b>{fmt(placar.pastas)}</b></span><span>Vendas<b>{fmt(placar.vendas)}</b></span><span>Meta<b>{lanc.meta_vendas ?? "—"}</b></span>
        </div>
        {(melhor || gers.length > 0) && <span className="rsg-mut">
          {melhor ? `Melhor categoria: ${MOTIVOS.find((m) => m.k === melhor[0])?.nome ?? "leads parados"}. ` : ""}
          {gers.length ? `Gerente que mais chamou: ${gers[0][0]}${gers.length > 1 ? ` · menos: ${gers[gers.length - 1][0]}` : ""}.` : ""}
        </span>}
        {placar.agendados > 0 && <span className="rsg-mut">{fmt(placar.agendados)} contatos ainda não tinham saído e não vão mais sair.</span>}
      </div>
      <fieldset className="rsg-fs"><legend>Deu certo?</legend>
        <div className="rsg-3">
          {(["certo", "parte", "nao"] as const).map((k) => <label key={k} className={`rsg-op${res === k ? " on" : ""}`}><input type="radio" name="rsg-res" checked={res === k} onChange={() => setRes(k)} /><b>{RESULTADO[k]}</b></label>)}
        </div>
      </fieldset>
      <label className="rsg-campo">O que funcionou<textarea rows={3} value={funcionou} onChange={(e) => setFuncionou(e.target.value)} placeholder="Ex.: pasta aprovada voltou rápido para visita" /></label>
      <label className="rsg-campo">O que não funcionou<textarea rows={3} value={nao} onChange={(e) => setNao(e.target.value)} placeholder="Ex.: reprovados não tinham renda para a unidade mais barata" /></label>
      <label className="rsg-campo">Para o próximo lançamento<textarea rows={2} value={prox} onChange={(e) => setProx(e.target.value)} placeholder="Ex.: começar pelas aprovadas e pendência; ritmo de 5 por dia" /></label>
      <fieldset className="rsg-fs"><legend>Quem não avançou (não virou visita nem venda)</legend>
        <label className="rsg-tg"><input type="radio" name="rsg-sobra" checked={sobras === "base"} onChange={() => setSobras("base")} />Volta para a base do resgate (pode entrar no próximo lançamento)</label>
        <label className="rsg-tg"><input type="radio" name="rsg-sobra" checked={sobras === "corretor"} onChange={() => setSobras("corretor")} />Fica com o corretor que recebeu</label>
        <label className="rsg-tg"><input type="radio" name="rsg-sobra" checked={sobras === "descartar"} onChange={() => setSobras("descartar")} />Não oferecer mais em resgate nenhum</label>
      </fieldset>
      <div className="rsg-acoes"><button type="button" className="rsg-btn dark" disabled={salvando} onClick={salvar}>Encerrar {lanc.nome}</button><button type="button" className="rsg-btn ghost" onClick={fechar}>Cancelar</button></div>
    </Gaveta>
  );
}

const CSS = `
.rsg{padding:18px 20px;margin:0 0 16px;display:flex;flex-direction:column;gap:16px}
.rsg-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.rsg-chip,.rsg-kick{display:inline-block;padding:3px 10px;border-radius:99px;background:rgba(14,124,123,.12);color:#0B6665;font-size:11.5px;font-weight:800}
.rsg h3{margin:6px 0 4px;font-size:18px;font-weight:800;color:var(--ink,#0F1B2D)}
.rsg p{margin:0;font-size:13px;color:var(--ink-3,#4A5A70)}
.rsg-filtros,.rsg-chips{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rsg-sel{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--ink,#0F1B2D)}
.rsg select,.rsg-gaveta select,.rsg-gaveta input:not([type=checkbox]):not([type=radio]),.rsg-gaveta textarea{min-height:42px;padding:0 10px;border-radius:10px;border:1px solid var(--line,#C9D2DE);background:var(--card,#fff);color:inherit;font:inherit;font-size:14px;box-sizing:border-box}
.rsg-gaveta textarea{padding:10px 12px;resize:vertical;min-height:70px}
.rsg-tg{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:var(--ink,#0F1B2D);min-height:40px;cursor:pointer}
.rsg-tg.box{padding:0 12px;border:1px solid var(--line,#DCE2EA);border-radius:10px}
.rsg input[type=checkbox],.rsg input[type=radio],.rsg-gaveta input[type=checkbox],.rsg-gaveta input[type=radio]{width:18px;height:18px;flex-shrink:0}
.rsg-bloco{display:flex;flex-direction:column;gap:10px}
.rsg-bh{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.rsg-bh>b{font-size:15.5px;color:var(--ink,#0F1B2D)}
.rsg-btn{min-height:44px;padding:0 16px !important;border-radius:10px !important;border:0 !important;background:#0E7C7B !important;color:#fff !important;font-weight:700;font-size:13.5px;cursor:pointer}
.rsg-btn.dark{background:#0F1B2D !important}
.rsg-btn.ghost{background:transparent !important;border:1px solid var(--line,#C9D2DE) !important;color:var(--ink,#22303F) !important}
.rsg-btn:disabled{opacity:.6}
.rsg-lanc-row{border:1px solid var(--line,#DCE2EA);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}
.rsg-lr-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.rsg-lr-top b{font-size:15.5px}.rsg-lr-top small{font-size:12.5px;color:var(--ink-3,#4A5A70)}
.rsg-st{padding:4px 10px;border-radius:99px;font-size:12px;font-weight:800;background:#E6ECF4;color:#22303F}
.rsg-st.andamento{background:#E3F1F1;color:#0B6665}
.rsg-placar{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.rsg-placar span,.rsg-3 span{display:flex;flex-direction:column;font-size:12px;color:var(--ink-3,#4A5A70)}
.rsg-placar b,.rsg-3 b{font-size:19px;color:var(--ink,#0F1B2D)}
.rsg-placar small{font-size:11.5px}
.rsg-acoes{display:flex;gap:8px;flex-wrap:wrap}
.rsg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.rsg-col{border:1px solid var(--line,#DCE2EA);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px}
.rsg-lanc{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.rsg-lanc b{font-size:16.5px;color:var(--ink,#0F1B2D)}.rsg-lanc small{font-size:12px;color:var(--ink-3,#4A5A70)}
.rsg-num{font-size:34px;font-weight:800;color:#0B6665;line-height:1.1}
.rsg-num small{font-size:13px;font-weight:600;color:var(--ink-3,#4A5A70)}
.rsg-mot{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.rsg-mot li{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid var(--line,#EDF0F4);font-size:13.5px;color:var(--ink,#0F1B2D)}
.rsg-mot li span{display:flex;flex-direction:column}.rsg-mot li small{font-size:12px;color:var(--ink-3,#4A5A70)}
.rsg-mot li>b{font-size:15px;font-variant-numeric:tabular-nums}
.rsg-cel{font-size:12.5px;color:var(--ink-3,#3C4B5F);background:var(--bg,#F4F6F9);border-radius:10px;padding:9px 11px}
.rsg-pills{display:flex;gap:6px;flex-wrap:wrap}
.rsg-pills button{min-height:38px;padding:0 13px !important;border-radius:99px !important;border:1px solid var(--line,#C9D2DE) !important;background:transparent !important;color:var(--ink,#3C4B5F) !important;font-size:13px;font-weight:600;cursor:pointer}
.rsg-pills button.on{background:#0F1B2D !important;border-color:#0F1B2D !important;color:#fff !important}
.rsg-tab-wrap{overflow-x:auto}
.rsg-tab{width:100%;border-collapse:collapse;font-size:13.5px;min-width:720px}
.rsg-tab th{text-align:right;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3,#4A5A70);padding:8px;border-bottom:2px solid var(--line,#DCE2EA)}
.rsg-tab th:first-child,.rsg-tab td:first-child{text-align:left}
.rsg-tab td{text-align:right;padding:9px 8px;border-bottom:1px solid var(--line,#EDF0F4);color:var(--ink,#0F1B2D)}
.rsg-tab td.rsg-txt{text-align:left;max-width:320px;color:var(--ink-3,#3C4B5F)}
.rsg-res{padding:3px 9px;border-radius:99px;font-size:12px;font-weight:800}
.rsg-res.certo{background:#E3F1F1;color:#0B6665}.rsg-res.parte{background:#FDF0E6;color:#8A4A0B}.rsg-res.nao{background:#F8E5E3;color:#8E2A22}
.rsg-mut{font-size:12.5px;color:var(--ink-3,#4A5A70)}
.rsg-fundo{position:fixed;inset:0;background:rgba(15,27,45,.35);z-index:70;display:flex;justify-content:flex-end}
.rsg-gaveta{width:min(720px,100%);height:100%;overflow-y:auto;box-sizing:border-box;padding:22px 24px;display:flex;flex-direction:column;gap:16px;background:var(--card,#fff);color:var(--ink,#0F1B2D);box-shadow:-8px 0 30px rgba(0,0,0,.18);font-size:14px}
.rsg-gaveta>*{flex-shrink:0}
.rsg-g-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.rsg-g-top h2{margin:6px 0 0;font-size:20px;font-weight:800}
.rsg-x{min-width:44px;min-height:44px;border-radius:10px !important;border:1px solid var(--line,#CFD7E3) !important;background:transparent !important;color:inherit;font-size:20px;cursor:pointer}
.rsg-sec{display:flex;flex-direction:column;gap:10px}
.rsg-sec h4{margin:0;font-size:15px;font-weight:800}
.rsg-lista{display:flex;flex-direction:column;border:1px solid var(--line,#DCE2EA);border-radius:12px}
.rsg-lista label{display:flex;align-items:center;gap:12px;padding:10px 14px;min-height:48px;cursor:pointer}
.rsg-lista label+label{border-top:1px solid var(--line,#EDF0F4)}
.rsg-lista span{flex:1;display:flex;flex-direction:column}.rsg-lista small,.rsg-dest small,.rsg-op small,.rsg-cor small{font-size:12px;color:var(--ink-3,#4A5A70)}
.rsg-dest{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid #0E7C7B;background:rgba(14,124,123,.07);border-radius:12px;cursor:pointer}
.rsg-dest span{display:flex;flex-direction:column}
.rsg-busca{width:100%}
.rsg-eq{border:1px solid var(--line,#DCE2EA);border-radius:12px;padding:8px 12px;display:flex;flex-direction:column;gap:8px}
.rsg-eq-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.rsg-eq-btn{display:flex;flex-direction:column;align-items:flex-start;min-height:42px;justify-content:center;background:transparent !important;border:0 !important;color:inherit !important;cursor:pointer;text-align:left;padding:0 !important}
.rsg-eq-btn span{font-size:14px;font-weight:700}.rsg-eq-btn small{font-size:12px;color:var(--ink-3,#4A5A70)}
.rsg-link{background:none !important;border:0 !important;color:#0B6665 !important;font-weight:700;font-size:13px;cursor:pointer;padding:8px !important;min-height:40px}
.rsg-cors{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.rsg-cor{display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 10px;border:1px solid var(--line,#DCE2EA);border-radius:10px;cursor:pointer;box-sizing:border-box}
.rsg-cor.on{border-color:#0E7C7B;background:rgba(14,124,123,.07)}
.rsg-cor span{flex:1;display:flex;flex-direction:column;min-width:0}
.rsg-cor b{font-size:13.5px}
.rsg-qtd{width:64px !important;min-height:36px !important}
.rsg-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.rsg-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.rsg-op{display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid var(--line,#DCE2EA);border-radius:12px;cursor:pointer}
.rsg-op.on{border-color:#0E7C7B;background:rgba(14,124,123,.07)}
.rsg-op span{display:flex;flex-direction:column}
.rsg-campo{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:var(--ink-3,#3C4B5F)}
.rsg-campo select,.rsg-campo textarea{font-weight:400}
.rsg-msg{background:var(--bg,#F4F6F9);border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5}
.rsg-resumo{margin-top:auto;border-top:2px solid var(--line,#DCE2EA);padding-top:14px;display:flex;flex-direction:column;gap:10px}
.rsg-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.rsg-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:var(--ink-3,#3C4B5F)}
.rsg-form label input,.rsg-form label select{font-weight:400}
.rsg-licao{background:rgba(14,124,123,.08);border-radius:12px;padding:12px 14px;font-size:13.5px}
.rsg-conta{background:var(--bg,#F4F6F9);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px}
.rsg-fs{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.rsg-fs legend{font-size:13.5px;font-weight:800;margin-bottom:6px}
@media (max-width:640px){.rsg-2,.rsg-3,.rsg-form{grid-template-columns:1fr}}
`;
