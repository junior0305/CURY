// Fontes de dados (só diretor/admin): de onde o Comandra puxa plantão, visitas, vendas e pastas.
// O diretor escolhe o sistema, cola o token (ou usuário e senha, quando o sistema só oferece isso),
// testa e salva. Segredos vão para o cofre criptografado pela edge fontes-dados e nunca voltam para a tela.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Campo = { k: string; rot: string; segredo?: boolean; dica?: string; padrao?: string };
type Sistema = { id: string; nome: string; desc: string; usos: [string, string][]; campos: Campo[]; passos: string[] };
const SISTEMAS: Sistema[] = [
  { id: "c2s", nome: "C2S (Contact2Sale)", desc: "Plantão no estande, check-in e visitas dos corretores.",
    usos: [["plantao", "Plantão / check-in"], ["visitas", "Visitas no estande"], ["leads", "Leads do CRM"]],
    campos: [
      { k: "C2S_TOKEN", rot: "Token de integração", segredo: true },
      { k: "C2S_BASE", rot: "Endereço da API", padrao: "https://api.contact2sale.com/integration", dica: "Deixe o padrão, a não ser que o C2S indique outro." },
      { k: "C2S_EMPRESAS", rot: "Empresas no C2S (separadas por |)", dica: "Como aparecem no C2S. Ex.: Econ Vendas|Econ +" },
    ],
    passos: ["Entre no C2S com um usuário administrador.", "Abra o menu Integrações.", "Clique em \"Gerar token\" e copie o código.", "Cole aqui, salve e clique em Testar conexão."] },
  { id: "junix", nome: "Junix (ImobFlow)", desc: "Vendas confirmadas, contratos e pastas na esteira da Caixa.",
    usos: [["vendas", "Vendas"], ["pastas", "Pastas / propostas"]],
    campos: [
      { k: "JUNIX_URL", rot: "Endereço do sistema", dica: "O endereço que vocês abrem no navegador. Ex.: https://suaempresa.imobflow.com.br" },
      { k: "JUNIX_LOGIN", rot: "Usuário" },
      { k: "JUNIX_SENHA", rot: "Senha", segredo: true },
    ],
    passos: ["Peça ao administrador do Junix um usuário só para o Comandra, com perfil de consulta (sem poder alterar nada).", "Coloque aqui o endereço do sistema, o usuário e a senha desse usuário.", "Salve e clique em Testar conexão.", "Se o ImobFlow liberar token de API, troque pelo token: é mais seguro que senha."] },
  { id: "salesforce", nome: "Salesforce", desc: "Propostas, contas e oportunidades, para quem usa o Salesforce como CRM.",
    usos: [["vendas", "Vendas"], ["pastas", "Propostas"], ["leads", "Leads do CRM"]],
    campos: [
      { k: "SF_USER", rot: "Usuário (e-mail de login)" },
      { k: "SF_PASS", rot: "Senha", segredo: true },
      { k: "SF_TOKEN", rot: "Token de segurança", segredo: true, dica: "No Salesforce: Configurações pessoais → Redefinir meu token de segurança. Chega por e-mail." },
      { k: "SF_HOST", rot: "Servidor de login", padrao: "login.salesforce.com" },
    ],
    passos: ["Use um usuário de integração do Salesforce (não o seu pessoal).", "No Salesforce, abra Configurações pessoais → Redefinir meu token de segurança; o token chega por e-mail.", "Preencha usuário, senha e token aqui.", "Salve e clique em Testar conexão."] },
];

export default function FontesDados() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["fontes-dados"], staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fontes-dados", { body: { modo: "listar" } });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      return ((data as any).fontes ?? []) as any[];
    },
  });
  if (isLoading) return <p className="cfg-dica">Carregando as fontes de dados…</p>;
  return (
    <div className="fd">
      <style>{CSS}</style>
      <p className="cfg-dica">Escolha de onde o Comandra puxa plantão, visitas, vendas e pastas. Senhas e tokens ficam guardados criptografados e não aparecem de novo nesta tela, nem para você. Para trocar, é só digitar o novo.</p>
      {SISTEMAS.map((s) => <Cartao key={s.id} s={s} atual={(data ?? []).find((f) => f.sistema === s.id)} onSalvo={() => qc.invalidateQueries({ queryKey: ["fontes-dados"] })} />)}
    </div>
  );
}

