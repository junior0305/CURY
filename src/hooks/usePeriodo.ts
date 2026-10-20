// O período é UM só e acompanha o gerente entre as abas.
//
// Escolheu "semana passada" em Anúncios e clicou em Time, continua semana
// passada — senão ele reajusta o filtro em cada tela e desiste. Fica no
// localStorage porque as abas são rotas diferentes e um contexto não
// sobreviveria à navegação.

import { useCallback, useEffect, useState } from "react";

export type Preset =
  | "hoje"
  | "ontem"
  | "esta_semana"
  | "semana"
  | "semana_passada"
  | "este_mes"
  | "mes_passado"
  | "7"
  | "30"
  | "90"
  | "custom";

export interface PeriodoJanela {
  de: string;
  ate: string;
  rotulo: string;
  dias: number;
}

export interface Periodo extends PeriodoJanela {
  preset: Preset;
  /** Janela comparativa direta (semana anterior, mês anterior, ontem) para cálculo de WoW / MoM */
  anterior: PeriodoJanela;
}

const CHAVE = "mgr10-periodo";
const EVENTO = "mgr10-periodo-mudou";

export const diaSP = (d: Date | number = new Date()): string => {
  const dataObj = typeof d === "number" ? new Date(Date.now() - d * 86_400_000) : d;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dataObj);
};
const menos = (n: number) => diaSP(n);

/** Segunda-feira da semana de uma data (fuso de SP) */
export function getSegunda(d: Date | number = new Date()): string {
  const hojeStr = diaSP(d);
  const dataRef = new Date(hojeStr + "T12:00:00Z");
  const day = dataRef.getUTCDay(); // 0 = Domingo, 1 = Segunda, ... 6 = Sábado
  const diffParaSegunda = (day + 6) % 7;
  return diaSP(new Date(dataRef.getTime() - diffParaSegunda * 86_400_000));
}

/** Domingo de fechamento da semana */
export function getDomingo(segundaStr: string): string {
  const dSeg = new Date(segundaStr + "T12:00:00Z");
  return diaSP(new Date(dSeg.getTime() + 6 * 86_400_000));
}

/** Tempo restante até o domingo da semana atual às 23:59:59 (Brasília) */
export function tempoAteDomingo(): { dias: number; horas: number; texto: string } {
  const agora = new Date();
  const segStr = getSegunda(agora);
  const domStr = getDomingo(segStr);
  const fimDomingo = new Date(domStr + "T23:59:59-03:00");
  const diffMs = fimDomingo.getTime() - agora.getTime();
  if (isNaN(diffMs) || diffMs <= 0) return { dias: 0, horas: 0, texto: "Fechando hoje às 23:59" };
  const dias = Math.floor(diffMs / 86_400_000);
  const horas = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const texto = dias > 0 ? `${dias}d e ${horas}h` : `${horas}h`;
  return { dias, horas, texto };
}

