// PASTAS — o que entrou em pasta e onde travou.
//
// Duas fontes, e a diferença entre elas é o ponto da tela:
//
//   salesforce_movimentos → FLUXO. Quantas subiram na terça. É produção.
//   salesforce_propostas  → ESTOQUE. Quantas estão paradas agora. É fila.
//
// Medir só o estoque engana: uma fila grande pode ser muito trabalho entrando
// ou nenhum trabalho saindo, e as duas pedem coisas opostas do gerente.
//
// A chave do gerente é a mesma da Cury ("DUDU - PDV"), sem tabela de-para: o
// Salesforce guarda em GerenteFormula__c e o Comandra em cury_pessoas.apelido.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const diaSP = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

function segunda() {
  const d = (new Date().getDay() + 6) % 7;
  return diaSP(new Date(Date.now() - d * 86_400_000));
}

/** As etapas na ordem em que a proposta anda. Nomes exatos do Salesforce. */
export const ETAPAS = [
  "Negociação",
  "Montagem de Pasta",
  "Solicitar Análise Bancária",
  "Análise Bancária",
  "Análise de Crédito",
  "Validação Financeira - CAR",
  "Geração de Contrato",
  "Assinatura de Contrato",
  "Conferência de Contrato - Cury Vendas",
] as const;

const PERDIDAS = ["Venda Perdida", "Em Distrato", "Distratado"];

/** O que o gerente já fez nesta proposta. */
export interface Toque {
  tipo: string;
  nota: string | null;
  voltarEm: string | null;
  quando: string;
  autor: string | null;
}

export const TIPOS_TOQUE: { k: string; rotulo: string }[] = [
  { k: "ligou", rotulo: "Liguei" },
  { k: "whatsapp", rotulo: "Mandei mensagem" },
  { k: "sem_resposta", rotulo: "Não respondeu" },
  { k: "documento", rotulo: "Cobrei documento" },
  { k: "passou", rotulo: "Passei para outro" },
  { k: "resolvido", rotulo: "Resolvido" },
];

export interface Parada {
  id: string;
  nome: string;
  status: string;
  cliente: string | null;
  telefone: string | null;
  corretor: string | null;
  dias: number;
  semDocumento: boolean;
  toque: Toque | null;
  /** o retorno combinado venceu — sobe para o topo da fila */
  vencido: boolean;
  /** o corretor saiu da empresa — a proposta não anda sozinha */
  orfa: boolean;
}

export interface DadosPastas {
  apelido: string | null;
  /** quantas ENTRARAM em montagem de pasta */
  subiramHoje: number;
  subiramSemana: number;
  subiramMes: number;
  /** série por semana, da mais velha para a mais nova */
  porSemana: { semana: string; n: number }[];
  porDia: { dia: string; n: number }[];
  /** quantas estão paradas em cada etapa, agora */
  estoque: { etapa: string; n: number }[];
  ganhas: number;
  perdidas: number;
  distratos: number;
  paradas: Parada[];
}

const soDigitos = (t: string | null) => (t ?? "").replace(/\D/g, "");

