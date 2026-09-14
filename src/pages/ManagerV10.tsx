// Painel do Gerente v10 — porte do protótipo memory/assets/manager-v10.html.
//
// Vive em /manager-v10 enquanto está sendo construído. O /manager antigo segue
// no ar e intocado: são gerentes de verdade trabalhando nele, e trocar a tela
// deles por uma tela pela metade é pior do que não trocar.
//
// Estado do porte:
//   ✔ fundação (tokens, primitivas, casca, navegação de 5 modos)
//   ✔ HOJE — herói, trilho de ritmo, o dia até agora, funil, carga do time
//   ✔ TIME — presença + a economia por corretor (saldo real)
//   Leads/Crescer/B.I. do protótipo dependem de dado que o banco não tem
//   (visita zerada, valor por venda vazio) — ficam fora até a operação
//   registrar visita. Ver memory/project_manager_v10_porte.md

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { useManagerV10, diasUteisRestantes, type V10Lead } from "@/hooks/useManagerV10";
import { useCruzamentoCury } from "@/hooks/useCruzamentoCury";
import { Sec, Panel, ScoreRow, Cell, Pace, Funnel, Blank, Tbl, Tr } from "@/components/manager-v10/ui";
import AoVivo from "@/components/manager-v10/AoVivo";
import AchadosCury from "@/components/manager-v10/AchadosCury";
import "@/styles/manager-v10.css";

type View = "hoje" | "time" | "aovivo";