function Cartao({ s, atual, onSalvo }: { s: Sistema; atual?: any; onSalvo: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [campos, setCampos] = useState<Record<string, string>>(() => Object.fromEntries(s.campos.filter((c) => !c.segredo).map((c) => [c.k, atual?.campos?.[c.k] ?? c.padrao ?? ""])));
  const [segredos, setSegredos] = useState<Record<string, string>>({});
  const [usos, setUsos] = useState<string[]>(atual?.usar_para ?? []);
  const [ocupado, setOcupado] = useState<"" | "salvar" | "testar">("");
  const configurado = !!atual && (atual.segredos?.length || Object.keys(atual.campos ?? {}).length);

  const salvar = async () => {
    setOcupado("salvar");
    const { data, error } = await supabase.functions.invoke("fontes-dados", { body: { modo: "salvar", sistema: s.id, campos, segredos, usar_para: usos } });
    setOcupado("");
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "Não consegui salvar."); return; }
    setSegredos({});
    toast.success(`${s.nome} salvo. Agora clique em Testar conexão.`);
    onSalvo();
  };
  const testar = async () => {
    setOcupado("testar");
    const { data, error } = await supabase.functions.invoke("fontes-dados", { body: { modo: "testar", sistema: s.id } });
    setOcupado("");
    const d = data as any;
    if (error || d?.error) { toast.error(d?.error || error?.message || "Não consegui testar."); return; }
    d.ok ? toast.success(d.msg) : toast.error(d.msg);
    onSalvo();
  };

  return (
    <div className={`cfg-box fd-c ${configurado ? "on" : ""}`}>
      <div className="fd-h">
        <div>
          <h3>{s.nome}</h3>
          <p>{s.desc}</p>
        </div>
        <div className="fd-st">
          {!configurado ? <em className="neu">não configurado</em>
            : atual?.teste_ok === true ? <em className="grn">conectado</em>
            : atual?.teste_ok === false ? <em className="red">com erro</em> : <em className="amb">salvo, falta testar</em>}
          {atual?.usar_para?.length ? <small>usado para: {atual.usar_para.map((u: string) => s.usos.find((x) => x[0] === u)?.[1] ?? u).join(", ")}</small> : null}
          {atual?.teste_msg ? <small>{atual.teste_msg}{atual.testado_em ? ` · ${new Date(atual.testado_em).toLocaleString("pt-BR")}` : ""}</small> : null}
        </div>
      </div>
      <div className="cfg-pessoa-acoes">
        <button className="cfg-btn" onClick={() => setAberto(!aberto)}>{aberto ? "Fechar" : configurado ? "Alterar" : "Configurar"}</button>
        {configurado ? <button className="cfg-btn" onClick={testar} disabled={!!ocupado}>{ocupado === "testar" ? "Testando…" : "Testar conexão"}</button> : null}
      </div>
      {aberto ? (
        <div className="fd-form">
          <ol className="fd-passos">{s.passos.map((p, i) => <li key={i}>{p}</li>)}</ol>
          <fieldset className="fd-usos"><legend>Usar para</legend>
            {s.usos.map(([k, r]) => (
              <label key={k}><input type="checkbox" checked={usos.includes(k)} onChange={(e) => setUsos(e.target.checked ? [...usos, k] : usos.filter((x) => x !== k))} /> {r}</label>
            ))}
          </fieldset>
          {s.campos.map((c) => (
            <label key={c.k} className="cfg-sel fd-campo">{c.rot}
              {c.segredo ? (
                <input id={`fd-${s.id}-${c.k}`} type="password" autoComplete="new-password" value={segredos[c.k] ?? ""}
                  placeholder={atual?.segredos?.includes(c.k) ? "•••••• guardado (digite para trocar)" : ""}
                  onChange={(e) => setSegredos({ ...segredos, [c.k]: e.target.value })} />
              ) : (
                <input id={`fd-${s.id}-${c.k}`} value={campos[c.k] ?? ""} onChange={(e) => setCampos({ ...campos, [c.k]: e.target.value })} />
              )}
              {c.dica ? <small>{c.dica}</small> : null}
            </label>
          ))}
          <div className="cfg-pessoa-acoes">
            <button className="cfg-btn prim" onClick={salvar} disabled={!!ocupado}>{ocupado === "salvar" ? "Salvando…" : "Salvar"}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const CSS = `
.mgr10 .fd{display:grid;gap:var(--s2)}
.mgr10 .fd-c{max-width:none}
.mgr10 .fd-c.on{border-color:color-mix(in srgb,var(--blue) 35%,var(--line))}
.mgr10 .fd-h{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-start}
.mgr10 .fd-st{display:grid;gap:4px;justify-items:end;text-align:right}
.mgr10 .fd-st small{font-size:12px;color:var(--ink-3);max-width:360px}
.mgr10 .fd em{font-style:normal;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px}
.mgr10 .fd em.grn{color:var(--good);background:var(--good-air)} .mgr10 .fd em.red{color:var(--red);background:var(--red-air)}
.mgr10 .fd em.amb{color:var(--amber);background:var(--amber-air)} .mgr10 .fd em.neu{color:var(--ink-3);background:var(--sunk)}
.mgr10 .fd-form{display:grid;gap:12px;border-top:1px solid var(--hair);padding-top:12px}
.mgr10 .fd-passos{margin:0;padding-left:20px;display:grid;gap:4px;font-size:13.5px;color:var(--ink-2);background:var(--sunk);border-radius:10px;padding:12px 12px 12px 30px}
.mgr10 .fd-usos{border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px 18px;margin:0}
.mgr10 .fd-usos legend{font-size:13px;font-weight:600;color:var(--ink-2);padding:0 6px}
.mgr10 .fd-usos label{display:flex;gap:6px;align-items:center;font-size:13.5px}
.mgr10 .fd-campo input{max-width:520px;width:100%}
.mgr10 .fd-campo small{font-weight:400;color:var(--ink-3);font-size:12px}
`;
