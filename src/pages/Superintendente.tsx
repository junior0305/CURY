/* Painel do Superintendente — a visão de cima do gerente.
 *
 * Mostra o consolidado de todos os gerentes abaixo dele e deixa entrar no
 * painel de cada um (drill-down). Reusa o painel do gerente inteiro: clicar num
 * gerente abre /manager?manager=<id>, e o painel do gerente já sabe se
 * escopar por esse id (useEffectiveManagerId).
 *
 * O super tem o MESMO rail do gerente (Tempo real, Time, Leads, Pastas,
 * Disparar, Onde atacar, B.I.) — não é um painel menor. "Tempo real"/"Time" do
 * super é o consolidado; Disparar e Onde atacar funcionam direto (o Disparar tem
 * o seletor de gerente); Leads/Pastas são usados entrando num gerente pelo card.
 *
 * Havera 3+ superintendentes; cada um ve so os gerentes dele (a RPC ja escopa).*/
import MinhasTarefas from "@/components/estrategia/MinhasTarefas";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CadastrarCorretor from "@/components/manager-v10/CadastrarCorretor";
import DesligarCorretor from "@/components/manager-v10/DesligarCorretor";
import VincularNomes from "@/components/manager-v10/VincularNomes";
import MetaCascata from "@/components/manager-v10/MetaCascata";
import { useConsolidadoSuper, type LinhaConsolidado } from "@/hooks/useConsolidadoSuper";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { useSuperintendenteRollup, useCampanhasNaoLead, type GerenteRollup, type CorretorRollup, type CampanhaNaoLead } from "@/hooks/useSuperintendente";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import BiTab from "@/components/manager-v10/BiTab";
import { Boundary } from "@/components/manager-v10/Boundary";
import "@/styles/manager-v10.css";
import "@/styles/superintendente.css";
import "@/styles/diretoria.css";
import PlanoEstrategico from "@/components/plano/PlanoEstrategico";
import GastosPlano from "@/components/plano/GastosPlano";
import SalaDeGuerraSuper from "@/components/superintendente/SalaDeGuerraSuper";
import PastasSuper from "@/components/superintendente/PastasSuper";
import LeadsAnunciosSuper from "@/components/superintendente/LeadsAnunciosSuper";
import Configuracoes from "@/components/config/Configuracoes";
import PainelGeralSuper from "@/components/superintendente/PainelGeralSuper";
import SalaDeGuerra from "@/components/super2/SalaDeGuerra";
import PastasDoSuper from "@/components/super2/Pastas";
import LeadsSuper from "@/components/super2/LeadsSuper";
import TelaSuper from "@/components/super2/Tela";
import Tropa from "@/components/super2/Tropa";
import PainelGeral from "@/components/super2/PainelGeral";
import { useDiretorId, useDiretoria } from "@/hooks/useDiretoria";

const PERIODOS: [number, string][] = [[1, "Hoje"], [7, "Semana"], [30, "Mês"]];

type AbaSuper = "consolidado" | "estrategia" | "pastas" | "leads" | "time" | "bi" | "campanhas" | "plano" | "gastos" | "config" | "midia";

