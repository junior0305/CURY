// O período é UM só e acompanha o gerente entre as abas.
//
// Escolheu "semana passada" em Anúncios e clicou em Time, continua semana
// passada — senão ele reajusta o filtro em cada tela e desiste. Fica no
// localStorage porque as abas são rotas diferentes e um contexto não
// sobreviveria à navegação.

import { useCallback, useEffect, useState } from "react";

export type Preset = "hoje" | "semana" | "7" | "30" | "90" | "custom";

export interface Periodo {
  preset: Preset;
  /** AAAA-MM-DD, fuso de São Paulo */
  de: string;
  ate: string;
  /** rótulo pronto para a tela */
  rotulo: string;
  dias: number;
}

const CHAVE = "mgr10-periodo";
const EVENTO = "mgr10-periodo-mudou";

export const diaSP = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const menos = (n: number) => diaSP(new Date(Date.now() - n * 86_400_000));

/** Segunda desta semana — a operação é avaliada de segunda a domingo. */
function segunda() {
  return menos((new Date().getDay() + 6) % 7);
}

export function resolver(preset: Preset, de?: string, ate?: string): Periodo {
  const hoje = diaSP();
  const conta = (a: string, b: string) =>
    Math.max(1, Math.round((new Date(b + "T12:00:00Z").getTime()
      - new Date(a + "T12:00:00Z").getTime()) / 86_400_000) + 1);

  switch (preset) {
    case "hoje":
      return { preset, de: hoje, ate: hoje, rotulo: "hoje", dias: 1 };
    case "semana":
      return { preset, de: segunda(), ate: hoje, rotulo: "esta semana",
               dias: conta(segunda(), hoje) };
    case "7":
      return { preset, de: menos(6), ate: hoje, rotulo: "últimos 7 dias", dias: 7 };
    case "90":
      return { preset, de: menos(89), ate: hoje, rotulo: "últimos 90 dias", dias: 90 };
    case "custom": {
      const a = de || menos(29), b = ate || hoje;
      const fmt = (s: string) => s.split("-").reverse().slice(0, 2).join("/");
      return { preset, de: a, ate: b, rotulo: `${fmt(a)} a ${fmt(b)}`, dias: conta(a, b) };
    }
    default:
      return { preset: "30", de: menos(29), ate: hoje, rotulo: "últimos 30 dias", dias: 30 };
  }
}

function ler(): Periodo {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return resolver("30");
    const { preset, de, ate } = JSON.parse(cru);
    return resolver(preset, de, ate);
  } catch {
    // localStorage bloqueado (janela anônima, site data desligado) não pode
    // derrubar a tela — cai no padrão.
    return resolver("30");
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