export function usePastas(managerId: string | undefined) {
  return useQuery<DadosPastas>({
    queryKey: ["pastas", managerId],
    enabled: !!managerId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const vazio: DadosPastas = {
        apelido: null, subiramHoje: 0, subiramSemana: 0, subiramMes: 0,
        porSemana: [], porDia: [], estoque: [], ganhas: 0, perdidas: 0,
        distratos: 0, paradas: [],
      };

      const { data: eu } = await supabase.from("cury_pessoas")
        .select("apelido").eq("escopo", "gerente").eq("profile_id", managerId!).maybeSingle();
      const apelido = (eu as any)?.apelido ?? null;
      if (!apelido) return vazio;

      const hoje = diaSP(), inicioSemana = segunda();
      const inicioMes = hoje.slice(0, 8) + "01";
      const de90 = diaSP(new Date(Date.now() - 90 * 86_400_000));

      const [movRes, propRes, toqueRes] = await Promise.all([
        supabase.from("salesforce_movimentos")
          .select("dia,para").eq("gerente_apelido", apelido)
          .eq("para", "Montagem de Pasta").gte("dia", de90),
        supabase.from("salesforce_propostas")
          .select("sf_id,nome,status,corretor_apelido,cliente_nome,cliente_telefone,status_desde,documentos_entregues")
          .eq("gerente_apelido", apelido),
        supabase.from("proposta_ultimo_toque").select("*"),
      ]);

      const mov = ((movRes as any).data ?? []) as any[];
      const props = ((propRes as any).data ?? []) as any[];
      const toques = new Map<string, Toque>(
        (((toqueRes as any).data ?? []) as any[]).map((t) => [t.sf_proposta_id, {
          tipo: t.tipo, nota: t.nota, voltarEm: t.voltar_em,
          quando: t.created_at, autor: t.autor_nome || null,
        }]));

      const porDiaMap = new Map<string, number>();
      for (const m of mov) porDiaMap.set(m.dia, (porDiaMap.get(m.dia) ?? 0) + 1);
      const porDia = [...porDiaMap.entries()].sort().map(([dia, n]) => ({ dia, n }));

      // Semana de segunda a domingo, igual ao resto do painel.
      const porSemanaMap = new Map<string, number>();
      for (const [dia, n] of porDiaMap) {
        const d = new Date(dia + "T12:00:00");
        const seg = new Date(d); seg.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const k = seg.toISOString().slice(0, 10);
        porSemanaMap.set(k, (porSemanaMap.get(k) ?? 0) + n);
      }
      const porSemana = [...porSemanaMap.entries()].sort()
        .map(([semana, n]) => ({ semana, n }));

      const conta = (de: string) => mov.filter((m) => m.dia >= de).length;

      const estoque = ETAPAS
        .map((etapa) => ({ etapa, n: props.filter((p) => p.status === etapa).length }))
        .filter((x) => x.n > 0);

      const dias = (d: string | null) =>
        d ? Math.floor((Date.now() - new Date(d + "T12:00:00").getTime()) / 86_400_000) : 0;

      // Só as abertas entram na fila de retrabalho: venda ganha não se retrabalha,
      // e perdida/distrato é outra conversa (e outro botão).
      const abertas = new Set<string>(ETAPAS as readonly string[]);
      const paradas: Parada[] = props
        .filter((p) => abertas.has(p.status) && p.cliente_telefone)
        .map((p) => ({
          id: p.sf_id, nome: p.nome, status: p.status,
          cliente: p.cliente_nome, telefone: p.cliente_telefone,
          corretor: p.corretor_apelido, dias: dias(p.status_desde),
          semDocumento: p.documentos_entregues !== true,
          toque: toques.get(p.sf_id) ?? null,
          vencido: !!toques.get(p.sf_id)?.voltarEm && toques.get(p.sf_id)!.voltarEm! <= hoje,
          // O Salesforce marca o corretor desligado com "Z - INATIVO" no apelido.
          // Sem isso o gerente cobra alguém que não trabalha mais aqui.
          orfa: /^\s*Z\s*-\s*INATIVO/i.test(p.corretor_apelido ?? ""),
        }))
        // Ordem que o dia pede: o retorno combinado que venceu vem primeiro,
        // depois quem nunca foi tocado, e só então o mais velho. Ordenar só
        // por idade faria a lista mostrar todo dia as mesmas de dois anos.
        .sort((a, b) => {
          if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
          const at = !!a.toque, bt = !!b.toque;
          if (at !== bt) return at ? 1 : -1;
          return b.dias - a.dias;
        });

      return {
        apelido,
        subiramHoje: conta(hoje),
        subiramSemana: conta(inicioSemana),
        subiramMes: conta(inicioMes),
        porSemana, porDia, estoque,
        ganhas: props.filter((p) => p.status === "Venda Ganha").length,
        perdidas: props.filter((p) => p.status === "Venda Perdida").length,
        distratos: props.filter((p) => PERDIDAS.slice(1).includes(p.status)).length,
        paradas,
      };
    },
  });
}

/** Grava o que foi feito. Não escreve no Salesforce de propósito: o Comandra
 *  não é dono daquele dado e não deve mexer no processo de contrato da Cury. */
export async function registrarToque(t: {
  propostaId: string; autorId: string; tipo: string;
  nota?: string | null; voltarEm?: string | null;
}) {
  const { error } = await supabase.from("proposta_toques").insert({
    sf_proposta_id: t.propostaId, autor_id: t.autorId, tipo: t.tipo,
    nota: t.nota?.trim() || null, voltar_em: t.voltarEm || null,
  });
  if (error) throw error;
}

/** Link de WhatsApp para o gerente retomar o cliente na hora. */
export function linkWhats(telefone: string | null, cliente: string | null) {
  const t = soDigitos(telefone);
  if (!t) return null;
  const numero = t.length <= 11 ? "55" + t : t;
  const nome = (cliente ?? "").split(" ")[0];
  const texto = nome
    ? `Olá ${nome}, tudo bem? Aqui é da Cury. Vi que o seu processo ficou parado com a gente e queria retomar de onde paramos.`
    : "Olá! Aqui é da Cury. Vi que o seu processo ficou parado com a gente e queria retomar.";
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