export default function Superintendente() {
  const { session, role } = useAuth();
  const { mode, toggle } = useTheme();
  // Admin abre a tela do diretor: enxerga a empresa pelo perfil DIRECTOR (supers abaixo dele).
  const { data: diretorId } = useQuery({
    queryKey: ["perfil-diretor"],
    enabled: role === "ADMIN",
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id").eq("role", "DIRECTOR").eq("is_active", true)
        .order("created_at").limit(1).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
  });
  const ehDiretoria = role === "DIRECTOR" || role === "ADMIN";
  const superId = role === "ADMIN" ? (diretorId ?? undefined) : session?.user?.id;

  // Busca o nome do Superintendente para Sala de Guerra e Pastas
  const { data: superPerfil } = useQuery({
    queryKey: ["super-perfil-nome", superId],
    enabled: !!superId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("first_name, last_name").eq("id", superId!).maybeSingle();
      if (!data) return "Superintendente";
      return [data.first_name, data.last_name].filter(Boolean).join(" ") || "Superintendente";
    },
  });

  const nav = useNavigate();
  const [dias, setDias] = useState(30);
  const [params] = useSearchParams();
  const abaUrl = params.get("aba");
  const subGuerra = abaUrl === "plano" || abaUrl === "gastos" ? abaUrl : undefined;
  const [aba, setAba] = useState<AbaSuper>(
    abaUrl === "estrategia" || abaUrl === "pastas" || abaUrl === "leads" || abaUrl === "time" || abaUrl === "bi" || abaUrl === "campanhas" || abaUrl === "plano" || abaUrl === "gastos" || abaUrl === "config" || abaUrl === "regua" || abaUrl === "midia"
      ? ((abaUrl === "regua" ? "config" : abaUrl === "plano" || abaUrl === "gastos" ? "estrategia" : abaUrl === "campanhas" ? "consolidado" : abaUrl) as AbaSuper)
      : "consolidado"
  );
  // quais gerentes estão expandidos (mostrando os corretores)
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const toggleGer = (id: string) => setAberto((v) => ({ ...v, [id]: !v[id] }));
  const { data, isLoading, error } = useSuperintendenteRollup(superId, dias);
  // Pastas precisa da lista de superintendências (dono de cada pasta do Junix); só busca quando a aba abre
  const { data: dirIdPastas } = useDiretorId(aba === "pastas" ? role : null, session?.user?.id);
  const { data: diretoriaPastas } = useDiretoria(aba === "pastas" ? dirIdPastas : null, 30);
  loadFonts();

  const abrir = (id: string) => nav(`/manager?manager=${id}`);
  const t = data?.total;

  return (
    <div className="mgr10 app2 sup">
      <Boundary>
      <RailV10
        atual={
          aba === "estrategia"
            ? "estrategia"
            : aba === "pastas"
            ? "pastas"
            : aba === "leads"
            ? "leads"
            : aba === "time"
            ? "time"
            : aba === "bi"
            ? "bi"
            : aba === "config"
            ? "config"
            : aba === "midia"
            ? "leads"
            : "tempo"
        }
        mode={mode}
        toggle={toggle}
        onAba={(k) => {
          if (k === "estrategia") setAba("estrategia");
          else if (k === "pastas") setAba("pastas");
          else if (k === "leads") setAba("leads");
          else if (k === "time") setAba("time");
          else if (k === "bi") setAba("bi");
          else if (k === "config") setAba("config");
          else if (k === "anuncios") setAba("midia");
          else setAba("consolidado");
        }}
      />
      <main className="shell2">
        <div className="sup-wrap">
          {aba === "bi" ? (
            <div className="sup-top">
              <div>
                <h1>{ehDiretoria ? "Diretoria" : "Superintendência"}</h1>
                <p>{ehDiretoria ? "A empresa inteira — todas as superintendências e equipes, num lugar só"
                  : "A operação inteira das suas equipes, num lugar só"}</p>
              </div>
            </div>
          ) : null}

          {!ehDiretoria && aba === "consolidado" ? <MinhasTarefas donoId={superId ?? undefined} /> : null}
          {aba === "estrategia" && superId ? (
            <TelaSuper><SalaDeGuerra superId={superId}
              superNome={superPerfil || session?.user?.user_metadata?.name || session?.user?.email?.split("@")[0] || "Superintendente"}
              abaInicial={subGuerra} /></TelaSuper>
          ) : aba === "pastas" && superId ? (
            <TelaSuper><PastasDoSuper superId={superId} /></TelaSuper>
          ) : aba === "leads" && superId ? (
            <LeadsSuper key="leads" superId={superId} inicial="leads" />
          ) : aba === "midia" && superId ? (
            <LeadsSuper key="midia" superId={superId} inicial="midia" />
          ) : aba === "config" ? (
            <Configuracoes nivel={ehDiretoria ? "diretor" : "super"} donoId={ehDiretoria ? null : (session?.user?.id ?? null)} />
          ) : aba === "time" && superId ? (
            <TelaSuper><Tropa superId={superId} /></TelaSuper>
          ) : aba === "bi" ? (
            <BiTab scope="super" managerId={superId} />
          ) : (
            superId ? (
              <PainelGeral superId={superId}
                superNome={superPerfil || session?.user?.user_metadata?.name || "Superintendente"}
                onAbrir={abrir} irPara={(a) => setAba(a === "midia" ? "midia" : a === "pastas" ? "pastas" : "leads")} />
            ) : <p className="sup-vazio">Carregando…</p>
          )}
        </div>
      </main>
      </Boundary>
    </div>
  );
}

