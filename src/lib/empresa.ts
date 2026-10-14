// Dados da empresa desta instalação do Comandra (nome, diretoria no C2S, apelidos do Junix, notas para a IA).
// Ficam em system_settings.empresa — cada empresa tem a sua; nada do Econ fica escrito no código.
// Carregado uma vez antes de o app abrir (main.tsx); quem usa chama empresa().
import { supabase } from "@/integrations/supabase/client";

export interface Empresa {
  nome: string;                         // como a empresa se apresenta ao cliente ("Econ")
  nome_comercial: string;               // nome da conta comercial ("Econ Vendas")
  diretoria_c2s: string;                // nó de diretoria no C2S cujo plantão o Comandra acompanha
  c2s_empresas: string;                 // empresas no C2S, separadas por |
  junix_url: string;
  apelidos_gerente: Record<string, string>; // nome no Junix/C2S → nome no Comandra (chave em maiúsculas, sem espaço)
  apelidos_super: Record<string, string>;
  notas_ia: string[];                   // ressalvas que a IA da Estratégia precisa saber
}
const PADRAO: Empresa = { nome: "", nome_comercial: "", diretoria_c2s: "", c2s_empresas: "", junix_url: "",
  apelidos_gerente: {}, apelidos_super: {}, notas_ia: [] };
let atual: Empresa = PADRAO;

export async function carregarEmpresa() {
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", "empresa").maybeSingle();
    const v = (typeof data?.value === "string" ? JSON.parse(data.value) : data?.value) ?? {};
    atual = { ...PADRAO, ...v };
  } catch { atual = PADRAO; }
}
export const empresa = () => atual;
/** nome da empresa para mensagens ("da Econ"); vazio vira "da nossa equipe" */
export const daEmpresa = () => (atual.nome ? `da ${atual.nome}` : "da nossa equipe");
