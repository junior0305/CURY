/* Aba Pastas do diretor — porte do protótipo aprovado (pastas-proto.html, 13/10).
 * Pipeline real (sem duplicada/reprovada/parada), previsão do mês, funil por etapa, ataque de hoje,
 * limpeza do pipeline e visão por equipe. A cobrança vai para o SUPERINTENDENTE (não passar por cima);
 * cobrar o gerente direto é opcional e o super fica sabendo. */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMetasDiretoria, donoJunix, type SuperDiretoria, type PastaJunix } from "@/hooks/useDiretoria";
import { lerPastas, resumoPastas, ORDEM_ETAPAS, ROTULO_ETAPA, CHANCE, DIAS_MORTA, type PastaLida } from "./pastasAnalise";

const TICKET_PADRAO = 300_000;
const chaveEmp = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/^CONDOMINIO\s+/, "").replace(/[^A-Z0-9]/g, "");
const titulo = (t: string | null | undefined) => (t ?? "—").replace(/\s+BN\s*$/i, "").replace(/^Condom[ií]nio\s+/i, "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const cliCurto = (t: string | null | undefined) => { const w = titulo(t).split(" "); return w.length > 1 ? `${w[0]} ${w[1][0]}.` : w[0]; };
const mi = (v: number) => v >= 1e6 ? `R$ ${(v / 1e6).toFixed(2).replace(".", ",")} mi` : `R$ ${Math.round(v / 1e3)} mil`;
const v1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("pt-BR");
const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const foneWa = (f: string | null | undefined) => { const d = String(f ?? "").replace(/\D/g, ""); return d ? (d.startsWith("55") ? d : "55" + d) : null; };

type Pasta = PastaLida & { valor: number; superId: string; superNome: string; gerenteId: string | null; gerenteNome: string };

export default function PastasPainel({ diretorId, supers, pastas }: { diretorId: string; supers: SuperDiretoria[]; pastas: PastaJunix[] }) {
  const qc = useQueryClient();
  const { data: metas } = useMetasDiretoria(diretorId, inicioMes());
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [verTodas, setVerTodas] = useState(false);

  const { data: ticket } = useQuery({
    queryKey: ["junix-ticket"],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const rows: any[] = [];
      for (let a = 0; ; a += 1000) {
        const { data } = await supabase.from("junix_vendas" as any).select("empreendimento,vgv,qtd").eq("ativo", true).range(a, a + 999);
        rows.push(...((data ?? []) as any[])); if (!data || data.length < 1000) break;
      }
      const m = new Map<string, { s: number; n: number }>();
      for (const r of rows) { const q = Number(r.qtd ?? 1); if (!q || !r.vgv) continue; const k = chaveEmp(r.empreendimento); const x = m.get(k) ?? { s: 0, n: 0 }; x.s += Number(r.vgv) / q; x.n++; m.set(k, x); }
      return new Map([...m.entries()].map(([k, x]) => [k, x.s / x.n]));
    },
  });

  const gerIds = useMemo(() => [...new Set(supers.flatMap((s) => s.gerentes.map((g) => g.id)))], [supers]);
  const { data: fones } = useQuery({
    queryKey: ["fones-gerentes", gerIds.join(",")],
    enabled: gerIds.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,phone").in("id", gerIds);
      return new Map(((data ?? []) as any[]).map((p) => [p.id as string, (p.phone as string | null) ?? null]));
    },
  });

  const ls: Pasta[] = useMemo(() => lerPastas(pastas).map((p) => {
    const { superId, gerenteId } = donoJunix(supers, p.superintendente, p.gerente);
    const s = supers.find((x) => x.id === superId);
    const g = s?.gerentes.find((x) => x.id === gerenteId);
    return { ...p, valor: ticket?.get(chaveEmp(p.empreendimento)) ?? TICKET_PADRAO, superId, superNome: s?.nome ?? titulo(p.superintendente),
      gerenteId: gerenteId ?? null, gerenteNome: g?.nome ?? titulo(p.gerente) };
  }), [pastas, supers, ticket]);
  const r = resumoPastas(ls);
  const vivas = ls.filter((p) => p.viva);
  const realizado = metas?.dono?.realizado ?? 0, meta = metas?.dono?.meta ?? null;
  const fecha = realizado + r.previsao;
  const valorVivas = vivas.reduce((a, p) => a + p.valor, 0), valorPrev = vivas.reduce((a, p) => a + p.valor * p.chance, 0);
  const retaPs = vivas.filter((p) => p.reta);

  async function cobrar(p: Pasta | null, alvo: "super" | "gerente", lote?: { superId: string; texto: string; motivo: string }) {
    const s = supers.find((x) => x.id === (lote?.superId ?? p?.superId));
    if (!s) { toast.error("Superintendência desta pasta não está no Comandra."); return; }
    const sNome = s.nome.split(" ")[0];
    const paraId = alvo === "super" ? s.id : p!.gerenteId!;
    const paraNome = alvo === "super" ? sNome : p!.gerenteNome.split(" ")[0];
    const fone = alvo === "super" ? s.phone : fones?.get(paraId);
    const msg = lote ? lote.texto
      : alvo === "super"
        ? `${sNome}, a pasta do cliente ${cliCurto(p!.cliente)} (${titulo(p!.empreendimento)}), da equipe do ${p!.gerenteNome}, está em ${ROTULO_ETAPA[p!.etapa ?? ""]?.toLowerCase() ?? p!.etapa}. ${p!.prox}. Consegue resolver com o ${p!.gerenteNome} e me dar um retorno até amanhã?`
        : `${paraNome}, a pasta do cliente ${cliCurto(p!.cliente)} (${titulo(p!.empreendimento)}) está em ${ROTULO_ETAPA[p!.etapa ?? ""]?.toLowerCase() ?? p!.etapa}. ${p!.prox}. Me dá um retorno até amanhã? (${sNome} está sabendo)`;
    const motivo = lote?.motivo ?? `pasta ${p!.proposta_id} · ${ROTULO_ETAPA[p!.etapa ?? ""] ?? p!.etapa}`;
    const { error } = await supabase.from("cobrancas" as any).insert({ de_id: diretorId, para_id: paraId, motivo, canal: "whatsapp", enviada_em: new Date().toISOString() });
    if (error) { toast.error("Não registrei a cobrança: " + error.message); return; }
    // cobrou o gerente direto: o super fica sabendo, para ninguém passar por cima dele
    if (alvo === "gerente") await supabase.from("internal_notifications").insert({ from_id: diretorId, to_id: s.id, type: "COBRANCA_DIRETOR",
      message: `O diretor cobrou o ${paraNome} direto sobre a pasta de ${cliCurto(p!.cliente)} (${titulo(p!.empreendimento)}): ${p!.prox}.` }).then(() => {}, () => {});
    qc.invalidateQueries({ queryKey: ["diretoria"] });
    const wa = foneWa(fone);
    if (wa) { window.open(`https://api.whatsapp.com/send?phone=${wa}&text=${encodeURIComponent(msg)}`, "_blank"); toast.success(`Cobrança de ${paraNome} registrada. A mensagem abriu no seu WhatsApp.`); }
    else toast.info(`${paraNome} não tem telefone cadastrado. A cobrança ficou só no histórico.`);
  }

  if (!pastas.length) return <div className="dir-card dir-vazio">Nenhuma pasta no Junix agora.</div>;

  const maxEt = Math.max(1, ...ORDEM_ETAPAS.map((e) => ls.filter((p) => p.etapa === e).length));
  const ataque = [...vivas].sort((a, b) => b.chance * b.valor - a.chance * a.valor).slice(0, verTodas ? vivas.length : 8);
  const vendida = ls.filter((p) => p.motivo === "vendida");

  const limpeza: [string, string, string, Pasta[], (p: Pasta) => string][] = [
    ["reprovada", "Reprovadas no banco", "Decidir: tentar composição de renda / outro banco ou arquivar.", ls.filter((p) => p.motivo === "reprovada"), (p) => p.status.toLowerCase()],
    ["morta", `Paradas há ${DIAS_MORTA}+ dias`, "Confirmar se o cliente ainda quer; se não, arquivar no Junix.", ls.filter((p) => p.motivo === "morta"), (p) => `${(p.etapa ?? "").toLowerCase()} · ${p.idade} dias`],
    ["duplicada", "Duplicadas", "Mesmo cliente em mais de uma pasta. Fica a mais avançada; as outras saem da conta.", ls.filter((p) => p.motivo === "duplicada"),
      (p) => `${(p.etapa ?? "").toLowerCase()} · a que vale: ${(p.valeEsta?.etapa ?? "").toLowerCase()}`],
  ];

  // por equipe
  const porSup = new Map<string, { nome: string; ger: Map<string, Pasta[]> }>();
  for (const p of ls) {
    const k = p.superId; const x = porSup.get(k) ?? { nome: k === "fora" ? "Sem superintendência no Comandra" : p.superNome, ger: new Map() };
    x.ger.set(p.gerenteNome, [...(x.ger.get(p.gerenteNome) ?? []), p]); porSup.set(k, x);
  }
  const prevDe = (ps: Pasta[]) => ps.filter((p) => p.viva).reduce((a, p) => a + p.chance, 0);
  const linha = (nome: ReactNode, ps: Pasta[], cls: string, onClick?: () => void, key?: string) => {
    const viv = ps.filter((p) => p.viva), ret = viv.filter((p) => p.reta).length;
    const n = (m: string) => ps.filter((p) => p.motivo === m).length;
    return (
      <tr key={key} className={cls} onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
        <td>{nome}</td><td>{ps.length}</td><td><b>{viv.length}</b></td><td className={ret ? "g" : ""}>{ret || "—"}</td>
        <td><b>{v1(prevDe(ps))}</b></td><td>{mi(viv.reduce((a, p) => a + p.valor * p.chance, 0))}</td>
        <td className={n("reprovada") ? "r" : ""}>{n("reprovada") || "—"}</td><td className={n("morta") ? "r" : ""}>{n("morta") || "—"}</td>
        <td>{n("duplicada") || "—"}</td><td>{viv.length ? `${Math.round(viv.reduce((a, p) => a + p.idade, 0) / viv.length)}d` : "—"}</td>
      </tr>
    );
  };

  return (
    <>
      <section className="dir-card pst-band">
        <div className="pst-band-g">
          <div><div className="dir-lbl">Pipeline real</div><div className="pst-big">{r.vivas} <small>de {r.total} pastas</small></div>
            <div className="pst-s">{r.clientes} clientes diferentes · {r.duplicadas} duplicadas · {r.reprovadas} reprovadas · {r.mortas} paradas há {DIAS_MORTA}+ dias</div></div>
          <div><div className="dir-lbl">Previsão de vendas no mês</div><div className="pst-big">{v1(r.previsao)} <small>das pastas vivas</small></div>
            <div className="pst-s">com as {v1(realizado)} feitas, o mês fecha perto de <b>{v1(fecha)}</b>{meta ? ` de ${meta}` : ""}</div></div>
          <div><div className="dir-lbl">Valor em jogo</div><div className="pst-big">{mi(valorVivas)}</div>
            <div className="pst-s">previsão ponderada {mi(valorPrev)} · ticket médio do empreendimento</div></div>
          <div><div className="dir-lbl">Reta final</div><div className="pst-big">{retaPs.length} <small>pastas</small></div>
            <div className="pst-s">emissão, proposta ou aprovada no banco · {mi(retaPs.reduce((a, p) => a + p.valor, 0))}</div></div>
        </div>
        {meta && fecha < meta ? <div className="pst-alerta">Mesmo fechando o provável, faltam {Math.round(meta - fecha)} vendas para a meta.
          <span>As pastas de hoje não bastam: empurrar a reta final esta semana e abrir pasta nova todo dia.</span></div>
          : meta ? <div className="pst-alerta ok">As pastas vivas sustentam a meta se a reta final fechar.<span>Prioridade: não deixar a reta final esfriar.</span></div> : null}
      </section>

      <div className="pst-g2">
        <section className="dir-card pst-sec">
          <div className="dir-h"><b>Onde as pastas estão</b><span>pastas vivas por etapa · valor estimado</span></div>
          <div className="pst-fun">
            {[...ORDEM_ETAPAS].reverse().map((e) => {
              const ps = ls.filter((p) => p.etapa === e), viv = ps.filter((p) => p.viva);
              const extra = /laudo/i.test(e) ? ` · ${ps.filter((p) => p.aprovada).length} aprovadas · ${ps.filter((p) => p.reprovada).length} reprovadas` : "";
              return (
                <div key={e} className="pst-fr">
                  <div className="nm">{ROTULO_ETAPA[e]}<small>{ps.length} pasta{ps.length === 1 ? "" : "s"}{extra}</small></div>
                  <div className="pst-bar"><i style={{ width: `${viv.length / maxEt * 100}%` }} /><b style={{ width: `${(ps.length - viv.length) / maxEt * 100}%` }} />{viv.length ? <em>{viv.length}</em> : null}</div>
                  <div className="v"><b>{mi(viv.reduce((a, p) => a + p.valor, 0))}</b>{v1(viv.reduce((a, p) => a + p.chance, 0))} prev.</div>
                </div>);
            })}
          </div>
          {vendida.length ? <div className="pst-s" style={{ marginTop: 8 }}>+ {vendida.length} venda{vendida.length > 1 ? "s" : ""} confirmada{vendida.length > 1 ? "s" : ""} ainda no kanban
            {vendida.some((p) => /PEND/i.test(p.status)) ? " (com pendência de unidade: já conta como venda, só falta resolver a unidade)" : ""}.</div> : null}
          <div className="pst-leg"><span><i style={{ background: "var(--blue)" }} />viva</span><span><i style={{ background: "var(--red)" }} />reprovada, parada há {DIAS_MORTA}+ dias ou duplicada</span></div>
        </section>

        <section className="dir-card pst-sec">
          <div className="dir-h"><b>Ataque de hoje</b><span>as que mais trazem venda no mês: chance × valor</span></div>
          <div className="pst-at">
            {ataque.map((p, i) => (
              <div key={p.proposta_id} className="pst-ai">
                <div className="n">{i + 1}</div>
                <div>
                  <div className="t">{cliCurto(p.cliente)} <small>· {titulo(p.empreendimento)} · {mi(p.valor)}</small></div>
                  <div className="d">{titulo(p.corretor)} · gerente {p.gerenteNome} · {p.superNome} · pasta com {p.idade} dias{(p.dias ?? 0) >= 7 ? ` · ${p.dias} dias nesta etapa` : ""}</div>
                  <div className="nx">{p.prox}</div>
                </div>
                <div className="r">
                  <span className={`dir-chip ${p.chance >= 0.6 ? "c-grn" : p.chance >= 0.3 ? "c-blue" : "c-gray"}`}>{Math.round(p.chance * 100)}% no mês</span>
                  {p.superId !== "fora" ? <button className="dir-btn solid" onClick={() => cobrar(p, "super")}>Cobrar {p.superNome.split(" ")[0]}</button> : null}
                  {p.gerenteId ? <button className="pst-link" onClick={() => cobrar(p, "gerente")}>ou cobrar o {p.gerenteNome.split(" ")[0]} direto</button> : null}
                </div>
              </div>))}
          </div>
          {vivas.length > 8 ? <button className="pst-link" style={{ marginTop: 8 }} onClick={() => setVerTodas((v) => !v)}>{verTodas ? "Mostrar só as 8 primeiras" : `Ver as ${vivas.length} pastas vivas`}</button> : null}
        </section>
      </div>

      <section className="dir-card pst-sec">
        <div className="dir-h"><b>Limpar o pipeline</b><span>pasta que não vai fechar engana a previsão e a meta · a cobrança vai para o super da equipe</span></div>
        <div className="pst-g3">
          {limpeza.map(([k, tit, desc, ps, det]) => {
            const porS = new Map<string, Pasta[]>(); ps.forEach((p) => porS.set(p.superId, [...(porS.get(p.superId) ?? []), p]));
            return (
              <div key={k} className="pst-lim">
                <h4>{tit} <span className={`dir-chip ${k === "reprovada" ? "c-red" : k === "morta" ? "c-org" : "c-gray"}`}>{ps.length}</span></h4>
                <p>{desc}</p>
                {ps.length ? <ul>{ps.map((p) => <li key={p.proposta_id}><b>{cliCurto(p.cliente)}</b> · {titulo(p.empreendimento)}<br /><small>{titulo(p.corretor)} · {p.gerenteNome} · {p.superNome} · {det(p)}</small></li>)}</ul>
                  : <div className="pst-s">Nada aqui.</div>}
                <div className="pst-lim-acts">
                  {[...porS.entries()].filter(([sid]) => sid !== "fora").map(([sid, xs]) => {
                    const sNome = supers.find((s) => s.id === sid)?.nome.split(" ")[0] ?? "";
                    const texto = `${sNome}, preciso que a sua equipe revise ${xs.length === 1 ? "esta pasta" : `estas ${xs.length} pastas`} (${tit.toLowerCase()}): ` +
                      xs.map((p) => `${cliCurto(p.cliente)} (${titulo(p.empreendimento)}, gerente ${p.gerenteNome})`).join("; ") + `. ${desc} Me dá um retorno até sexta?`;
                    return <button key={sid} className="dir-btn" onClick={() => cobrar(null, "super", { superId: sid, texto, motivo: `limpeza de pastas · ${tit.toLowerCase()}` })}>Pedir revisão a {sNome} ({xs.length})</button>;
                  })}
                </div>
              </div>);
          })}
        </div>
      </section>

      <section className="dir-card" style={{ padding: "18px 0 6px" }}>
        <div className="dir-h" style={{ padding: "0 18px 10px" }}><b>Por equipe</b><span>clique na superintendência para abrir os gerentes</span></div>
        <div className="dir-tree"><table>
          <thead><tr><th>Equipe</th><th>Pastas</th><th>Vivas</th><th>Reta final</th><th>Previsão</th><th>R$ previsto</th><th>Reprovadas</th><th>{DIAS_MORTA}+ dias</th><th>Duplicadas</th><th>Idade média</th></tr></thead>
          <tbody>
            {[...porSup.entries()].sort((a, b) => prevDe([...b[1].ger.values()].flat()) - prevDe([...a[1].ger.values()].flat())).flatMap(([sid, x]) => {
              const k = `pst:${sid}`;
              return [
                linha(<><span className={`dir-seta${abertos[k] ? " on" : ""}`} aria-hidden>▸</span>{x.nome}</>, [...x.ger.values()].flat(), "n0", () => setAbertos((v) => ({ ...v, [k]: !v[k] })), k),
                ...(abertos[k] ? [...x.ger.entries()].sort((a, b) => prevDe(b[1]) - prevDe(a[1])).map(([g, ps]) => linha(g, ps, "n1", undefined, `${k}:${g}`)) : []),
              ];
            })}
            {linha("Empresa", ls, "tot", undefined, "tot")}
          </tbody>
        </table></div>
      </section>
      <p className="dir-nota">Chance de fechar no mês: Emissão {CHANCE.emissao * 100}% · Proposta {CHANCE.proposta * 100}% · aprovada no banco {CHANCE.aprovada * 100}% · em análise {CHANCE.analise * 100}% · Documentos {CHANCE.documentos * 100}% · Unidade/Simular {CHANCE.unidade * 100}% · Cadastro {CHANCE.cadastro * 100}%. "Dias nesta etapa" é gravado desde 12/10; até ter histórico, a idade da pasta mede o atraso.</p>
    </>
  );
}