/* Todas as fontes por gerente, numa tabela: C2S (plantão/visita), Junix (venda,
 * VGV, pastas), Facebook (gasto, leads, custo) e Comandra (leads por origem e a
 * carteira que ninguém tocou). Clicar no gerente entra no painel dele. */
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const nf = (n: number) => n.toLocaleString("pt-BR");
const vgvCurto = (n: number) => n >= 1e6 ? `R$ ${(n / 1e6).toFixed(1).replace(".", ",")} mi` : n ? `R$ ${Math.round(n / 1e3)} mil` : "—";

function ConsolidadoFontes({ superId, dias, onAbrir }: { superId: string | undefined; dias: number; onAbrir: (id: string) => void }) {
  const { data, isLoading, error } = useConsolidadoSuper(superId, dias);
  if (isLoading) return <p className="sup-vazio">Juntando C2S, Junix, Facebook e Comandra…</p>;
  if (error || !data) return <p className="sup-vazio" style={{ color: "var(--red)" }}>Não consegui juntar as fontes agora.</p>;
  const t = data.total;
  const totalLeads = (x: LinhaConsolidado["leads"]) => x.anuncio + x.disparo + x.pescados + x.outros;
  const cpl = (g: number | null, l: number | null) => (g && l ? brl(g / l) : "—");
  const cpv = (g: number | null, v: number) => (g && v ? brl(g / v) : "—");
  const per = dias === 1 ? "hoje" : `últimos ${dias} dias`;
  const celulas = (x: LinhaConsolidado | (typeof t & { id?: string })) => {
    const gasto = "gasto" in x ? (x as any).gasto : null;
    const leadsFb = (x as any).leadsFb;
    return (
      <>
        <td className="sep">{nf(x.plantaoDias)}</td>
        <td>{nf(x.visitas)}</td>
        <td className={`sep${x.vendas ? " bom" : ""}`}>{nf(x.vendas)}</td>
        <td>{vgvCurto(x.vgv)}</td>
        <td>{nf(x.pastas)}</td>
        <td className={x.pastasTravadas ? "ruim" : "dim"}>{nf(x.pastasTravadas)}</td>
        <td className="sep">{gasto == null ? <span className="dim" title={(x as any).fbErro || "sem conta de anúncio"}>—</span> : brl(gasto)}</td>
        <td>{leadsFb == null ? "—" : nf(leadsFb)}</td>
        <td>{cpl(gasto, leadsFb)}</td>
        <td>{cpv(gasto, x.vendas)}</td>
        <td className="sep">{nf(x.leads.anuncio)}</td>
        <td>{nf(x.leads.disparo)}</td>
        <td>{nf(x.leads.pescados)}</td>
        <td>{nf(totalLeads(x.leads))}</td>
        <td className={x.nuncaFalaram ? "ruim" : "dim"}>{nf(x.nuncaFalaram)}</td>
      </>
    );
  };
  return (
    <>
      <div className="sup-h">Resultado das equipes <span>{per} · clique no gerente para entrar no painel dele</span></div>
      <div className="sup-src"><em>C2S · plantão e visita</em><em>Junix · venda e pastas</em><em>Facebook · anúncio</em><em>Comandra · leads</em></div>
      <div className="sup-kpis">
        <div className="sup-k bom"><span>Vendas (Junix)</span><b>{nf(t.vendas)}</b><i>{vgvCurto(t.vgv)} em VGV</i></div>
        <div className="sup-k"><span>Visitas (C2S)</span><b>{nf(t.visitas)}</b><i>{nf(t.plantaoDias)} corretor-dias no plantão</i></div>
        <div className="sup-k"><span>Pastas (Junix)</span><b>{nf(t.pastas)}</b><i>{nf(t.pastasTravadas)} paradas há 7+ dias</i></div>
        <div className="sup-k"><span>Anúncio (Facebook)</span><b>{brl(t.gasto)}</b><i>{nf(t.leadsFb)} leads · {cpl(t.gasto, t.leadsFb)} cada</i></div>
        <div className="sup-k"><span>Custo por venda</span><b>{cpv(t.gasto, t.vendas)}</b><i>gasto ÷ vendas do Junix</i></div>
        <div className="sup-k"><span>Nunca contatados</span><b style={t.nuncaFalaram ? { color: "var(--red)" } : undefined}>{nf(t.nuncaFalaram)}</b><i>carteira ativa sem nenhum toque</i></div>
      </div>
      <div className="sup-tabw">
        <table className="sup-tab">
          <thead>
            <tr>
              <th />
              <th className="grp sep" colSpan={2}>C2S</th>
              <th className="grp sep" colSpan={4}>Junix</th>
              <th className="grp sep" colSpan={4}>Facebook</th>
              <th className="grp sep" colSpan={5}>Leads no Comandra</th>
            </tr>
            <tr>
              <th>Gerente</th>
              <th className="sep">Plantão</th><th>Visitas</th>
              <th className="sep">Vendas</th><th>VGV</th><th>Pastas</th><th>Paradas</th>
              <th className="sep">Gasto</th><th>Leads</th><th>Custo/lead</th><th>Custo/venda</th>
              <th className="sep">Anúncio</th><th>Disparo</th><th>Pescados</th><th>Total</th><th>Sem toque</th>
            </tr>
          </thead>
          <tbody>
            {data.linhas.map((x) => (
              <tr key={x.id} className={x.id !== "super" && !x.id.startsWith("outros") ? "gr" : ""}
                onClick={() => x.id !== "super" && !x.id.startsWith("outros") && onAbrir(x.id)}>
                <td><b>{x.nome}</b></td>
                {celulas(x)}
              </tr>
            ))}
            <tr className="tot"><td>Total</td>{celulas(t as any)}</tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

/* TIME do superintendente: todos os gerentes abaixo dele e os corretores de cada
 * um que têm cadastro (ativos e desligados), mais quem bate ponto no plantão (C2S)
 * e ainda não tem login. Cadastra corretor escolhendo o gerente — o create-user
 * aceita o manager_id vindo do super (para gerente, o servidor força o dele). */
type PessoaTime = { id: string; first_name: string | null; last_name: string | null; email: string | null;
  phone: string | null; is_active: boolean | null; last_seen_at: string | null;
  lead_assignment_enabled: boolean | null; manager_id: string | null; role: string };

function TimeSuper({ superId, plantaoHoje }: { superId: string | undefined; plantaoHoje: Set<string> }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const [cadastro, setCadastro] = useState<{ gerente: string; nome?: string } | null>(null);
  const [resetando, setResetando] = useState<string | null>(null);
  const [desligar, setDesligar] = useState<string | null>(null);
  // quem cadastra também reseta: volta para mudar@123 e a pessoa troca no próximo acesso
  async function resetarSenha(id: string, nome: string) {
    setResetando(id);
    try {
      const { data: r, error } = await supabase.functions.invoke("create-user", { body: { action: "reset-password", userId: id } });
      if (error || (r as any)?.error) throw new Error((r as any)?.error || error?.message);
      toast.success(`Senha de ${nome} voltou para mudar@123 — troca no próximo acesso`);
    } catch (e: any) { toast.error(e?.message ?? "Não consegui resetar."); }
    finally { setResetando(null); }
  }
  const { data, isLoading } = useQuery({
    queryKey: ["super-time", superId],
    enabled: !!superId,
    staleTime: 60_000,
    queryFn: async () => {
      const campos = "id,first_name,last_name,email,phone,is_active,last_seen_at,lead_assignment_enabled,manager_id,role";
      // diretor: inclui os gerentes dos supers abaixo dele
      const { data: subs } = await supabase.from("profiles").select("id")
        .eq("manager_id", superId!).eq("role", "SUPERINTENDENT").eq("is_active", true);
      const { data: gers } = await supabase.from("profiles").select(campos)
        .in("manager_id", [superId!, ...((subs ?? []) as { id: string }[]).map((x) => x.id)]).eq("role", "MANAGER").order("first_name");
      const gerentes = ((gers ?? []) as PessoaTime[]).filter((g) => g.is_active !== false);
      const ids = [superId!, ...gerentes.map((g) => g.id)];
      const { data: cors } = await supabase.from("profiles").select(campos)
        .in("manager_id", ids).eq("role", "BROKER").order("first_name");
      // quem bate ponto no C2S e não tem login (metricas.py grava sem profile_id)
      const { data: econ } = await supabase.from("cury_pessoas").select("cury_id,profile_id")
        .eq("escopo", "gerente").in("profile_id", gerentes.map((g) => g.id));
      const gerDeEcon = new Map(((econ ?? []) as any[]).map((e) => [e.cury_id, e.profile_id]));
      const semLogin = new Map<string, string[]>();
      if (gerDeEcon.size) {
        const desde = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
        const { data: sl } = await supabase.from("cury_metricas_diarias").select("nome,gerente_cury_id")
          .eq("escopo", "corretor").is("profile_id", null).gt("checkins", 0).gte("data", desde)
          .in("gerente_cury_id", [...gerDeEcon.keys()]);
        for (const r of (sl ?? []) as any[]) {
          const g = gerDeEcon.get(r.gerente_cury_id); if (!g) continue;
          const n = String(r.nome || "").replace(/\s+Bn$/i, "").trim();
          const l = semLogin.get(g) ?? []; if (n && !l.includes(n)) l.push(n); semLogin.set(g, l);
        }
      }
      return { gerentes, corretores: (cors ?? []) as PessoaTime[], semLogin };
    },
  });

  if (isLoading || !data) return <p className="sup-vazio">Carregando o time…</p>;
  const nome = (p: PessoaTime) => [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
  const quando = (iso: string | null) => {
    if (!iso) return "nunca entrou";
    const h = (Date.now() - new Date(iso).getTime()) / 36e5;
    return h < 0.25 ? "online agora" : h < 24 ? `há ${Math.round(h)}h` : `há ${Math.round(h / 24)}d`;
  };
  const listaGer = data.gerentes.map((g) => ({ id: g.id, nome: g.first_name || "—" }));
  const blocos = [...data.gerentes.map((g) => ({ id: g.id, titulo: g.first_name || "—", sub: g.email })),
    ...(data.corretores.some((c) => c.manager_id === superId) ? [{ id: superId!, titulo: "Direto com você", sub: null }] : [])];
  const isOnline = (c: PessoaTime) => !!c.last_seen_at && (Date.now() - new Date(c.last_seen_at).getTime()) < 15 * 60 * 1000;
  const totalAtivos = data.corretores.filter((c) => c.is_active !== false).length;
  const totalSem = [...data.semLogin.values()].reduce((a, l) => a + l.length, 0);
  const totalOnlineAgora = data.corretores.filter((c) => c.is_active !== false && isOnline(c)).length;
  const totalPlantaoHoje = data.corretores.filter((c) => c.is_active !== false && plantaoHoje.has(c.id)).length;

  return (
    <>
      <div className="sup-kpis">
        <div className="sup-k"><span>Gerentes</span><b>{data.gerentes.length}</b></div>
        <div className="sup-k"><span>Corretores cadastrados</span><b>{totalAtivos}</b>
          <i>{data.corretores.length - totalAtivos} desligados</i></div>
        <div className="sup-k bom" style={{ borderColor: "#10B981" }}>
          <span>🟢 Online no Comandra</span>
          <b style={{ color: "#059669" }}>{totalOnlineAgora}</b>
          <i>{totalAtivos ? Math.round((totalOnlineAgora / totalAtivos) * 100) : 0}% da tropa ativa</i>
        </div>
        <div className="sup-k">
          <span>📍 No plantão hoje (C2S)</span>
          <b>{totalPlantaoHoje}</b>
          <i>check-in nas lojas</i>
        </div>
        <div className="sup-k"><span>Batem ponto sem login</span><b>{totalSem}</b>
          <i>no plantão (C2S) · últimos 30 dias</i></div>
      </div>
      <div className="sup-h" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        Seu time <span>toque no gerente para ver os corretores</span>
        {listaGer.length ? (
          <button className="sup-abrir" style={{ marginLeft: "auto" }}
            onClick={() => setCadastro({ gerente: listaGer[0].id })}>+ Cadastrar corretor</button>
        ) : null}
      </div>
      <div className="sup-estrutura">
        {blocos.map((b) => {
          const meus = data.corretores.filter((c) => c.manager_id === b.id);
          const ativos = meus.filter((c) => c.is_active !== false);
          const sem = data.semLogin.get(b.id) ?? [];
          const exp = !!aberto[b.id];
          return (
            <div className={`sup-ger${exp ? " exp" : ""}`} key={b.id}>
              <div className="sup-ger-h" role="button" tabIndex={0}
                onClick={() => setAberto((v) => ({ ...v, [b.id]: !v[b.id] }))}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAberto((v) => ({ ...v, [b.id]: !v[b.id] })); } }}>
                <span className="sup-caret" aria-hidden="true">{exp ? "▾" : "▸"}</span>
                <b>{b.titulo}</b>
                <span className="sup-ger-cor">{ativos.length} corretores</span>
                <span className="sup-ger-nums">
                  <em><b style={{ color: "#059669" }}>{ativos.filter(isOnline).length}</b> online Comandra</em>
                  <em><b>{ativos.filter((c) => plantaoHoje.has(c.id)).length}</b> no plantão hoje</em>
                  <em><b>{ativos.filter((c) => c.lead_assignment_enabled !== false).length}</b> recebem lead</em>
                  {sem.length ? <em style={{ color: "var(--red)" }}><b>{sem.length}</b> sem login</em> : null}
                </span>
                {b.id !== superId ? (<>
                  <button className="sup-abrir" disabled={resetando === b.id} title="Resetar a senha do gerente para mudar@123"
                    onClick={(e) => { e.stopPropagation(); resetarSenha(b.id, b.titulo); }}>
                    {resetando === b.id ? "…" : "Senha"}</button>
                  <button className="sup-abrir" onClick={(e) => { e.stopPropagation(); setCadastro({ gerente: b.id }); }}>
                    + corretor</button>
                </>) : null}
              </div>
              {exp ? (
                <div className="sup-cors">
                  {meus.map((c) => (
                    <div className="sup-cor" key={c.id} style={c.is_active === false ? { opacity: 0.5 } : undefined}>
                      <span className="sup-cor-nm">
                        <s className={isOnline(c) ? "on" : "off"} />
                        {nome(c)}
                        {isOnline(c) ? (
                          <span style={{ marginLeft: 6, fontSize: 10.5, color: "#047857", fontWeight: 700, background: "#D1FAE5", padding: "1px 5px", borderRadius: 4 }}>
                            🟢 online
                          </span>
                        ) : null}
                        {plantaoHoje.has(c.id) ? (
                          <em style={{ marginLeft: 6, fontStyle: "normal", fontSize: 11, color: "var(--good)", fontWeight: 700 }}>
                            📍 plantão
                          </em>
                        ) : null}
                      </span>
                      <span className="sup-cor-nums">
                        <em>{c.email ?? "—"}</em>
                        <em>{c.phone ?? "sem telefone"}</em>
                        <em>{quando(c.last_seen_at)}</em>
                        <em className={c.lead_assignment_enabled !== false && c.is_active !== false ? "bom" : ""}>
                          <b>{c.is_active === false ? "desligado" : c.lead_assignment_enabled !== false ? "recebe lead" : "fora da roleta"}</b></em>
                        <button className="sup-abrir" disabled={resetando === c.id} onClick={() => resetarSenha(c.id, nome(c))}>
                          {resetando === c.id ? "…" : "Resetar senha"}</button>
                        {c.is_active !== false ? (
                          <button className="sup-abrir" style={{ color: "var(--red)" }} onClick={() => setDesligar(c.id)}>Desligar</button>
                        ) : null}
                      </span>
                    </div>
                  ))}
                  {!meus.length ? <p className="sup-vazio" style={{ padding: "10px 0" }}>Nenhum corretor cadastrado.</p> : null}
                  {/* quem é quem no C2S/Junix deste gerente: associar ou cadastrar daqui mesmo */}
                  {b.id !== superId ? (
                    <div style={{ padding: "0 4px 6px" }}>
                      <VincularNomes managerId={b.id} gerenteFixo={{ id: b.id, nome: b.titulo }} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {!blocos.length ? <p className="sup-vazio">Nenhum gerente ligado a você ainda.</p> : null}
      </div>
      {desligar ? (
        <DesligarCorretor brokerId={desligar} onFechar={() => setDesligar(null)}
          onPronto={() => { setDesligar(null); qc.invalidateQueries({ queryKey: ["super-time", superId] }); }} />
      ) : null}
      {cadastro ? (
        <CadastrarCorretor key={cadastro.gerente + (cadastro.nome ?? "")} managerId={cadastro.gerente}
          nomeInicial={cadastro.nome ?? ""} gerentes={listaGer}
          onFechar={() => setCadastro(null)}
          onPronto={() => { setCadastro(null); qc.invalidateQueries({ queryKey: ["super-time", superId] }); }} />
      ) : null}
    </>
  );
}

/* Campanhas NÃO-lead (ex.: contratação): quem respondeu, gerente responsável e
 * se o gerente já falou com a pessoa (cruzando com o chip Evolution dele). */
function CampanhasNaoLead({ superId }: { superId: string | undefined }) {
  const { data, isLoading } = useCampanhasNaoLead(superId);
  const fmt = (iso: string | null) => {
    if (!iso) return "—";
    try { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
      return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch { return "—"; }
  };
  if (isLoading) return <p className="sup-vazio">Carregando campanhas…</p>;
  if (!data?.length) return <p className="sup-vazio">Nenhuma campanha que não seja de lead (ex.: contratação) ainda.</p>;
  return (
    <div className="sup-estrutura">
      {data.map((c: CampanhaNaoLead) => (
        <div className="sup-ger exp" key={c.id}>
          <div className="sup-ger-h" style={{ cursor: "default" }}>
            <b>{c.nome}</b>
            <span className="sup-ger-nums" style={{ marginLeft: "auto" }}>
              <em><b>{c.responderam}</b> responderam</em>
              <em className={c.falaram >= c.responderam && c.responderam > 0 ? "bom" : ""}>
                <b>{c.falaram}</b> o gerente já falou</em>
              <em className="bom"><b>{Math.max(0, c.responderam - c.falaram)}</b> aguardando o gerente</em>
            </span>
          </div>
          <div className="sup-cors">
            {c.pessoas.map((p, i) => (
              <div className="sup-cor" key={i}>
                <span className="sup-cor-nm" style={{ minWidth: 160 }}>
                  <s className={p.falou ? "on" : "off"} />
                  {p.nome}
                </span>
                <span className="sup-cor-nums">
                  <em>resp. <b>{p.gerente}</b></em>
                  <em className={p.falou ? "bom" : ""}><b>{p.falou ? "falou ✅" : "não falou"}</b></em>
                  <em>{fmt(p.quando)}</em>
                  <em><a href={`https://wa.me/${p.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", textDecoration: "none" }}>WhatsApp →</a></em>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* Plano e gastos do super — os mesmos componentes da diretoria, na estrutura dele. */
function PlanoSuper({ aba, superId, meuId }: { aba: "plano" | "gastos"; superId: string; meuId: string }) {
  const [desloc, setDesloc] = useState(0);
  const d = new Date();
  const mes = new Date(d.getFullYear(), d.getMonth() + desloc, 1).toISOString().slice(0, 10);
  const nome = (n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1).toLocaleDateString("pt-BR", { month: "long" });
  const { data: cons } = useConsolidadoSuper(aba === "gastos" && desloc === 0 ? superId : undefined, d.getDate());
  const anuncio = new Map<string, number>(cons ? [[superId, cons.linhas.reduce((a, l) => a + (l.gasto ?? 0), 0)]] : []);
  return (
    <div className="dir" style={{ minHeight: 0, background: "transparent", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="dir-lbl">Mês</span>
        <div className="dir-per">
          <button className={desloc === 0 ? "on" : ""} onClick={() => setDesloc(0)}>{nome(0)}</button>
          <button className={desloc === 1 ? "on" : ""} onClick={() => setDesloc(1)}>{nome(1)}</button>
        </div>
      </div>
      {aba === "plano" ? <PlanoEstrategico raizId={superId} meuId={meuId} mes={mes} />
        : <GastosPlano raizId={superId} mes={mes} anuncio={anuncio} podeCriarCategoria={false} />}
    </div>
  );
}
