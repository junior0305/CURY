// Régua da Equipe: o que o sistema cobra (e com que carinho) em nome do líder.
//
// O sistema sugere cada regra (public.regua_catalogo). O diretor define a faixa e o que é
// obrigatório para a empresa; o super ajusta as equipes dele; o gerente, a equipe dele.
// Vale o ajuste mais perto do corretor. Quem roda é a edge regua-cobranca (crontab, 30 min).
// Mensagem assinada por um líder com o chip desligado fica "pronta" aqui para ele enviar.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import "@/styles/manager-v10.css";

type Nivel = "diretor" | "super" | "gerente";
type Cat = {
  chave: string; ordem: number; titulo: string; descricao: string; tom: "cuidado" | "lembrete" | "cobranca";
  unidade: "horas" | "dias"; prazo_sugerido: number; prazo_min: number; prazo_max: number;
  hora_sugerida: string | null; assina: string; texto_sugerido: string;
  etapas_sugeridas: Etapa[]; max_etapas: number; para_opcoes: string[];
};
type Etapa = { prazo: number; para: "corretor" | "gerente" | "super"; assina: "comandra" | "gerente" | "super" | "diretor"; texto: string };
type Regra = {
  id: string; chave: string; nivel: Nivel; dono_id: string | null; ligada: boolean | null; prazo: number | null;
  texto: string | null; hora: string | null; obrigatoria: boolean; prazo_min: number | null; prazo_max: number | null; atualizado_em?: string; etapas: Etapa[] | null;
};

const sb = supabase as any;
const TOM: Record<string, string> = { cuidado: "Cuidado", lembrete: "Lembrete", cobranca: "Cobrança" };
const NOME_NIVEL: Record<Nivel, string> = { diretor: "diretor", super: "superintendente", gerente: "gerente" };
const VARS: Record<string, string> = {
  "{nome}": "primeiro nome de quem recebe", "{corretor}": "o corretor", "{qtd}": "quantos", "{lista}": "a lista (leads ou corretores)",
  "{dias}": "dias sem plantão", "{prazo}": "o prazo do toque", "{assinatura}": "nome de quem assina",
};
const PARA: Record<string, string> = { corretor: "corretor", gerente: "gerente", super: "superintendente" };
const ASSINA: Record<string, string> = { comandra: "Comandra", gerente: "gerente", super: "superintendente", diretor: "diretor" };
const ORDEM: Record<string, number> = { corretor: 0, gerente: 1, super: 2, diretor: 3 };

