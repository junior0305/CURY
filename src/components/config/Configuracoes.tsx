// Configurações do líder: o que ele ajusta uma vez e esquece, fora do menu do dia a dia.
//
// Seções: Avisos e cobranças (Régua da Equipe), Equipe (cadastrar, desligar, ligar nomes do C2S),
// Meu WhatsApp (chip do líder: a mensagem assinada por ele só sai se estiver conectado) e
// Facebook e leads (Integrações). Gerente em /manager/config; super e diretor na aba do /super.

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { loadFonts, RailV10 } from "@/components/manager-v10/RailV10";
import ReguaEquipe from "@/components/regua/ReguaEquipe";
import DesligarCorretor from "@/components/manager-v10/DesligarCorretor";
import { toast } from "sonner";
import { salvarGestor } from "@/hooks/useAnuncios";
import ContasAnuncio from "@/components/config/ContasAnuncio";
import FontesDados from "@/components/config/FontesDados";
import CadastrarCorretor from "@/components/manager-v10/CadastrarCorretor";
import VincularNomes from "@/components/manager-v10/VincularNomes";
import IntegracaoFacebook from "@/pages/admin/IntegracaoFacebook";
import "@/styles/manager-v10.css";

type Nivel = "diretor" | "super" | "gerente";
type Secao = "avisos" | "equipe" | "whatsapp" | "facebook" | "fontes";
const SECOES: { k: Secao; label: string; sub: string }[] = [
  { k: "avisos", label: "Avisos e cobranças", sub: "O que o sistema cobra e quando" },
  { k: "equipe", label: "Equipe", sub: "Cadastrar, desabilitar e desligar corretor" },
  { k: "whatsapp", label: "Meu WhatsApp", sub: "O chip que envia as suas mensagens" },
  { k: "facebook", label: "Facebook e leads", sub: "Páginas, formulários e quem recebe" },
  { k: "fontes", label: "Fontes de dados", sub: "C2S, Junix, Salesforce" },
];

const sb = supabase as any;

export default function Configuracoes({ nivel, donoId }: { nivel: Nivel; donoId: string | null }) {
  const [params, setParams] = useSearchParams();
  const inicial = (params.get("secao") as Secao) || "avisos";
  const [secao, setSecao] = useState<Secao>(SECOES.some((s) => s.k === inicial) ? inicial : "avisos");
  const ir = (k: Secao) => {
    setSecao(k);
    const p = new URLSearchParams(params); p.set("secao", k); setParams(p, { replace: true });
  };
  // fontes de dados: só o diretor escolhe
  const secoes = SECOES.filter((s) => s.k !== "fontes" || nivel === "diretor");
  const secaoOk: Secao = secoes.some((x) => x.k === secao) ? secao : "avisos";

  return (
    <div className="cfg">
      <style>{CSS}</style>
      <header className="cfg-top">
        <h1>Configurar</h1>
        <p>O que você ajusta uma vez e o sistema segue fazendo.</p>
      </header>
      <nav className="cfg-tabs" aria-label="Seções das configurações">
        {secoes.map((s) => (
          <button key={s.k} className={secaoOk === s.k ? "on" : ""} onClick={() => ir(s.k)}>
            <b>{s.label}</b><span>{s.sub}</span>
          </button>
        ))}
      </nav>
      <section className="cfg-corpo">
        {secaoOk === "avisos" ? <ReguaEquipe nivel={nivel} donoId={donoId} />
          : secaoOk === "equipe" ? <Equipe nivel={nivel} donoId={donoId} />
          : secaoOk === "whatsapp" ? <MeuWhatsApp />
          : secaoOk === "fontes" ? <FontesDados />
          : <><ContasAnuncio /><GestorTrafego donoId={donoId} /><div className="integ-shell"><IntegracaoFacebook /></div></>}
      </section>
    </div>
  );
}

