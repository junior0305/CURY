// Dados da empresa (só diretor/admin): o que antes ficava escrito no código do Econ — nome que aparece nas
// mensagens ao cliente, nome da conta comercial, a diretoria cujo plantão o C2S manda, e os apelidos de quem
// tem nome diferente no Junix/C2S e no Comandra. Grava em system_settings.empresa pela RPC salvar_empresa.
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { empresa, carregarEmpresa } from "@/lib/empresa";

type Par = { de: string; para: string };
const paraPares = (m: Record<string, string>) => Object.entries(m ?? {}).map(([de, para]) => ({ de, para }));
const paraMapa = (ps: Par[]) => Object.fromEntries(ps.filter((p) => p.de.trim() && p.para.trim())
  .map((p) => [p.de.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, ""), p.para.trim().toUpperCase()]));

export default function DadosEmpresa() {
  const e = empresa();
  const [nome, setNome] = useState(e.nome);
  const [nomeCom, setNomeCom] = useState(e.nome_comercial);
  const [diretoria, setDiretoria] = useState(e.diretoria_c2s);
  const [apGer, setApGer] = useState<Par[]>(paraPares(e.apelidos_gerente));
  const [apSup, setApSup] = useState<Par[]>(paraPares(e.apelidos_super));
  const [notas, setNotas] = useState<string[]>(e.notas_ia ?? []);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!nome.trim()) { toast.error("Preencha o nome da empresa."); return; }
    setSalvando(true);
    const { error } = await (supabase as any).rpc("salvar_empresa", { p_dados: {
      nome, nome_comercial: nomeCom, diretoria_c2s: diretoria, c2s_empresas: e.c2s_empresas, junix_url: e.junix_url,
      apelidos_gerente: paraMapa(apGer), apelidos_super: paraMapa(apSup), notas_ia: notas.map((n) => n.trim()).filter(Boolean),
    } });
    setSalvando(false);
    if (error) { toast.error("Não consegui salvar: " + error.message); return; }
    await carregarEmpresa();
    toast.success("Dados da empresa salvos. Mensagens, painéis e robôs já usam os novos.");
  };

  const Pares = ({ lista, set, ex }: { lista: Par[]; set: (p: Par[]) => void; ex: [string, string] }) => (
    <div className="de-pares">
      {lista.map((p, i) => (
        <div key={i} className="de-par">
          <input value={p.de} placeholder={ex[0]} aria-label="Nome no Junix ou C2S" onChange={(ev) => set(lista.map((x, j) => (j === i ? { ...x, de: ev.target.value } : x)))} />
          <span>→</span>
          <input value={p.para} placeholder={ex[1]} aria-label="Nome no Comandra" onChange={(ev) => set(lista.map((x, j) => (j === i ? { ...x, para: ev.target.value } : x)))} />
          <button className="de-x" onClick={() => set(lista.filter((_, j) => j !== i))} aria-label="Tirar">✕</button>
        </div>
      ))}
      <button className="cfg-btn" onClick={() => set([...lista, { de: "", para: "" }])}>+ Adicionar</button>
    </div>
  );

  return (
    <div className="de">
      <style>{CSS}</style>
      <p className="cfg-dica">Os dados que identificam a sua empresa no Comandra. Antes ficavam escritos no código; agora cada empresa preenche os seus.</p>

      <div className="cfg-box de-box">
        <h3>Identificação</h3>
        <label className="cfg-sel">Nome da empresa
          <input id="de-nome" value={nome} onChange={(ev) => setNome(ev.target.value)} placeholder="Ex.: Econ" />
          <small>Aparece nas mensagens ao cliente: "Quem vai te atender é Diego, da <b>{nome || "…"}</b>".</small>
        </label>
        <label className="cfg-sel">Nome da conta comercial
          <input id="de-nomecom" value={nomeCom} onChange={(ev) => setNomeCom(ev.target.value)} placeholder="Ex.: Econ Vendas" />
          <small>Usado no rodapé dos disparos de WhatsApp e no nome da conta comercial.</small>
        </label>
      </div>

      <div className="cfg-box de-box">
        <h3>Plantão no C2S</h3>
        <label className="cfg-sel">Diretoria acompanhada no C2S
          <input id="de-dir" value={diretoria} onChange={(ev) => setDiretoria(ev.target.value)} placeholder="Ex.: Diretor Fulano de Tal" />
          <small>Exatamente como aparece no C2S. O C2S manda o plantão da rede inteira; o Comandra conta só o desta diretoria.</small>
        </label>
      </div>

      <div className="cfg-box de-box">
        <h3>Nomes diferentes entre os sistemas</h3>
        <p className="cfg-dica">Quando um gerente ou super aparece com outro nome no Junix ou no C2S, diga aqui quem ele é no Comandra. Assim as vendas e o plantão caem na equipe certa.</p>
        <b className="de-sub">Gerentes</b>
        {Pares({ lista: apGer, set: setApGer, ex: ["OtavioNeto (no Junix)", "Jaguar (no Comandra)"] })}
        <b className="de-sub">Superintendentes</b>
        {Pares({ lista: apSup, set: setApSup, ex: ["Snow UV (no Junix)", "Adajes (no Comandra)"] })}
      </div>

      <div className="cfg-box de-box">
        <h3>Observações para a IA</h3>
        <p className="cfg-dica">Ressalvas que a IA da Estratégia precisa saber para não tirar conclusão errada. Ex.: "vendas da equipe X antes de 12/10 não contam no placar".</p>
        {notas.map((n, i) => (
          <div key={i} className="de-par">
            <input className="de-nota" value={n} onChange={(ev) => setNotas(notas.map((x, j) => (j === i ? ev.target.value : x)))} aria-label={`Observação ${i + 1}`} />
            <button className="de-x" onClick={() => setNotas(notas.filter((_, j) => j !== i))} aria-label="Tirar">✕</button>
          </div>
        ))}
        <button className="cfg-btn" onClick={() => setNotas([...notas, ""])}>+ Adicionar observação</button>
      </div>

      <div className="cfg-pessoa-acoes"><button className="cfg-btn prim" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar dados da empresa"}</button></div>
    </div>
  );
}

const CSS = `
.mgr10 .de{display:grid;gap:var(--s2)}
.mgr10 .de-box{max-width:820px;gap:12px}
.mgr10 .de-box .cfg-sel input{width:100%;max-width:520px}
.mgr10 .de-box small{font-weight:400;color:var(--ink-3);font-size:12.5px}
.mgr10 .de-sub{font-size:13px;color:var(--ink-2)}
.mgr10 .de-pares{display:grid;gap:8px}
.mgr10 .de-par{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.mgr10 .de-par input{font:inherit;font-size:13.5px;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 10px;min-width:180px;flex:1}
.mgr10 .de-par .de-nota{min-width:280px}
.mgr10 .de-x{color:var(--ink-3);font-size:14px;padding:4px 8px}
`;