export default function ReguaEquipe({ nivel, donoId }: { nivel: Nivel; donoId: string | null }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const meuId = session?.user?.id ?? null;

  const { data: catalogo } = useQuery({
    queryKey: ["regua-catalogo"], staleTime: 300_000,
    queryFn: async () => ((await sb.from("regua_catalogo").select("*").order("ordem")).data ?? []) as Cat[],
  });
  const { data: regras } = useQuery({
    queryKey: ["regua-regras"],
    queryFn: async () => ((await sb.from("regua_regras").select("*")).data ?? []) as Regra[],
  });
  // o gerente herda do super dele
  const { data: meuChefe } = useQuery({
    queryKey: ["regua-chefe", donoId], enabled: nivel === "gerente" && !!donoId, staleTime: Infinity,
    queryFn: async () => ((await sb.from("profiles").select("manager_id").eq("id", donoId).maybeSingle()).data?.manager_id ?? null) as string | null,
  });
  const { data: stats } = useQuery({
    queryKey: ["regua-stats"],
    queryFn: async () => {
      const desde = new Date(Date.now() - 30 * 86400e3).toISOString();
      const { data } = await sb.from("cobrancas").select("regra, estado, respondida_em").not("regra", "is", null).gte("enviada_em", desde);
      const m: Record<string, { enviadas: number; respondidas: number; prontas: number }> = {};
      for (const c of data ?? []) {
        const x = (m[c.regra] ??= { enviadas: 0, respondidas: 0, prontas: 0 });
        if (c.estado === "pronta") x.prontas++; else if (c.estado === "enviada") x.enviadas++;
        if (c.respondida_em) x.respondidas++;
      }
      return m;
    },
  });

  const recarregar = () => { qc.invalidateQueries({ queryKey: ["regua-regras"] }); };

  return (
    <div className="rg">
      <style>{CSS}</style>
      <header className="rg-top">
        <div>
          <h2>Régua da equipe</h2>
          <p>O sistema sugere o que cobrar e quando. Você ajusta {nivel === "diretor" ? "o padrão da empresa e a faixa que cada líder pode mexer"
            : nivel === "super" ? "para as suas equipes, dentro da faixa do diretor" : "para a sua equipe, dentro da faixa do diretor"}.
            Nada é enviado enquanto a regra estiver desligada.</p>
        </div>
      </header>

      {meuId ? <Prontas meuId={meuId} /> : null}

      <div className="rg-lista">
        {(catalogo ?? []).map((c) => (
          <CartaoRegra key={c.chave} cat={c} nivel={nivel} donoId={donoId} meuId={meuId}
            regras={regras ?? []} chefeId={nivel === "gerente" ? meuChefe ?? null : nivel === "super" ? null : null}
            stats={stats?.[c.chave]} onSalvo={recarregar} />
        ))}
        {!catalogo ? <p className="rg-vazio">Carregando as regras…</p> : null}
      </div>

      {nivel !== "diretor" ? <Pausas /> : null}

      <section className="rg-regras-fixas">
        <h3>Valem sempre, para todas as equipes</h3>
        <ul>
          <li>No máximo 2 mensagens da régua por pessoa por dia, de segunda a sábado, das 8h às 20h.</li>
          <li>Cuidado e cobrança nunca no mesmo dia para a mesma pessoa.</li>
          <li>Cobrança sai do chip do gerente; se estiver desligado, do super da equipe; por último, do Junior. Nunca do chip de corretor.</li>
          <li>Mensagem assinada por um líder só sai do WhatsApp dele. Se o chip estiver desligado, ela fica pronta aqui para ele enviar.</li>
          <li>O mesmo lead não é cobrado duas vezes pela mesma regra.</li>
        </ul>
      </section>
    </div>
  );
}

