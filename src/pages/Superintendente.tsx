/* Painel do Superintendente — a visão de cima do gerente.
 *
 * Mostra o consolidado de todos os gerentes abaixo dele e deixa entrar no
 * painel de cada um (drill-down). Reusa o painel do gerente inteiro: clicar num
 * gerente abre /manager?manager=<id>, e o painel do gerente já sabe se
 * escopar por esse id (useEffectiveManagerId).
 *
 * Havera 3+ superintendentes; cada um ve so os gerentes dele (a RPC ja escopa).*/
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";
import { useSuperintendenteRollup, type GerenteRollup } from "@/hooks/useSuperintendente";
import { loadFonts } from "@/components/manager-v10/RailV10";
import BiTab from "@/components/manager-v10/BiTab";
import "@/styles/manager-v10.css";
import "@/styles/superintendente.css";

const PERIODOS: [number, string][] = [[1, "Hoje"], [7, "Semana"], [30, "Mês"]];

export default function Superintendente() {
  const { session } = useAuth();
  const superId = session?.user?.id;
  const nav = useNavigate();
  const [dias, setDias] = useState(30);
  const [aba, setAba] = useState<"consolidado" | "bi">("consolidado");
  const { data, isLoading } = useSuperintendenteRollup(superId, dias);
  loadFonts();

  const abrir = (id: string) => nav(`/manager?manager=${id}`);
  const t = data?.total;

  return (
    <div className="mgr10 sup">
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

            {/* um card por gerente — clica e entra no painel dele */}
            <div className="sup-h">Suas equipes <span>clique para abrir o painel do gerente</span></div>
            <div className="sup-grid">
              {data.gerentes.map((g: GerenteRollup) => (
                <button className="sup-g" key={g.id} onClick={() => abrir(g.id)}>
                  <div className="sup-g-h">
                    <b>{g.nome}</b>
                    <span className="sup-g-cor">{g.corretores} corretores
                      {g.online ? <i className="sup-on" title="algum online agora" /> : null}</span>
                  </div>
                  <div className="sup-g-l">
                    <div><b>{g.leads_periodo}</b><span>leads no período</span></div>
                    <div><b>{g.carteira}</b><span>carteira viva</span></div>
                    <div><b>{g.em_conversa}</b><span>em conversa</span></div>
                    <div className="bom"><b>{g.vendas_mes}</b><span>vendas no mês</span></div>
                  </div>
                  <span className="sup-g-abrir">Abrir painel →</span>
                </button>
              ))}
              {!data.gerentes.length ? (
                <p className="sup-vazio">Nenhum gerente ligado a você ainda.</p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