export function resolver(preset: Preset, de?: string, ate?: string): Periodo {
  const hoje = diaSP();
  const conta = (a: string, b: string) =>
    Math.max(1, Math.round((new Date(b + "T12:00:00Z").getTime()
      - new Date(a + "T12:00:00Z").getTime()) / 86_400_000) + 1);

  const segundaAtual = getSegunda();
  const domingoAtual = getDomingo(segundaAtual);

  const segundaPassada = diaSP(new Date(new Date(segundaAtual + "T12:00:00Z").getTime() - 7 * 86_400_000));
  const domingoPassado = diaSP(new Date(new Date(segundaAtual + "T12:00:00Z").getTime() - 1 * 86_400_000));

  const segundaRetrasada = diaSP(new Date(new Date(segundaPassada + "T12:00:00Z").getTime() - 7 * 86_400_000));
  const domingoRetrasado = diaSP(new Date(new Date(segundaPassada + "T12:00:00Z").getTime() - 1 * 86_400_000));

  // Primeiro e último dia do mês atual
  const [anoAtual, mesAtual] = hoje.split("-").map(Number);
  const primeiroDiaMesAtual = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-01`;

  // Mês anterior
  const dataMesPassado = new Date(anoAtual, mesAtual - 2, 1);
  const anoPassado = dataMesPassado.getFullYear();
  const mesPassadoNum = dataMesPassado.getMonth() + 1;
  const primeiroDiaMesPassado = `${anoPassado}-${String(mesPassadoNum).padStart(2, "0")}-01`;
  const ultimoDiaMesPassado = diaSP(new Date(anoAtual, mesAtual - 1, 0));

  // Mês retrasado
  const dataMesRetrasado = new Date(anoAtual, mesAtual - 3, 1);
  const anoRetrasado = dataMesRetrasado.getFullYear();
  const mesRetrasadoNum = dataMesRetrasado.getMonth() + 1;
  const primeiroDiaMesRetrasado = `${anoRetrasado}-${String(mesRetrasadoNum).padStart(2, "0")}-01`;
  const ultimoDiaMesRetrasado = diaSP(new Date(anoAtual, mesAtual - 2, 0));

  switch (preset) {
    case "hoje":
      return {
        preset,
        de: hoje,
        ate: hoje,
        rotulo: "hoje",
        dias: 1,
        anterior: { de: menos(1), ate: menos(1), rotulo: "ontem", dias: 1 },
      };

    case "ontem":
      return {
        preset,
        de: menos(1),
        ate: menos(1),
        rotulo: "ontem",
        dias: 1,
        anterior: { de: menos(2), ate: menos(2), rotulo: "anteontem", dias: 1 },
      };

    case "esta_semana":
    case "semana":
      return {
        preset: "esta_semana",
        de: segundaAtual,
        ate: hoje,
        rotulo: "esta semana",
        dias: conta(segundaAtual, hoje),
        anterior: {
          de: segundaPassada,
          ate: domingoPassado,
          rotulo: "semana passada",
          dias: 7,
        },
      };

    case "semana_passada":
      return {
        preset,
        de: segundaPassada,
        ate: domingoPassado,
        rotulo: "semana passada",
        dias: 7,
        anterior: {
          de: segundaRetrasada,
          ate: domingoRetrasado,
          rotulo: "semana retrasada",
          dias: 7,
        },
      };

    case "este_mes":
      return {
        preset,
        de: primeiroDiaMesAtual,
        ate: hoje,
        rotulo: "este mês",
        dias: conta(primeiroDiaMesAtual, hoje),
        anterior: {
          de: primeiroDiaMesPassado,
          ate: ultimoDiaMesPassado,
          rotulo: "mês passado",
          dias: conta(primeiroDiaMesPassado, ultimoDiaMesPassado),
        },
      };

    case "mes_passado":
      return {
        preset,
        de: primeiroDiaMesPassado,
        ate: ultimoDiaMesPassado,
        rotulo: "mês passado",
        dias: conta(primeiroDiaMesPassado, ultimoDiaMesPassado),
        anterior: {
          de: primeiroDiaMesRetrasado,
          ate: ultimoDiaMesRetrasado,
          rotulo: "mês retrasado",
          dias: conta(primeiroDiaMesRetrasado, ultimoDiaMesRetrasado),
        },
      };

    case "7":
      return {
        preset,
        de: menos(6),
        ate: hoje,
        rotulo: "últimos 7 dias",
        dias: 7,
        anterior: { de: menos(13), ate: menos(7), rotulo: "7 dias anteriores", dias: 7 },
      };

    case "30":
      return {
        preset,
        de: menos(29),
        ate: hoje,
        rotulo: "últimos 30 dias",
        dias: 30,
        anterior: { de: menos(59), ate: menos(30), rotulo: "30 dias anteriores", dias: 30 },
      };

    case "90":
      return {
        preset,
        de: menos(89),
        ate: hoje,
        rotulo: "últimos 90 dias",
        dias: 90,
        anterior: { de: menos(179), ate: menos(90), rotulo: "90 dias anteriores", dias: 90 },
      };

    case "custom": {
      const a = de || menos(29), b = ate || hoje;
      const fmt = (s: string) => s.split("-").reverse().slice(0, 2).join("/");
      const d = conta(a, b);
      const aAnt = diaSP(new Date(new Date(a + "T12:00:00Z").getTime() - d * 86_400_000));
      const bAnt = diaSP(new Date(new Date(a + "T12:00:00Z").getTime() - 1 * 86_400_000));
      return {
        preset,
        de: a,
        ate: b,
        rotulo: `${fmt(a)} a ${fmt(b)}`,
        dias: d,
        anterior: { de: aAnt, ate: bAnt, rotulo: "período anterior", dias: d },
      };
    }

    default:
      return {
        preset: "esta_semana",
        de: segundaAtual,
        ate: hoje,
        rotulo: "esta semana",
        dias: conta(segundaAtual, hoje),
        anterior: {
          de: segundaPassada,
          ate: domingoPassado,
          rotulo: "semana passada",
          dias: 7,
        },
      };
  }
}

function ler(): Periodo {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return resolver("esta_semana");
    const { preset, de, ate } = JSON.parse(cru);
    return resolver(preset, de, ate);
  } catch {
    // localStorage bloqueado (janela anônima, site data desligado) não pode
    // derrubar a tela — cai no padrão.
    return resolver("esta_semana");
  }
}

export function usePeriodo() {
  const [p, setP] = useState<Periodo>(ler);

  useEffect(() => {
    const ouvir = () => setP(ler());
    addEventListener(EVENTO, ouvir);
    addEventListener("storage", ouvir);
    return () => { removeEventListener(EVENTO, ouvir); removeEventListener("storage", ouvir); };
  }, []);

  const definir = useCallback((preset: Preset, de?: string, ate?: string) => {
    const novo = resolver(preset, de, ate);
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ preset, de: novo.de, ate: novo.ate }));
    } catch { /* sem persistência, vale só nesta tela */ }
    setP(novo);
    dispatchEvent(new Event(EVENTO));
  }, []);

  return { periodo: p, definir };
}