function CartaoRegra({ cat, nivel, donoId, meuId, regras, chefeId, stats, onSalvo }: {
  cat: Cat; nivel: Nivel; donoId: string | null; meuId: string | null; regras: Regra[]; chefeId: string | null;
  stats?: { enviadas: number; respondidas: number; prontas: number }; onSalvo: () => void;
}) {
  const dir = regras.find((r) => r.chave === cat.chave && r.nivel === "diretor");
  const minha = regras.find((r) => r.chave === cat.chave && r.nivel === nivel && (r.dono_id ?? null) === (nivel === "diretor" ? null : donoId));
  // o que vem de cima (para mostrar "herdado de")
  const sup = nivel === "gerente" && chefeId ? regras.find((r) => r.chave === cat.chave && r.nivel === "super" && r.dono_id === chefeId) : undefined;
  const acima = (nivel === "diretor" ? [] : nivel === "super" ? [dir] : [sup, dir]).filter(Boolean) as Regra[];
  const herd = <K extends keyof Regra>(k: K) => {
    for (const r of acima) if (r[k] !== null && r[k] !== undefined) return { v: r[k], de: r.nivel as Nivel };
    return null;
  };
  const min = dir?.prazo_min ?? cat.prazo_min, max = dir?.prazo_max ?? cat.prazo_max;
  const obrig = !!dir?.obrigatoria && nivel !== "diretor";

  const base = {
    ligada: minha?.ligada ?? (herd("ligada")?.v as boolean | undefined) ?? false,
    etapas: (minha?.etapas ?? (herd("etapas")?.v as Etapa[] | undefined) ?? cat.etapas_sugeridas) as Etapa[],
    hora: minha?.hora ?? (herd("hora")?.v as string | undefined) ?? cat.hora_sugerida ?? "",
    obrigatoria: dir?.obrigatoria ?? false,
    prazo_min: dir?.prazo_min ?? cat.prazo_min, prazo_max: dir?.prazo_max ?? cat.prazo_max,
  };
  const [d, setD] = useState(base);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState<any[] | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  useEffect(() => { setD(base); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [minha?.id, minha?.atualizado_em, dir?.id, sup?.id, regras.length]);

  const mudou = JSON.stringify(d) !== JSON.stringify(base);
  const ligadaEfetiva = obrig ? true : d.ligada;
  const deOnde = herd("etapas") ?? herd("ligada");
  const origem = minha ? "ajustado por você" : deOnde ? `herdado do ${NOME_NIVEL[deOnde.de]}` : "sugerido pelo sistema";
  const un = cat.unidade === "horas" ? "h" : cat.unidade === "dias" ? " dias" : "";
  const unLonga = cat.unidade === "horas" ? "horas" : "dias";

  // prazos em ordem crescente e dentro da faixa
  const problema = (() => {
    if (!d.etapas.length) return "Tenha pelo menos um toque.";
    for (let i = 0; i < d.etapas.length; i++) {
      const e = d.etapas[i];
      if (e.prazo < min || e.prazo > max) return `O toque ${i + 1} precisa ficar entre ${min} e ${max} ${unLonga}.`;
      if (i && e.prazo <= d.etapas[i - 1].prazo) return `O toque ${i + 1} precisa vir depois do toque ${i}.`;
      if (!e.texto.trim()) return `Escreva a mensagem do toque ${i + 1}.`;
      if (e.assina !== "comandra" && ORDEM[e.assina] <= ORDEM[e.para]) return `No toque ${i + 1}, quem assina precisa estar acima de quem recebe.`;
    }
    return null;
  })();

  const mudaEtapa = (i: number, patch: Partial<Etapa>) => setD({ ...d, etapas: d.etapas.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const tiraEtapa = (i: number) => setD({ ...d, etapas: d.etapas.filter((_, j) => j !== i) });
  const poeEtapa = () => {
    const ult = d.etapas[d.etapas.length - 1];
    const sug = cat.etapas_sugeridas[d.etapas.length] ?? ult ?? cat.etapas_sugeridas[0];
    const prazo = Math.min(max, Math.max((ult?.prazo ?? 0) + 1, sug?.prazo ?? min));
    setD({ ...d, etapas: [...d.etapas, { ...sug, prazo }] });
  };

  const salvar = async (extra?: Partial<typeof d>) => {
    const v = { ...d, ...extra };
    if (!extra && problema) { toast.error(problema); return; }
    setSalvando(true);
    const igualAoSugerido = JSON.stringify(v.etapas) === JSON.stringify(cat.etapas_sugeridas);
    const linha: any = {
      chave: cat.chave, nivel, dono_id: nivel === "diretor" ? null : donoId,
      ligada: v.ligada, etapas: igualAoSugerido && !minha?.etapas ? null : v.etapas,
      hora: cat.hora_sugerida ? (v.hora || null) : null,
      atualizado_por: meuId, atualizado_em: new Date().toISOString(),
    };
    if (nivel === "diretor") {
      linha.obrigatoria = v.obrigatoria;
      linha.prazo_min = Number(v.prazo_min) || null; linha.prazo_max = Number(v.prazo_max) || null;
    }
    const { error } = minha
      ? await sb.from("regua_regras").update(linha).eq("id", minha.id)
      : await sb.from("regua_regras").insert(linha);
    setSalvando(false);
    if (error) { toast.error("Não consegui salvar: " + error.message); return; }
    toast.success(v.ligada || obrig ? "Salvo. A régua roda de meia em meia hora, das 8h às 20h." : "Salvo. A regra continua desligada.");
    onSalvo();
  };
  const voltarSugerido = async () => {
    if (!minha) return;
    const { error } = await sb.from("regua_regras").delete().eq("id", minha.id);
    if (error) { toast.error("Não consegui voltar: " + error.message); return; }
    toast.success("Voltou ao " + (acima.length ? "padrão de cima." : "sugerido pelo sistema."));
    onSalvo();
  };
  const verPrevia = async () => {
    if (problema) { toast.error(problema); return; }
    setCarregandoPrevia(true);
    const { data, error } = await supabase.functions.invoke("regua-cobranca", { body: { modo: "previa", chave: cat.chave, etapas: d.etapas } });
    setCarregandoPrevia(false);
    if (error || (data as any)?.error) { toast.error("Não consegui calcular: " + ((data as any)?.error || error?.message)); return; }
    setPrevia((data as any)?.itens ?? []);
  };

  return (
    <article className={`rg-card ${ligadaEfetiva ? "on" : ""}`}>
      <div className="rg-card-h">
        <span className={`rg-tom ${cat.tom}`}>{TOM[cat.tom]}</span>
        <div className="rg-card-t">
          <h3>{cat.titulo}</h3>
          <p>{cat.descricao}</p>
        </div>
        <label className={`rg-switch ${obrig ? "trava" : ""}`} title={obrig ? "O diretor deixou esta regra obrigatória" : ""}>
          <input type="checkbox" checked={ligadaEfetiva} disabled={obrig || salvando}
            onChange={(e) => { setD({ ...d, ligada: e.target.checked }); salvar({ ligada: e.target.checked }); }} />
          <span>{obrig ? "Obrigatória" : ligadaEfetiva ? "Ligada" : "Desligada"}</span>
        </label>
      </div>

      <ol className="rg-escada">
        {base.etapas.map((e, i) => (
          <li key={i}><b className="mono">{e.prazo}{un}</b> → {PARA[e.para]} · assina {ASSINA[e.assina]}</li>
        ))}
      </ol>

      <div className="rg-resumo">
        {cat.hora_sugerida ? <span>Envia a partir das <b className="mono">{base.hora || cat.hora_sugerida}</b></span> : null}
        <span className="rg-origem">{origem}</span>
        {stats ? <span className="rg-stat mono">30 dias: {stats.enviadas} enviadas · {stats.respondidas} respondidas{stats.prontas ? ` · ${stats.prontas} prontas` : ""}</span> : null}
        <button className="rg-link" onClick={() => setAberto(!aberto)}>{aberto ? "Fechar ▲" : "Ajustar ▼"}</button>
      </div>

      {aberto ? (
        <div className="rg-edit">
          {d.etapas.map((e, i) => (
            <div key={i} className="rg-etapa">
              <div className="rg-etapa-h">
                <b>Toque {i + 1}</b>
                <span className="rg-inline wrap">
                  <span>depois de</span>
                  <input type="number" min={min} max={max} value={e.prazo} aria-label={`Prazo do toque ${i + 1}`}
                    onChange={(ev) => mudaEtapa(i, { prazo: Number(ev.target.value) })} />
                  <span>{unLonga} →</span>
                  <select value={e.para} aria-label={`Quem recebe o toque ${i + 1}`} onChange={(ev) => mudaEtapa(i, { para: ev.target.value as Etapa["para"] })}>
                    {cat.para_opcoes.map((p) => <option key={p} value={p}>{PARA[p]}</option>)}
                  </select>
                  <span>assina</span>
                  <select value={e.assina} aria-label={`Quem assina o toque ${i + 1}`} onChange={(ev) => mudaEtapa(i, { assina: ev.target.value as Etapa["assina"] })}>
                    {Object.keys(ASSINA).map((a) => <option key={a} value={a}>{ASSINA[a]}</option>)}
                  </select>
                </span>
                {d.etapas.length > 1 ? <button className="rg-link" onClick={() => tiraEtapa(i)}>Tirar</button> : null}
              </div>
              <textarea rows={4} value={e.texto} aria-label={`Mensagem do toque ${i + 1}`} onChange={(ev) => mudaEtapa(i, { texto: ev.target.value })} />
              {e.assina !== "comandra" ? <small>Sai do WhatsApp de quem assina. Se o chip dele estiver desligado, a mensagem fica pronta no painel dele para enviar.</small> : null}
            </div>
          ))}
          {d.etapas.length < cat.max_etapas ? <button className="rg-btn" onClick={poeEtapa}>+ Mais um toque</button> : null}

          <div className="rg-campos">
            {cat.hora_sugerida ? (
              <label>Enviar a partir de
                <input type="time" min="08:00" max="19:30" value={d.hora || cat.hora_sugerida} onChange={(ev) => setD({ ...d, hora: ev.target.value })} />
                <small>Entre 8h e 20h, de segunda a sábado.</small>
              </label>
            ) : null}
            {nivel === "diretor" ? (
              <>
                <label>Prazo que os líderes podem usar
                  <span className="rg-inline">
                    <input type="number" min={1} value={d.prazo_min} onChange={(ev) => setD({ ...d, prazo_min: Number(ev.target.value) })} />
                    <span>a</span>
                    <input type="number" min={1} value={d.prazo_max} onChange={(ev) => setD({ ...d, prazo_max: Number(ev.target.value) })} />
                    <span>{unLonga}</span>
                  </span>
                </label>
                <label className="rg-check">
                  <input type="checkbox" checked={d.obrigatoria} onChange={(ev) => setD({ ...d, obrigatoria: ev.target.checked })} />
                  Obrigatória: nenhum super ou gerente pode desligar
                </label>
              </>
            ) : null}
          </div>
          <small>{Object.entries(VARS).map(([k, v]) => <span key={k}><code>{k}</code> {v}</span>)}</small>
          {problema ? <p className="rg-erro">{problema}</p> : null}
          <div className="rg-acoes">
            <button className="rg-btn prim" disabled={!mudou || salvando || !!problema} onClick={() => salvar()}>{salvando ? "Salvando…" : "Salvar"}</button>
            <button className="rg-btn" disabled={carregandoPrevia} onClick={verPrevia}>{carregandoPrevia ? "Calculando…" : "Ver quem receberia agora"}</button>
            {minha ? <button className="rg-btn" onClick={voltarSugerido}>Voltar ao {acima.length ? "padrão de cima" : "sugerido"}</button> : null}
            {JSON.stringify(d.etapas) !== JSON.stringify(cat.etapas_sugeridas)
              ? <button className="rg-link" onClick={() => setD({ ...d, etapas: cat.etapas_sugeridas })}>Usar a escada sugerida</button> : null}
          </div>
          {previa ? (
            <div className="rg-previa">
              <b>{previa.length === 0 ? "Ninguém receberia agora." : `${previa.length} mensagem(ns) sairiam agora:`}</b>
              {previa.slice(0, 10).map((it, i) => (
                <div key={i} className="rg-previa-it">
                  <div>Toque {it.toque} · <b>{it.destinatario}</b> ({PARA[it.para]}) · {it.resumo} <span className="rg-origem">{it.canal}</span></div>
                  {i === 0 || previa[i - 1].toque !== it.toque ? <pre>{it.mensagem}</pre> : null}
                </div>
              ))}
              {previa.length > 10 ? <small>… e mais {previa.length - 10}.</small> : null}
              <small>A prévia não envia nada. Os limites do dia (2 por corretor, horário) entram na hora do envio.</small>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function Prontas({ meuId }: { meuId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["regua-prontas", meuId], refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await sb.from("cobrancas").select("id, para_id, para_phone, mensagem, regra, enviada_em, profiles:para_id(first_name, last_name)")
        .eq("de_id", meuId).eq("estado", "pronta").order("enviada_em", { ascending: false }).limit(30);
      return data ?? [];
    },
  });
  if (!data?.length) return null;
  const marcar = async (id: string, estado: "enviada" | "descartada") => {
    const { error } = await sb.from("cobrancas").update(estado === "enviada" ? { estado, canal: "whatsapp", enviada_em: new Date().toISOString() } : { estado }).eq("id", id);
    if (error) { toast.error("Não consegui marcar: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["regua-prontas", meuId] });
  };
  return (
    <section className="rg-prontas">
      <h3>{data.length} mensagem(ns) pronta(s) para você enviar</h3>
      <p>Seu WhatsApp não está conectado ao Comandra, então estas mensagens assinadas por você esperam aqui. Toque em "Abrir no WhatsApp", envie e marque como enviada.</p>
      {data.map((c: any) => {
        const nome = [c.profiles?.first_name, c.profiles?.last_name].filter(Boolean).join(" ") || "Corretor";
        const tel = String(c.para_phone || "").replace(/\D/g, "");
        return (
          <div key={c.id} className="rg-pronta">
            <div className="rg-pronta-t"><b>{nome}</b><span className="rg-origem">{new Date(c.enviada_em).toLocaleDateString("pt-BR")}</span></div>
            <pre>{c.mensagem}</pre>
            <div className="rg-acoes">
              {tel ? <a className="rg-btn prim" href={`https://wa.me/${tel}?text=${encodeURIComponent(c.mensagem || "")}`} target="_blank" rel="noreferrer">Abrir no WhatsApp</a>
                : <span className="rg-origem">Corretor sem telefone cadastrado</span>}
              <button className="rg-btn" onClick={() => marcar(c.id, "enviada")}>Enviei</button>
              <button className="rg-link" onClick={() => marcar(c.id, "descartada")}>Não vou enviar</button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Pausas() {
  const qc = useQueryClient();
  const { data: corretores } = useQuery({
    queryKey: ["regua-corretores"], staleTime: 300_000,
    queryFn: async () => {
      const { data: arv } = await sb.rpc("minha_arvore");
      const ids: string[] = Array.isArray(arv) ? arv : [];
      if (!ids.length) return [];
      const { data } = await sb.from("profiles").select("id, first_name, last_name").in("id", ids).eq("role", "BROKER").neq("is_active", false).order("first_name");
      return data ?? [];
    },
  });
  const { data: pausas } = useQuery({
    queryKey: ["regua-pausas"],
    queryFn: async () => ((await sb.from("regua_pausas").select("broker_id, ate, motivo").gte("ate", new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10))).data ?? []),
  });
  const [quem, setQuem] = useState(""); const [ate, setAte] = useState(""); const [motivo, setMotivo] = useState("");
  const nomeDe = useMemo(() => new Map<string, string>((corretores ?? []).map((c: any) => [c.id, [c.first_name, c.last_name].filter(Boolean).join(" ")])), [corretores]);
  const pausar = async () => {
    if (!quem || !ate) { toast.error("Escolha o corretor e até quando."); return; }
    const { error } = await sb.from("regua_pausas").upsert({ broker_id: quem, ate, motivo: motivo || null });
    if (error) { toast.error("Não consegui pausar: " + error.message); return; }
    toast.success("Pausado. A régua não fala com ele até " + ate.split("-").reverse().join("/") + ".");
    setQuem(""); setAte(""); setMotivo("");
    qc.invalidateQueries({ queryKey: ["regua-pausas"] });
  };
  const tirar = async (id: string) => {
    const { error } = await sb.from("regua_pausas").delete().eq("broker_id", id);
    if (error) { toast.error("Não consegui tirar a pausa: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["regua-pausas"] });
  };
  return (
    <section className="rg-pausas">
      <h3>Pausar corretor</h3>
      <p>Férias, atestado, licença: a régua não manda nada para ele até a data.</p>
      <div className="rg-inline wrap">
        <select value={quem} onChange={(e) => setQuem(e.target.value)} aria-label="Corretor">
          <option value="">Corretor…</option>
          {(corretores ?? []).map((c: any) => <option key={c.id} value={c.id}>{nomeDe.get(c.id)}</option>)}
        </select>
        <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" />
        <input type="text" placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <button className="rg-btn prim" onClick={pausar}>Pausar</button>
      </div>
      {(pausas ?? []).length ? (
        <ul className="rg-pausa-lista">
          {(pausas ?? []).map((p: any) => (
            <li key={p.broker_id}><b>{nomeDe.get(p.broker_id) ?? "Corretor"}</b> até {String(p.ate).split("-").reverse().join("/")}{p.motivo ? ` · ${p.motivo}` : ""}
              <button className="rg-link" onClick={() => tirar(p.broker_id)}>Tirar pausa</button></li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Página do gerente: /manager/regua, com o menu lateral. */
export function ReguaGerente() {
  const { mode, toggle } = useTheme();
  const { session } = useAuth();
  useEffect(loadFonts, []);
  return (
    <div className="mgr10 app2">
      <RailV10 atual="regua" mode={mode} toggle={toggle} />
      <main className="shell2"><div className="sup-wrap"><ReguaEquipe nivel="gerente" donoId={session?.user?.id ?? null} /></div></main>
    </div>
  );
}

const CSS = `
.mgr10 .rg{display:grid;gap:var(--s3);padding-block:var(--s2) var(--s5)}
.mgr10 .rg-top h2{font-size:24px}
.mgr10 .rg-top p{color:var(--ink-2);max-width:70ch;margin-top:6px}
.mgr10 .rg-lista{display:grid;gap:var(--s2)}
.mgr10 .rg-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:var(--s2);display:grid;gap:12px}
.mgr10 .rg-card.on{border-color:color-mix(in srgb,var(--blue) 45%,var(--line))}
.mgr10 .rg-card-h{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:start}
.mgr10 .rg-card-t h3{font-size:16.5px}
.mgr10 .rg-card-t p{color:var(--ink-3);font-size:13.5px;margin-top:2px}
.mgr10 .rg-tom{font-family:"JetBrains Mono",monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;padding:4px 8px;border-radius:999px;white-space:nowrap;margin-top:2px}
.mgr10 .rg-tom.cuidado{color:var(--good);background:var(--good-air)}
.mgr10 .rg-tom.lembrete{color:var(--amber);background:var(--amber-air)}
.mgr10 .rg-tom.cobranca{color:var(--red);background:var(--red-air)}
.mgr10 .rg-switch{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--ink-2);cursor:pointer;white-space:nowrap}
.mgr10 .rg-switch input{width:38px;height:22px;appearance:none;background:var(--sunk-2);border-radius:999px;position:relative;cursor:pointer;transition:background .15s}
.mgr10 .rg-switch input::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--card);box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}
.mgr10 .rg-switch input:checked{background:var(--blue)}
.mgr10 .rg-switch input:checked::after{left:19px}
.mgr10 .rg-switch.trava{cursor:default;opacity:.85}
.mgr10 .rg-resumo{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center;font-size:13.5px;color:var(--ink-2)}
.mgr10 .rg-origem{font-size:12px;color:var(--ink-3)}
.mgr10 .rg-stat{font-size:12px;color:var(--ink-3)}
.mgr10 .rg-link{color:var(--blue);font-weight:600;font-size:13px;margin-left:auto}
.mgr10 .rg-edit{border-top:1px solid var(--hair);padding-top:14px;display:grid;gap:14px}
.mgr10 .rg-campos{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.mgr10 .rg label{display:grid;gap:6px;font-size:13px;font-weight:600;color:var(--ink-2);min-width:0}
.mgr10 .rg small{font-weight:400;color:var(--ink-3);font-size:12px;display:flex;flex-wrap:wrap;gap:4px 12px}
.mgr10 .rg code{font-family:"JetBrains Mono",monospace;font-size:11.5px;color:var(--ink)}
.mgr10 .rg-inline{display:flex;align-items:center;gap:10px}
.mgr10 .rg-inline.wrap{flex-wrap:wrap}
.mgr10 .rg-inline input[type=range]{flex:1;accent-color:var(--blue)}
.mgr10 .rg input[type=number],.mgr10 .rg input[type=time],.mgr10 .rg input[type=date],.mgr10 .rg input[type=text],.mgr10 .rg select,.mgr10 .rg textarea{font:inherit;font-weight:400;color:var(--ink);background:var(--sunk);border:1px solid var(--line);border-radius:9px;padding:7px 10px}
.mgr10 .rg input[type=number]{width:76px}
.mgr10 .rg textarea{width:100%;resize:vertical;line-height:1.45;box-sizing:border-box}
.mgr10 .rg-check{display:flex!important;align-items:center;gap:8px}
.mgr10 .rg-acoes{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.mgr10 .rg-btn{font-size:13.5px;font-weight:600;padding:8px 14px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink);text-decoration:none}
.mgr10 .rg-btn.prim{background:var(--blue);border-color:var(--blue);color:#fff}
.mgr10 .rg-btn:disabled{opacity:.45;cursor:default}
.mgr10 .rg-previa{background:var(--sunk);border-radius:10px;padding:12px 14px;display:grid;gap:8px;font-size:13.5px}
.mgr10 .rg-previa-it{display:grid;gap:6px}
.mgr10 .rg pre{white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:13px;background:var(--card);border:1px solid var(--hair);border-radius:8px;padding:10px 12px;margin:0;color:var(--ink)}
.mgr10 .rg-prontas{background:var(--amber-air);border:1px solid color-mix(in srgb,var(--amber) 35%,transparent);border-radius:var(--r);padding:var(--s2);display:grid;gap:12px}
.mgr10 .rg-prontas h3,.mgr10 .rg-pausas h3,.mgr10 .rg-regras-fixas h3{font-size:16px}
.mgr10 .rg-prontas>p,.mgr10 .rg-pausas>p{color:var(--ink-2);font-size:13.5px}
.mgr10 .rg-pronta{background:var(--card);border-radius:10px;padding:12px;display:grid;gap:8px}
.mgr10 .rg-pronta-t{display:flex;gap:10px;align-items:baseline}
.mgr10 .rg-pausas{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:var(--s2);display:grid;gap:10px}
.mgr10 .rg-pausa-lista{margin:0;padding-left:18px;display:grid;gap:6px;font-size:13.5px}
.mgr10 .rg-pausa-lista .rg-link{margin-left:10px}
.mgr10 .rg-regras-fixas{color:var(--ink-2);font-size:13.5px}
.mgr10 .rg-regras-fixas ul{margin:8px 0 0;padding-left:18px;display:grid;gap:4px}
.mgr10 .rg-vazio{color:var(--ink-3)}
.mgr10 .rg-escada{margin:0;padding-left:20px;display:grid;gap:3px;font-size:13.5px;color:var(--ink-2)}
.mgr10 .rg-escada b{color:var(--ink)}
.mgr10 .rg-etapa{display:grid;gap:8px;background:var(--sunk);border-radius:10px;padding:12px}
.mgr10 .rg-etapa-h{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;font-size:13.5px}
.mgr10 .rg-etapa-h .rg-link{margin-left:auto}
.mgr10 .rg-etapa textarea{background:var(--card)}
.mgr10 .rg-erro{color:var(--red);font-size:13px;font-weight:600}
@media(max-width:620px){.mgr10 .rg-card-h{grid-template-columns:minmax(0,1fr) auto}.mgr10 .rg-tom{grid-column:1/-1;justify-self:start}}
`;
