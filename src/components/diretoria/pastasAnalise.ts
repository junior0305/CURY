/* Leitura honesta das pastas do Junix: quais estão vivas, a chance de cada uma fechar no mês
 * e o próximo passo. Usada pela aba Pastas e pela projeção da aba Hoje (protótipo aprovado 13/10).
 * Fora da conta: venda já confirmada, reprovada no banco, parada há 60+ dias, duplicada (mesmo cliente). */
import type { PastaJunix } from "@/hooks/useDiretoria";

export const ORDEM_ETAPAS = ["Cadastro", "Selecionar Unidade", "Simular", "Anexar Documento", "Laudo / Pré-Análise", "Proposta", "Emissão"];
export const ROTULO_ETAPA: Record<string, string> = { "Cadastro": "Cadastro", "Selecionar Unidade": "Unidade", "Simular": "Simular",
  "Anexar Documento": "Documentos", "Laudo / Pré-Análise": "Análise", "Proposta": "Proposta", "Emissão": "Emissão" };
export const CHANCE = { emissao: 0.85, proposta: 0.5, aprovada: 0.6, analise: 0.3, documentos: 0.2, unidade: 0.12, cadastro: 0.06 };
export const DIAS_MORTA = 60;

const decod = (s: string | null | undefined) => (s ?? "").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const chaveCli = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const ordem = (e: string | null) => { const i = ORDEM_ETAPAS.indexOf(e ?? ""); return i < 0 ? -1 : i; };

export type Motivo = "vendida" | "reprovada" | "morta" | "duplicada" | null;
export interface PastaLida extends PastaJunix {
  status: string; idade: number; aprovada: boolean; reprovada: boolean;
  motivo: Motivo; viva: boolean; chance: number; prox: string; reta: boolean; valeEsta?: PastaJunix;
}

export function lerPastas(pastas: PastaJunix[]): PastaLida[] {
  const agora = Date.now();
  const base: PastaLida[] = pastas.map((p) => {
    const status = decod(p.status_texto);
    const reprovada = /REPROVAD|N[AÃ]O APROVAD/i.test(status);
    const aprovada = !reprovada && /APROVAD/i.test(status);
    const idade = p.cadastrada_em ? Math.max(0, Math.round((agora - new Date(p.cadastrada_em).getTime()) / 864e5)) : (p.dias ?? 0);
    return { ...p, status, idade, aprovada, reprovada, motivo: null, viva: false, chance: 0, prox: "", reta: false };
  });
  // duplicadas: fica a pasta vendida ou a mais avançada (empate: a mais nova)
  const porCli = new Map<string, PastaLida[]>();
  for (const p of base) { const k = chaveCli(p.cliente); if (!k) continue; porCli.set(k, [...(porCli.get(k) ?? []), p]); }
  for (const ps of porCli.values()) {
    if (ps.length < 2) continue;
    const vale = ps.find((p) => /venda/i.test(p.etapa ?? "")) ??
      [...ps].sort((a, b) => ordem(b.etapa) - ordem(a.etapa) || String(b.cadastrada_em).localeCompare(String(a.cadastrada_em)))[0];
    for (const p of ps) if (p !== vale) { p.motivo = "duplicada"; p.valeEsta = vale; }
  }
  for (const p of base) {
    const e = p.etapa ?? "";
    if (/venda/i.test(e)) p.motivo = "vendida";
    else if (p.reprovada) p.motivo = p.motivo ?? "reprovada";
    else if (!p.motivo && p.idade > DIAS_MORTA && !["Emissão", "Proposta"].includes(e) && !p.aprovada) p.motivo = "morta";
    p.viva = !p.motivo;
    p.reta = p.viva && (["Emissão", "Proposta"].includes(e) || p.aprovada);
    p.chance = !p.viva ? 0 : e === "Emissão" ? CHANCE.emissao : e === "Proposta" ? CHANCE.proposta
      : /laudo|an[aá]lise/i.test(e) ? (p.aprovada ? CHANCE.aprovada : CHANCE.analise)
      : /documento/i.test(e) ? CHANCE.documentos : /unidade|simular/i.test(e) ? CHANCE.unidade : CHANCE.cadastro;
    p.prox = e === "Emissão" ? (/EMITIDO/i.test(p.status) ? "Contrato emitido: cobrar a assinatura do cliente esta semana" : "Em emissão: cobrar o contrato da construtora e marcar a assinatura")
      : e === "Proposta" ? "Fechar o cadastro da proposta e mandar para emissão"
      : p.aprovada ? "Aprovado no banco: escolher a unidade e marcar a assinatura"
      : p.reprovada ? "Reprovado: tentar composição de renda ou outro banco, ou arquivar"
      : /laudo|an[aá]lise/i.test(e) ? "Análise no banco: acompanhar o Serasa e preparar plano B de renda"
      : /documento/i.test(e) ? "Cobrar do cliente os documentos que faltam"
      : /cadastro/i.test(e) ? "Escolher a unidade com o cliente ou descartar a pasta"
      : /venda/i.test(e) ? (/PEND/i.test(p.status) ? "Venda confirmada com pendência: resolver a unidade" : "Venda confirmada")
      : "Escolher a unidade com o cliente esta semana";
  }
  return base;
}

export function resumoPastas(ls: PastaLida[]) {
  const vivas = ls.filter((p) => p.viva);
  const grupo = (f: (p: PastaLida) => boolean) => { const ps = vivas.filter(f); return { n: ps.length, prev: ps.reduce((a, p) => a + p.chance, 0) }; };
  return {
    total: ls.length, vivas: vivas.length,
    clientes: new Set(ls.map((p) => chaveCli(p.cliente))).size,
    previsao: vivas.reduce((a, p) => a + p.chance, 0),
    reta: grupo((p) => p.reta),
    meio: grupo((p) => !p.reta && /laudo|an[aá]lise|documento/i.test(p.etapa ?? "")),
    comeco: grupo((p) => !p.reta && /cadastro|unidade|simular/i.test(p.etapa ?? "")),
    reprovadas: ls.filter((p) => p.motivo === "reprovada").length,
    mortas: ls.filter((p) => p.motivo === "morta").length,
    duplicadas: ls.filter((p) => p.motivo === "duplicada").length,
  };
}
