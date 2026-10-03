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
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { useSuperintendenteRollup, type GerenteRollup, type CorretorRollup } from "@/hooks/useSuperintendente";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import BiTab from "@/components/manager-v10/BiTab";
import { Boundary } from "@/components/manager-v10/Boundary";
import "@/styles/manager-v10.css";
import "@/styles/superintendente.css";

const PERIODOS: [number, string][] = [[1, "Hoje"], [7, "Semana"], [30, "Mês"]];

export default function Superintendente() {
  const { session } = useAuth();
  const { mode, toggle } = useTheme();
  const superId = session?.user?.id;
  const nav = useNavigate();
  const [dias, setDias] = useState(30);
  const [aba, setAba] = useState<"consolidado" | "bi">("consolidado");
  // quais gerentes estão expandidos (mostrando os corretores)
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const toggleGer = (id: string) => setAberto((v) => ({ ...v, [id]: !v[id] }));
  const { data, isLoading, error } = useSuperintendenteRollup(superId, dias);
  loadFonts();

  const abrir = (id: string) => nav(`/manager?manager=${id}`);
  const t = data?.total;

  return (
    <div className="mgr10 app2 sup">
      <Boundary>
      <RailV10
        atual={aba === "bi" ? "bi" : "tempo"}
        mode={mode}
        toggle={toggle}
        onAba={(k) => {
          // Tempo real / Time do super = o consolidado; B.I. = a aba B.I.
          if (k === "bi") setAba("bi");
          else setAba("consolidado");
        }}
      />
      <main className="shell2">
        <div className="sup-wrap">
          <div className="sup-top">
            <div>
              <h1>Superintendência</h1>
              <p>A operação inteira das suas equipes, num lugar só</p>
            </div>
            <div className="sup-per">
              <button className={aba === "consolidado" ? "on" : ""} onClick={() => setAba("consolidado")}>Consolidado</button>
              <button className={aba === "bi" ? "on" : ""} onClick={() => setAba("bi")}>B.I.</button>
              {aba === "consolidado" ? PERIODOS.map(([n, r]) => (
                <button key={n} className={dias === n ? "on" : ""} onClick={() => setDias(n)}>{r}</button>
              )) : null}
            </div>
          </div>

          {aba === "bi" ? (
            <BiTab scope="super" managerId={superId} />
          ) : error ? (
            <div className="sup-vazio" style={{ color: "var(--red)" }}>
              Não consegui somar as equipes. Erro: {String((error as any)?.message ?? error)}
            </div>
          ) : isLoading || !data ? (
            <p className="sup-vazio">Somando as equipes…</p>
          ) : (
            <>
              {/* o consolidado — a soma de todas as equipes */}
              <div className="sup-kpis">
                <div className="sup-k"><span>Gerentes</span><b>{t!.gerentes}</b></div>
                <div className="sup-k"><span>Corretores</span><b>{t!.corretores}</b>
                  <i>{t!.online} online agora</i></div>
                <div className="sup-k"><span>Leads no período</span><b>{t!.leads_periodo}</b></div>
                <div className="sup-k"><span>Carteira viva</span><b>{t!.carteira}</b>
                  <i>{t!.em_conversa} em conversa</i></div>
                <div className="sup-k bom"><span>Vendas no mês</span><b>{t!.vendas_mes}</b></div>
              </div>

              {/* a estrutura inteira: cada gerente abre a lista dos corretores dele;
                  "Abrir painel" entra no painel completo do gerente */}
              <div className="sup-h">Suas equipes <span>toque para ver os corretores · "Abrir painel" entra no gerente</span></div>
              <div className="sup-estrutura">
                {data.gerentes.map((g: GerenteRollup) => {
                  const exp = !!aberto[g.id];
                  return (
                    <div className={`sup-ger${exp ? " exp" : ""}`} key={g.id}>
                      <div className="sup-ger-h" role="button" tabIndex={0}
                        onClick={() => toggleGer(g.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleGer(g.id); } }}>
                        <span className="sup-caret" aria-hidden="true">{exp ? "▾" : "▸"}</span>
                        <b>{g.nome}</b>
                        <span className="sup-ger-cor">{g.corretores} corretores
                          {g.online ? <i className="sup-on" title={`${g.online} online agora`} /> : null}</span>
                        <span className="sup-ger-nums">
                          <em><b>{g.leads_periodo}</b> leads</em>
                          <em><b>{g.carteira}</b> carteira</em>
                          <em><b>{g.em_conversa}</b> conversa</em>
                          <em className="bom"><b>{g.vendas_mes}</b> vendas</em>
                        </span>
                        <button className="sup-abrir" onClick={(e) => { e.stopPropagation(); abrir(g.id); }}>
                          Abrir painel →
                        </button>
                      </div>
                      {exp ? (
                        <div className="sup-cors">
                          {g.corretores_lista.length ? g.corretores_lista.map((c: CorretorRollup) => (
                            <div className="sup-cor" key={c.id}>
                              <span className="sup-cor-nm">
                                <s className={c.online ? "on" : "off"} />
                                {c.nome}
                              </span>
                              <span className="sup-cor-nums">
                                <em><b>{c.leads_periodo}</b> leads</em>
                                <em><b>{c.carteira}</b> carteira</em>
                                <em><b>{c.em_conversa}</b> conversa</em>
                                <em className="bom"><b>{c.vendas_mes}</b> vendas</em>
                              </span>
                            </div>
                          )) : <p className="sup-vazio" style={{ padding: "10px 0" }}>Sem corretores ativos.</p>}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!data.gerentes.length ? (
                  <p className="sup-vazio">Nenhum gerente ligado a você ainda.</p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </main>
      </Boundary>
    </div>
  );
}
