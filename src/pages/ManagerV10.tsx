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
import TempoReal from "@/components/manager-v10/TempoReal";
import TimeTab from "@/components/manager-v10/TimeTab";
import { RailV10 } from "@/components/manager-v10/RailV10";
import AchadosCury from "@/components/manager-v10/AchadosCury";
import "@/styles/manager-v10.css";

type View = "tempo" | "time";

// Quatro portas, não sete. Coach, Liga, Análise e Pool foram feitos pra uma
// operação que está parada — continuam em /manager/coach etc. e voltam pra cá
// quando houver uso. Modo que não é usado não é recurso, é ruído.

// "WhatsApp" e "Campanhas" eram duas portas pra mesma coisa — mandar mensagem.
// Viraram uma só, com as etapas (conexão, template, disparo, conversas) dentro.

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
  const [view, setView] = useState<View>("tempo");

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
        <main className="shell2"><div className="blank">carregando o painel…</div></main>
      </div>
    );
  }

  const nome = data.manager?.first_name || "Gestor";
  const bateu = calc.metaMes ? calc.projecao >= calc.metaMes : null;

  return (
    <div className="mgr10 app2">
      {/* Menu à esquerda, como nos mockups validados. No topo ele competia com
          o conteúdo e sumia no celular. */}
      <RailV10
        atual={view}
        sub={`${nome} · ${data.brokers.length} corretores`}
        mode={mode}
        toggle={toggle}
        onAba={(k) => setView(k as View)}
        pip={calc.doDia.parados}
      />

      <main className="shell2">
        {view === "tempo" ? (
          <TempoReal managerId={userId} />
        ) : (
          <TimeTab managerId={userId} />
        )}
      </main>
    </div>
  );
}