// Quatro portas, não sete. Coach, Liga, Análise e Pool foram feitos pra uma
// operação que está parada — continuam em /manager/coach etc. e voltam pra cá
// quando houver uso. Modo que não é usado não é recurso, é ruído.
const VIEWS: { v: View; label: string; path: string }[] = [
  { v: "hoje", label: "Hoje", path: "M3 12l9-8 9 8M5 10v10h14V10" },
  { v: "time", label: "Time", path: "M2.5 20c0-3.6 2.9-5.6 6.5-5.6s6.5 2 6.5 5.6M17 5.5a3 3 0 0 1 0 5.6M18.5 14.6c2 .7 3 2.4 3 5.4" },
  // Ao vivo: o que a operação FEZ hoje, medido na Cury. É a única métrica do
  // painel que não depende de alguém marcar alguma coisa aqui dentro.
  { v: "aovivo", label: "Ao vivo", path: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 7v5l3.5 2" },
];

// "WhatsApp" e "Campanhas" eram duas portas pra mesma coisa — mandar mensagem.
// Viraram uma só, com as etapas (conexão, template, disparo, conversas) dentro.
const LINKS: { to: string; label: string; path: string }[] = [
  { to: "/manager/whatsapp", label: "Disparar", path: "M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-5.7A8.4 8.4 0 1 1 21 11.5z" },
];

function loadFonts() {
  if (document.querySelector("link[data-v10-fonts]")) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap";
  l.setAttribute("data-v10-fonts", "true");
  document.head.appendChild(l);
}

/** R$ sem centavos — no v10 centavo em tabela é ruído, o número é de decisão. */
const brl = (n: number) =>
  (n < 0 ? "-" : "") + "R$ " + Math.abs(Math.round(n)).toLocaleString("pt-BR");

const horas = (iso: string | null | undefined) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity;

/** Lead quente parado: respondeu e o corretor não voltou. É a única definição
 *  de urgência que o v10 aceita — "lead novo" não é urgência, é fila. */
function quenteParado(l: V10Lead) {
  const resp = horas(l.last_lead_response_at);
  if (!Number.isFinite(resp) || resp <= 2 || resp >= 48) return false;
  return horas(l.last_broker_whatsapp_at) > resp;
}

export default function ManagerV10() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { mode, toggle } = useTheme();
  const { data, isLoading } = useManagerV10(userId);
  // Visita real vem da Cury. A coluna antiga lia `leads` e dava sempre zero,
  // porque ninguém registra visita no Comandra — duas 'visitas' diferentes
  // na mesma tela era o pior defeito da aba.
  const { data: cruz } = useCruzamentoCury(userId);
  const [view, setView] = useState<View>("hoje");

  useEffect(loadFonts, []);

  const calc = useMemo(() => {
    if (!data) return null;
    const { leads, brokers, metaMes, vendasMes, vendasSecretaria, visitasMes, docsMes, leadsMes } = data;

    const vendas = vendasMes + vendasSecretaria;
    const hoje = new Date();
    const diaMes = hoje.getDate();
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const restantes = diasUteisRestantes(hoje);

    // Projeção linear: o ritmo até aqui, esticado até o fim do mês. É a conta
    // mais burra possível de propósito — o gerente precisa reconhecer a conta,
    // não confiar nela. Modelo esperto que ele não entende, ele ignora.
    const projecao = diaMes > 0 ? Math.round((vendas / diaMes) * diasNoMes) : 0;
    const faltam = metaMes ? Math.max(0, metaMes - vendas) : 0;
    const porDia = metaMes ? faltam / restantes : 0;

    const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
    const doDia = {
      entraram: leads.filter((l) => l.created_at >= inicioDia).length,
      responderam: leads.filter((l) => (l.last_lead_response_at || "") >= inicioDia).length,
      tocados: leads.filter((l) => (l.last_broker_whatsapp_at || "") >= inicioDia).length,
      parados: leads.filter(quenteParado).length,
      semCorretor: leads.filter((l) => !l.broker_id).length,
      online: brokers.filter((b) => horas(b.last_seen_at) < 0.25).length,
    };

    // Funil de RETENÇÃO: cada degrau é % do degrau ANTERIOR, não do topo.
    const noMes = leads.filter((l) => l.created_at >= new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString());
    const responderam = noMes.filter((l) => !!l.last_lead_response_at).length;
    const emNegociacao = noMes.filter((l) => ["IN_PROGRESS", "NEGOTIATING", "REACTIVATED"].includes(l.status || "")).length;
    // Visita e venda: a Cury é a fonte. O Comandra só sabe o que alguém digitou,
    // e ninguém digita — o degrau vinha zero e contradizia as outras abas.
    const visitasCury = cruz
      ? [...cruz.porProfile.values()].reduce((a, c) => a + c.visitas, 0) : null;
    const vendasCury = cruz
      ? [...cruz.porProfile.values()].reduce((a, c) => a + c.vendas, 0) : null;
    const visitasFunil = visitasCury ?? visitasMes;
    const vendasFunil = vendasCury ?? vendas;

    const passos = [
      { label: "Entraram",       n: leadsMes,     keptPct: 100 as number | null },
      { label: "Responderam",    n: responderam,  keptPct: leadsMes ? (responderam / leadsMes) * 100 : null },
      { label: "Em negociação",  n: emNegociacao, keptPct: responderam ? (emNegociacao / responderam) * 100 : null },
      { label: "Visitaram",      n: visitasFunil, keptPct: emNegociacao ? (visitasFunil / emNegociacao) * 100 : null },
      { label: "Em documentos",  n: docsMes,      keptPct: visitasFunil ? (docsMes / visitasFunil) * 100 : null },
      { label: "Venderam",       n: vendasFunil,  keptPct: docsMes ? (vendasFunil / docsMes) * 100 : null },
    ];
    // O degrau que mais retém MENOS é onde o dinheiro para.
    let pior = -1, piorPct = Infinity;
    passos.forEach((p, i) => {
      if (i > 0 && p.keptPct !== null && p.keptPct < piorPct) { piorPct = p.keptPct; pior = i; }
    });

    // Carga por corretor: o v10 responde "cresço ou aperto?" sem conta nenhuma.
    const ativosPor = new Map<string, number>();
    leads.forEach((l) => {
      if (!l.broker_id) return;
      if (["CONCLUDED", "LOST", "DISCARDED"].includes(l.status || "")) return;
      ativosPor.set(l.broker_id, (ativosPor.get(l.broker_id) || 0) + 1);
    });
    const carga = brokers.map((b) => ({
      id: b.id,
      nome: [b.first_name, b.last_name].filter(Boolean).join(" ") || "—",
      n: ativosPor.get(b.id) || 0,
      vivo: !!b.bot_instance_id,
      online: horas(b.last_seen_at) < 0.25,
      sumido: horas(b.last_seen_at) > 72,
    }));
    const folga  = carga.filter((c) => c.n < 15 && !c.sumido);
    const cheio  = carga.filter((c) => c.n >= 15 && c.n <= 35);
    const queima = carga.filter((c) => c.n > 35 || c.sumido);

    // ── A economia de cada corretor ──────────────────────────────────────
    // Saldo = o que ele devolveu em comissão menos o que os leads dele custaram.
    // Uso a comissão do CORRETOR (2,25% do ticket): a pergunta do painel é se a
    // pessoa se paga, e quem se paga é medido pelo que ela própria gera.
    // O recorte é o MÊS, igual ao resto da tela.
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
    const porCorretor = brokers.map((b) => {
      const meus = leads.filter((l) => l.broker_id === b.id);
      const doMes = meus.filter((l) => l.created_at >= inicioMes);
      const vendasB = meus.filter(
        (l) => l.status === "CONCLUDED" && (l.last_interaction_at || l.created_at) >= inicioMes
      ).length;
      const responderamB = doMes.filter((l) => !!l.last_lead_response_at).length;
      const custo = doMes.length * data.dinheiro.custoLead;
      const retorno = vendasB * data.dinheiro.comissaoCorretor;
      return {
        id: b.id,
        nome: [b.first_name, b.last_name].filter(Boolean).join(" ") || "—",
        recebidos: doMes.length,
        /** carteira ativa inteira, não só a do mês — é o que está na mão dele agora */
        carteira: meus.filter((l) => !["CONCLUDED","EXCLUDED","ABANDONED"].includes(l.status ?? "")).length,
        horasSemEntrar: horas(b.last_seen_at),
        respPct: doMes.length ? (responderamB / doMes.length) * 100 : null,
        visitas: data.visitasPorCorretor.get(b.id) || 0,
        vendas: vendasB,
        custo,
        retorno,
        saldo: retorno - custo,
        online: horas(b.last_seen_at) < 0.25,
        sumido: horas(b.last_seen_at) > 72,
        naRoleta: b.lead_assignment_enabled !== false,
        chip: !!b.bot_instance_id,
      };
    }).sort((a, b) => b.saldo - a.saldo);

    return {
      vendas, projecao, faltam, porDia, restantes, metaMes,
      doDia, passos, pior, carga, folga, cheio, queima,
      porCorretor,
      parados: leads.filter(quenteParado),
    };
  }, [data, cruz]);

  if (!userId || isLoading || !data || !calc) {
    return (
      <div className="mgr10">
        <main className="shell"><div className="blank">carregando o painel…</div></main>
      </div>
    );
  }

  const nome = data.manager?.first_name || "Gestor";
  const bateu = calc.metaMes ? calc.projecao >= calc.metaMes : null;

  return (
    <div className="mgr10">
      <header className="bar">
        <div className="bar-in">
          <div className="mark">Comandra <span>· {nome}</span></div>
          <div className="bar-r">
            <button className="icobtn" onClick={toggle} title="Alternar tema" aria-label="Alternar tema">
              {mode === "dark"
                ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>
                : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>}
            </button>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Seções">
        {VIEWS.map((it) => (
          <button key={it.v} className={`tab${view === it.v ? " on" : ""}`} onClick={() => setView(it.v)}>
            <span className="tab-w">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={it.path} /></svg>
              {it.v === "hoje" && calc.doDia.parados > 0
                ? <i className="badge">{calc.doDia.parados}</i> : null}
            </span>
            <span>{it.label}</span>
          </button>
        ))}
        {LINKS.map((it) => (
          <a key={it.to} href={it.to} className="tab">
            <span className="tab-w">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={it.path} /></svg>
            </span>
            <span>{it.label}</span>
          </a>
        ))}
      </nav>

      <main className="shell">
        {view === "hoje" ? (
          <section className="view">
            <div className="hero">
              <div className="tag">Vou bater a meta?</div>
              <div className="hero-k">
                <div className="hero-n">{calc.metaMes ? calc.projecao : "—"}</div>
                <div className="hero-of">{calc.metaMes ? `de ${calc.metaMes}` : "sem meta no mês"}</div>
              </div>
              <p className="hero-say">
                {calc.metaMes ? (
                  bateu
                    ? <>No ritmo de hoje você fecha o mês <b>acima da meta</b>. {calc.vendas} venda{calc.vendas === 1 ? "" : "s"} até agora.</>
                    : <>No ritmo de hoje você fecha em <span className="bad">{calc.projecao}</span>. Faltam <b>{calc.faltam}</b> em <b>{calc.restantes} dia{calc.restantes === 1 ? "" : "s"} útil{calc.restantes === 1 ? "" : "eis"}</b>.</>
                ) : (
                  <>Ninguém fechou meta mensal pra esta equipe. Sem meta, o painel vira relatório — e relatório não cobra ninguém.</>
                )}
              </p>
              {calc.metaMes ? (
                <Pace
                  donePct={(calc.vendas / calc.metaMes) * 100}
                  needPct={100}
                  left={`${calc.vendas} feitas`}
                  right={`meta ${calc.metaMes}`}
                  say={<>Pra bater, são <b>{calc.porDia.toFixed(1)} venda/dia útil</b> daqui até o fim do mês.</>}
                />
              ) : null}
            </div>

            <Sec title="O dia até agora" tag="desde 00h">
              <ScoreRow six>
                <Cell label="Entraram"     value={calc.doDia.entraram} />
                <Cell label="Responderam"  value={calc.doDia.responderam} />
                <Cell label="Corretor tocou" value={calc.doDia.tocados} />
                <Cell label="Parados"      value={calc.doDia.parados} tone={calc.doDia.parados > 0 ? "alert" : undefined} sub="quente sem resposta" />
                <Cell label="Sem corretor" value={calc.doDia.semCorretor} tone={calc.doDia.semCorretor > 0 ? "alert" : undefined} />
                <Cell label="Online agora" value={`${calc.doDia.online}/${data.brokers.length}`} tone={calc.doDia.online > 0 ? "good" : undefined} />
              </ScoreRow>
            </Sec>

            <Sec
              title="Do lead até a visita"
              tag="onde o dinheiro para"
              sub={<>Cada degrau mostra quantos <b>sobraram</b> do degrau anterior. O degrau em vermelho é onde você perde gente que <b>já tinha dito sim</b> — é o mais barato de recuperar, porque o convencimento já foi feito.</>}
            >
              <Panel>
                <Funnel steps={calc.passos.map((p, i) => ({ ...p, drop: i === calc.pior }))} />
              </Panel>
              <p className="sec-sub" style={{ marginTop: "var(--s2)" }}>
                <b>Visita</b> e <b>venda</b> vêm do app da Cury (atendimento e venda
                registrados no plantão), não do que foi digitado aqui. É o mesmo número
                que aparece em Ao vivo e em Time.
              </p>
            </Sec>

            <Sec
              title="Cresço ou aperto?"
              tag="carga do time"
              sub={<>Todo corretor cai em um dos três grupos. Isso responde a pergunta de escala sem conta nenhuma: <b>só faz sentido comprar mais lead se tiver gente no primeiro grupo</b>.</>}
            >
              <div className="buckets">
                {[
                  { k: "motor",  t: "Tem folga",     l: calc.folga,  s: "aguenta mais lead hoje" },
                  { k: "",       t: "No limite",     l: calc.cheio,  s: "carteira cheia e viva" },
                  { k: "queima", t: "Queimando",     l: calc.queima, s: "carteira demais ou sumido há 3 dias" },
                ].map((b) => (
                  <div key={b.t} className={`bk ${b.k}`}>
                    <div className="bk-h">
                      <span className="bk-n">{b.l.length}</span>
                      <b>{b.t}</b>
                      <span className="bk-s">{b.s}</span>
                    </div>
                    <div className="bk-list">
                      {b.l.length === 0
                        ? <div className="blank" style={{ padding: "var(--s3) var(--s2)" }}>ninguém aqui</div>
                        : b.l.map((c) => (
                            <div key={c.id} className="bk-row">
                              <span className={`dot ${c.online ? "on" : "off"}`} />
                              <span className="nm">{c.nome}</span>
                              <span className="nb">{c.n}</span>
                            </div>
                          ))}
                    </div>
                  </div>
                ))}
              </div>
              <Panel style={{ marginTop: "var(--s2)" }}>
                <div className="move">
                  <p className="move-say">
                    {calc.folga.length === 0
                      ? <>Ninguém tem folga. <b className="hot">Comprar mais lead agora é queimar dinheiro</b> — o gargalo é gente, não volume.</>
                      : <>Você tem <b>{calc.folga.length} corretor{calc.folga.length === 1 ? "" : "es"}</b> com folga. Dá pra aumentar volume sem contratar.</>}
                  </p>
                  <p className="move-why">
                    Folga = menos de 15 leads ativos e visto nos últimos 3 dias. Queimando =
                    mais de 35 ativos, ou sumido há mais de 3 dias com carteira na mão.
                  </p>
                </div>
              </Panel>
            </Sec>
          </section>
        ) : view === "time" ? (
          <section className="view">
            <Sec
              title="Quem dá dinheiro, quem custa"
              tag="no mês"
              sub={<>Cada corretor recebeu leads que <b>foram pagos</b>. A coluna <b>saldo</b> é o que ele devolveu em comissão menos o que os leads dele custaram. Verde sustenta a operação; vermelho é lead pago virando nada.</>}
            >
              <Tbl
                cols="minmax(140px,1.6fr) 62px 62px 62px 62px 62px 96px 104px"
                head={["Corretor", "Leads", "Resp", "Plantão", "Visitas", "Vendas", "Custo", "Saldo"]}
              >
                {calc.porCorretor.length === 0 ? (
                  <Blank title="Nenhum corretor nesta equipe" />
                ) : calc.porCorretor.map((c) => (
                  <Tr key={c.id} cols="minmax(140px,1.6fr) 62px 62px 62px 62px 62px 96px 104px">
                    <span className="nmc">
                      <span className={`dot ${c.online ? "on" : "off"}`} />
                      <b>{c.nome}</b>
                    </span>
                    <span className="num">{c.recebidos}</span>
                    <span className="num">{c.respPct === null ? "—" : `${Math.round(c.respPct)}%`}</span>
                    <span className="num">{cruz?.porProfile.get(c.id)?.diasDePlantao || "—"}</span>
                    <span className="num">{cruz?.porProfile.get(c.id)?.visitas || "—"}</span>
                    <span className="num">{c.vendas}</span>
                    <span className="num">{brl(c.custo)}</span>
                    <span className={`num saldo ${c.saldo >= 0 ? "pos" : "neg"}`}>{brl(c.saldo)}</span>
                  </Tr>
                ))}
              </Tbl>
              <Panel style={{ marginTop: "var(--s2)" }}>
                <div className="move">
                  <p className="move-say">
                    {(() => {
                      const neg = calc.porCorretor.filter((c) => c.saldo < 0);
                      const perda = neg.reduce((a, c) => a + c.saldo, 0);
                      return neg.length === 0
                        ? <>Todo mundo do time está <b className="win">se pagando</b> neste mês.</>
                        : <><b className="hot">{neg.length} corretor{neg.length === 1 ? "" : "es"}</b> {neg.length === 1 ? "está" : "estão"} custando mais do que devolvendo — <b className="hot">{brl(Math.abs(perda))}</b> em lead pago que não virou venda.</>;
                    })()}
                  </p>
                  <p className="move-why">
                    Custo por lead <b>{brl(data.dinheiro.custoLead)}</b>{" "}
                    {data.dinheiro.custoLeadFonte === "meta"
                      ? <>— real, do gasto da conta {data.dinheiro.equipeAds ?? ""} no Meta
                          ({brl(data.dinheiro.custoLeadJanela.gasto)} ÷ {data.dinheiro.custoLeadJanela.leads} leads desde {data.dinheiro.custoLeadJanela.desde.split("-").reverse().slice(0, 2).join("/")}).</>
                      : <>— <b>estimado</b>: esta equipe não tem gasto registrado no Meta, então o saldo abaixo é uma ordem de grandeza, não um número.</>}
                    {" "}Comissão do corretor <b>{brl(data.dinheiro.comissaoCorretor)}</b> por venda
                    ({data.dinheiro.pctCorretor}% de {brl(data.dinheiro.ticket)}). A sua, como gerente,
                    é <b>{brl(data.dinheiro.comissaoGerente)}</b> — {brl(calc.vendas * data.dinheiro.comissaoGerente)} no mês até agora.
                  </p>
                </div>
              </Panel>
              <AchadosCury
                cruz={cruz}
                time={calc.porCorretor.map((c) => ({
                  profileId: c.id, nome: c.nome,
                  recebidos: c.recebidos, carteira: c.carteira,
                  vendas: c.vendas, saldo: c.saldo,
                  custoLead: data.dinheiro.custoLead,
                  horasSemEntrar: c.horasSemEntrar, chip: c.chip,
                }))}
              />
            </Sec>
          </section>
        ) : view === "aovivo" ? (
          <AoVivo managerId={userId} />
        ) : null}
      </main>
    </div>
  );
}