function Equipe({ nivel, donoId }: { nivel: Nivel; donoId: string | null }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const eu = donoId ?? session?.user?.id ?? null;
  const [cadastrar, setCadastrar] = useState(false);
  // super e diretor escolhem o gerente; o gerente cadastra na própria equipe
  const { data: gerentes = [] } = useQuery({
    queryKey: ["cfg-gerentes", eu, nivel], enabled: nivel !== "gerente" && !!eu, staleTime: 300_000,
    queryFn: async () => {
      const { data: arv } = await sb.rpc("minha_arvore");
      const ids: string[] = Array.isArray(arv) ? arv : [];
      let q = sb.from("profiles").select("id, first_name, last_name").eq("role", "MANAGER").neq("is_active", false).order("first_name");
      if (nivel === "super") q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const { data } = await q;
      return (data ?? []).map((g: any) => ({ id: g.id, nome: [g.first_name, g.last_name].filter(Boolean).join(" ") }));
    },
  });
  const [gerenteVer, setGerenteVer] = useState<string>("");
  useEffect(() => { if (!gerenteVer && gerentes.length) setGerenteVer(gerentes[0].id); }, [gerentes, gerenteVer]);
  const managerId = nivel === "gerente" ? eu ?? undefined : gerenteVer || undefined;

  return (
    <div className="cfg-equipe">
      <div className="cfg-linha">
        {nivel !== "gerente" ? (
          <label className="cfg-sel">Equipe do gerente
            <select value={gerenteVer} onChange={(e) => setGerenteVer(e.target.value)}>
              {gerentes.map((g: any) => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </label>
        ) : <p className="cfg-dica"><b>Desabilitar</b> tira o corretor da roleta: ele para de receber lead novo, mas continua entrando e atendendo a carteira. <b>Desligar</b> é para quem saiu da empresa: separa a carteira e tira o acesso.</p>}
        <button className="cfg-btn prim" onClick={() => setCadastrar(true)} disabled={!managerId}>+ Cadastrar corretor</button>
      </div>
      {managerId ? <ListaCorretores managerId={managerId} /> : null}
      {managerId ? <VincularNomes managerId={managerId} /> : null}
      {cadastrar && managerId ? (
        <CadastrarCorretor managerId={managerId} gerentes={nivel === "gerente" ? undefined : gerentes}
          onFechar={() => setCadastrar(false)}
          onPronto={() => { setCadastrar(false); qc.invalidateQueries({ queryKey: ["equipe-lista"] }); }} />
      ) : null}
    </div>
  );
}

type Corretor = { id: string; first_name: string | null; last_name: string | null; email: string | null;
  last_seen_at: string | null; lead_assignment_enabled: boolean | null; must_change_password: boolean | null };
const quando = (iso: string | null) => {
  if (!iso) return "nunca entrou";
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  return h < 0.25 ? "online agora" : h < 24 ? `entrou há ${Math.round(h)}h` : `entrou há ${Math.round(h / 24)}d`;
};

function ListaCorretores({ managerId }: { managerId: string }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [desligar, setDesligar] = useState<string | null>(null);
  const chave = ["cfg-corretores", managerId];
  const { data: lista, isLoading } = useQuery({
    queryKey: chave, staleTime: 30_000,
    queryFn: async () => {
      const { data } = await sb.from("profiles")
        .select("id,first_name,last_name,email,last_seen_at,lead_assignment_enabled,must_change_password")
        .eq("manager_id", managerId).eq("role", "BROKER").eq("is_active", true).order("first_name");
      return (data ?? []) as Corretor[];
    },
  });
  const nome = (c: Corretor) => [c.first_name, c.last_name].filter(Boolean).join(" ") || "Corretor";
  const alternar = async (c: Corretor) => {
    const habilitar = c.lead_assignment_enabled === false;
    setOcupado(c.id);
    const { error } = await sb.from("profiles").update({ lead_assignment_enabled: habilitar }).eq("id", c.id);
    setOcupado(null);
    if (error) { toast.error("Não consegui mudar: " + error.message); return; }
    toast.success(habilitar ? `${c.first_name} voltou para a roleta e recebe lead novo.` : `${c.first_name} saiu da roleta. Continua com acesso e carteira.`);
    qc.invalidateQueries({ queryKey: chave });
  };
  const resetar = async (c: Corretor) => {
    setOcupado(c.id);
    const { data: r, error } = await supabase.functions.invoke("create-user", { body: { action: "reset-password", userId: c.id } });
    setOcupado(null);
    if (error || (r as any)?.error) { toast.error((r as any)?.error || error?.message || "Não consegui resetar."); return; }
    toast.success(`Senha de ${c.first_name} voltou para mudar@123. Ele troca no próximo acesso.`);
    qc.invalidateQueries({ queryKey: chave });
  };
  if (isLoading) return <p className="cfg-dica">Carregando a equipe…</p>;
  if (!lista?.length) return <p className="cfg-dica">Nenhum corretor ativo nesta equipe. Use "Cadastrar corretor".</p>;
  const ativos = lista.filter((c) => c.lead_assignment_enabled !== false).length;
  return (
    <div className="cfg-lista">
      <div className="cfg-lista-h"><b>{lista.length} corretores</b><span>{ativos} recebendo lead · {lista.length - ativos} desabilitado(s)</span></div>
      {lista.map((c) => {
        const desab = c.lead_assignment_enabled === false;
        return (
          <div key={c.id} className={`cfg-pessoa ${desab ? "desab" : ""}`}>
            <div className="cfg-pessoa-b">
              <b>{nome(c)}</b>
              <span>{c.email ?? "—"} · {quando(c.last_seen_at)}{c.must_change_password ? " · senha provisória" : ""}</span>
            </div>
            <span className={`cfg-tag ${desab ? "off" : "ok"}`}>{desab ? "Desabilitado" : "Recebendo leads"}</span>
            <div className="cfg-pessoa-acoes">
              <button className={`cfg-btn ${desab ? "prim" : ""}`} disabled={ocupado === c.id} onClick={() => alternar(c)}>{desab ? "Habilitar" : "Desabilitar"}</button>
              <button className="cfg-btn" disabled={ocupado === c.id} onClick={() => resetar(c)}>Resetar senha</button>
              <button className="cfg-btn perigo" onClick={() => setDesligar(c.id)}>Desligar</button>
            </div>
          </div>
        );
      })}
      {desligar ? <DesligarCorretor brokerId={desligar} onFechar={() => setDesligar(null)}
        onPronto={() => { setDesligar(null); qc.invalidateQueries({ queryKey: chave }); }} /> : null}
    </div>
  );
}

function GestorTrafego({ donoId }: { donoId: string | null }) {
  const { session } = useAuth();
  const dono = donoId ?? session?.user?.id ?? null;
  const qc = useQueryClient();
  const chave = ["cfg-gestor-trafego", dono];
  const { data: gestor, isLoading } = useQuery({
    queryKey: chave, enabled: !!dono,
    queryFn: async () => {
      const { data } = await sb.from("system_settings").select("value").eq("key", `gestor_trafego_${dono}`).maybeSingle();
      let v: any = data?.value ?? null;
      if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
      return v?.telefone ? { nome: String(v.nome || ""), telefone: String(v.telefone) } : null;
    },
  });
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(""); const [tel, setTel] = useState("");
  const salvar = async () => {
    const t = tel.replace(/\D/g, "");
    if (!nome.trim() || t.length < 10) { toast.error("Preencha o nome e o WhatsApp com DDD."); return; }
    try {
      await salvarGestor(dono!, nome.trim(), t.length <= 11 ? "55" + t : t);
      toast.success("Gestor de tráfego salvo. Os alertas dos anúncios vão para ele.");
      setEditando(false); qc.invalidateQueries({ queryKey: chave });
    } catch (e: any) { toast.error("Não consegui salvar: " + (e?.message ?? e)); }
  };
  if (!dono || isLoading) return null;
  const formulario = editando || !gestor;
  return (
    <div className={`cfg-box cfg-gestor ${gestor ? "" : "falta"}`}>
      <div>
        <h3>Gestor de tráfego</h3>
        <p>{gestor ? "Recebe os alertas da sua conta de anúncio (regra Alerta do tráfego, em Avisos e cobranças)."
          : "Ninguém cadastrado: os alertas da sua conta de anúncio não têm para quem ir. Cadastre quem cuida das suas campanhas."}</p>
      </div>
      {formulario ? (
        <div className="cfg-linha">
          <label className="cfg-sel">Nome<input id="cfg-gestor-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do gestor" /></label>
          <label className="cfg-sel">WhatsApp com DDD<input id="cfg-gestor-tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="11 99999-9999" inputMode="tel" /></label>
          <div className="cfg-pessoa-acoes">
            <button className="cfg-btn prim" onClick={salvar}>Salvar</button>
            {gestor ? <button className="cfg-btn" onClick={() => setEditando(false)}>Cancelar</button> : null}
          </div>
        </div>
      ) : (
        <div className="cfg-linha">
          <div><b>{gestor!.nome}</b> <span className="mono">{gestor!.telefone}</span></div>
          <button className="cfg-btn" onClick={() => { setNome(gestor!.nome); setTel(gestor!.telefone); setEditando(true); }}>Trocar</button>
        </div>
      )}
    </div>
  );
}

function MeuWhatsApp() {
  const { session } = useAuth();
  const eu = session?.user?.id;
  const { data: chip, refetch } = useQuery({
    queryKey: ["cfg-meu-chip", eu], enabled: !!eu, refetchInterval: 30_000,
    queryFn: async () => {
      const { data: p } = await sb.from("profiles").select("bot_instance_id").eq("id", eu).maybeSingle();
      if (!p?.bot_instance_id) return null;
      const { data: b } = await sb.from("bot_instances").select("id, name, phone, real_state, status, last_message_at").eq("id", p.bot_instance_id).maybeSingle();
      return b ?? { id: p.bot_instance_id, name: null, phone: null, real_state: null };
    },
  });
  const [qr, setQr] = useState<string | null>(null);
  const [estado, setEstado] = useState<"parado" | "gerando" | "esperando" | "conectado" | "erro">("parado");
  const [erro, setErro] = useState<string | null>(null);
  const conectado = chip?.real_state === "open" || estado === "conectado";

  // enquanto o QR está na tela, confere a cada 5 s se já leu
  useEffect(() => {
    if (estado !== "esperando" || !chip?.id) return;
    const t = setInterval(async () => {
      const { data } = await supabase.functions.invoke("get-whatsapp-qr", { body: { botInstanceId: chip.id } });
      if ((data as any)?.connected) { setEstado("conectado"); setQr(null); refetch(); }
      else if ((data as any)?.base64) setQr((data as any).base64);
    }, 5000);
    return () => clearInterval(t);
  }, [estado, chip?.id, refetch]);

  const gerarQr = async () => {
    if (!chip?.id) return;
    setEstado("gerando"); setErro(null);
    const { data, error } = await supabase.functions.invoke("get-whatsapp-qr", { body: { botInstanceId: chip.id, forceQR: true } });
    const d = data as any;
    if (d?.connected) { setEstado("conectado"); refetch(); return; }
    if (d?.base64) { setQr(d.base64); setEstado("esperando"); return; }
    setEstado("erro"); setErro(d?.error_detail || d?.error || error?.message || "Não consegui gerar o QR agora. Tente de novo em 1 minuto.");
  };

  if (chip === undefined) return <p className="cfg-dica">Carregando…</p>;
  if (chip === null) return (
    <div className="cfg-box">
      <h3>Você ainda não tem um WhatsApp ligado ao Comandra</h3>
      <p>Peça ao administrador para criar o seu chip. Enquanto isso, as mensagens assinadas por você ficam prontas em Avisos e cobranças para você enviar do seu celular.</p>
    </div>
  );
  return (
    <div className="cfg-box">
      <div className="cfg-chip">
        <span className={`cfg-pip ${conectado ? "ok" : "off"}`} />
        <div>
          <h3>{conectado ? "Conectado" : "Desconectado"}{chip.phone ? <span className="mono"> · {chip.phone}</span> : null}</h3>
          <p>{conectado
            ? "As mensagens assinadas por você e as cobranças da sua equipe saem por este número."
            : "Sem o chip, as mensagens assinadas por você ficam prontas em Avisos e cobranças, e as cobranças da equipe saem pelo número do superintendente ou do Junior."}</p>
        </div>
      </div>
      {!conectado ? (
        <div className="cfg-qr">
          {qr ? (
            <>
              <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR Code para conectar o WhatsApp" />
              <ol>
                <li>Abra o WhatsApp no celular deste número.</li>
                <li>Toque em <b>Configurações → Aparelhos conectados → Conectar um aparelho</b>.</li>
                <li>Aponte a câmera para o QR. A tela muda sozinha quando conectar.</li>
              </ol>
            </>
          ) : (
            <button className="cfg-btn prim" onClick={gerarQr} disabled={estado === "gerando"}>
              {estado === "gerando" ? "Gerando o QR…" : "Conectar meu WhatsApp"}
            </button>
          )}
          {erro ? <p className="cfg-erro">{erro}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Página do gerente: /manager/config, com o menu lateral. */
export function ConfiguracoesGerente() {
  const { mode, toggle } = useTheme();
  const { session } = useAuth();
  useEffect(loadFonts, []);
  return (
    <div className="mgr10 app2">
      <RailV10 atual="config" mode={mode} toggle={toggle} />
      <main className="shell2"><div className="sup-wrap"><Configuracoes nivel="gerente" donoId={session?.user?.id ?? null} /></div></main>
    </div>
  );
}

const CSS = `
.mgr10 .cfg{display:grid;gap:var(--s3);padding-block:var(--s3) var(--s5)}
.mgr10 .cfg-top h1{font-size:28px}
.mgr10 .cfg-top p{color:var(--ink-2);margin-top:4px}
.mgr10 .cfg-tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}
.mgr10 .cfg-tabs button{display:grid;gap:2px;text-align:left;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--card)}
.mgr10 .cfg-tabs button b{font-size:14.5px}
.mgr10 .cfg-tabs button span{font-size:12.5px;color:var(--ink-3)}
.mgr10 .cfg-tabs button.on{border-color:var(--blue);background:var(--blue-air)}
.mgr10 .cfg-tabs button.on b{color:var(--blue)}
.mgr10 .cfg-corpo .rg{padding-top:0}
.mgr10 .cfg-corpo .rg-top{display:none}
.mgr10 .cfg-equipe{display:grid;gap:var(--s2)}
.mgr10 .cfg-linha{display:flex;flex-wrap:wrap;gap:12px;align-items:end;justify-content:space-between}
.mgr10 .cfg-sel{display:grid;gap:6px;font-size:13px;font-weight:600;color:var(--ink-2)}
.mgr10 .cfg-sel select{font:inherit;font-weight:400;color:var(--ink);background:var(--sunk);border:1px solid var(--line);border-radius:9px;padding:7px 10px;min-width:220px}
.mgr10 .cfg-dica{color:var(--ink-2);font-size:13.5px;max-width:62ch}
.mgr10 .cfg-btn{font-size:13.5px;font-weight:600;padding:9px 16px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
.mgr10 .cfg-btn.prim{background:var(--blue);border-color:var(--blue);color:#fff}
.mgr10 .cfg-btn:disabled{opacity:.5;cursor:default}
.mgr10 .cfg-box{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:var(--s3);display:grid;gap:var(--s2);max-width:760px}
.mgr10 .cfg-box h3{font-size:18px}
.mgr10 .cfg-box p{color:var(--ink-2);font-size:14px;margin-top:4px}
.mgr10 .cfg-chip{display:flex;gap:14px;align-items:flex-start}
.mgr10 .cfg-pip{width:12px;height:12px;border-radius:50%;margin-top:7px;flex-shrink:0}
.mgr10 .cfg-pip.ok{background:var(--good);box-shadow:0 0 0 4px var(--good-air)}
.mgr10 .cfg-pip.off{background:var(--red);box-shadow:0 0 0 4px var(--red-air)}
.mgr10 .cfg-qr{display:flex;flex-wrap:wrap;gap:var(--s3);align-items:center}
.mgr10 .cfg-qr img{width:240px;max-width:100%;aspect-ratio:1;background:#fff;border-radius:12px;padding:8px}
.mgr10 .cfg-qr ol{margin:0;padding-left:20px;display:grid;gap:6px;font-size:14px;color:var(--ink-2);max-width:340px}
.mgr10 .cfg-lista{background:var(--card);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.mgr10 .cfg-lista-h{display:flex;gap:12px;align-items:baseline;padding:12px var(--s2);border-bottom:1px solid var(--hair);font-size:14px}
.mgr10 .cfg-lista-h span{color:var(--ink-3);font-size:13px}
.mgr10 .cfg-pessoa{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px 14px;align-items:center;padding:12px var(--s2);border-top:1px solid var(--hair)}
.mgr10 .cfg-pessoa:first-of-type{border-top:0}
.mgr10 .cfg-pessoa.desab .cfg-pessoa-b{opacity:.6}
.mgr10 .cfg-pessoa-b{display:grid;min-width:0}
.mgr10 .cfg-pessoa-b span{font-size:12.5px;color:var(--ink-3);overflow-wrap:anywhere}
.mgr10 .cfg-pessoa-acoes{display:flex;gap:6px;flex-wrap:wrap}
.mgr10 .cfg-tag{font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:999px;white-space:nowrap}
.mgr10 .cfg-tag.ok{color:var(--good);background:var(--good-air)}
.mgr10 .cfg-tag.off{color:var(--amber);background:var(--amber-air)}
.mgr10 .cfg-btn.perigo{color:var(--red);border-color:color-mix(in srgb,var(--red) 35%,var(--line))}
@media(max-width:700px){.mgr10 .cfg-pessoa{grid-template-columns:minmax(0,1fr) auto}.mgr10 .cfg-pessoa-acoes{grid-column:1/-1}}
.mgr10 .cfg-gestor{margin-bottom:var(--s3);max-width:none}
.mgr10 .cfg-gestor.falta{border-color:color-mix(in srgb,var(--amber) 45%,var(--line));background:var(--amber-air)}
.mgr10 .cfg-sel input{font:inherit;font-weight:400;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:9px;padding:7px 10px;min-width:200px}
.mgr10 .cfg-erro{color:var(--red);font-size:13px;font-weight:600}
.mgr10 .cfg .integ-shell button.border{border-width:1px;border-style:solid}
.mgr10 .cfg .integ-shell button.bg-blue-600{background:#2563eb;color:#fff}
.mgr10 .cfg .integ-shell button:disabled{opacity:.5;cursor:default}
`;
