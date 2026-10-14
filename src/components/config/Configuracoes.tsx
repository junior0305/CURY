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
import EquipeLista from "@/components/manager-v10/EquipeLista";
import CadastrarCorretor from "@/components/manager-v10/CadastrarCorretor";
import VincularNomes from "@/components/manager-v10/VincularNomes";
import IntegracaoFacebook from "@/pages/admin/IntegracaoFacebook";
import "@/styles/manager-v10.css";

type Nivel = "diretor" | "super" | "gerente";
type Secao = "avisos" | "equipe" | "whatsapp" | "facebook";
const SECOES: { k: Secao; label: string; sub: string }[] = [
  { k: "avisos", label: "Avisos e cobranças", sub: "O que o sistema cobra e quando" },
  { k: "equipe", label: "Equipe", sub: "Cadastrar, desligar, ligar nomes do plantão" },
  { k: "whatsapp", label: "Meu WhatsApp", sub: "O chip que envia as suas mensagens" },
  { k: "facebook", label: "Facebook e leads", sub: "Páginas, formulários e quem recebe" },
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
  const secoes = SECOES.filter((s) => !(s.k === "facebook" && nivel === "diretor"));

  return (
    <div className="cfg">
      <style>{CSS}</style>
      <header className="cfg-top">
        <h1>Configurações</h1>
        <p>O que você ajusta uma vez e o sistema segue fazendo.</p>
      </header>
      <nav className="cfg-tabs" aria-label="Seções das configurações">
        {secoes.map((s) => (
          <button key={s.k} className={secao === s.k ? "on" : ""} onClick={() => ir(s.k)}>
            <b>{s.label}</b><span>{s.sub}</span>
          </button>
        ))}
      </nav>
      <section className="cfg-corpo">
        {secao === "avisos" ? <ReguaEquipe nivel={nivel} donoId={donoId} />
          : secao === "equipe" ? <Equipe nivel={nivel} donoId={donoId} />
          : secao === "whatsapp" ? <MeuWhatsApp />
          : <div className="integ-shell"><IntegracaoFacebook /></div>}
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
        ) : <p className="cfg-dica">Corretores da sua equipe. Desligar separa a carteira do corretor; resetar volta a senha para a provisória.</p>}
        <button className="cfg-btn prim" onClick={() => setCadastrar(true)} disabled={!managerId}>+ Cadastrar corretor</button>
      </div>
      {managerId ? <EquipeLista managerId={managerId} /> : null}
      {managerId ? <VincularNomes managerId={managerId} /> : null}
      {cadastrar && managerId ? (
        <CadastrarCorretor managerId={managerId} gerentes={nivel === "gerente" ? undefined : gerentes}
          onFechar={() => setCadastrar(false)}
          onPronto={() => { setCadastrar(false); qc.invalidateQueries({ queryKey: ["equipe-lista"] }); }} />
      ) : null}
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
.mgr10 .cfg-erro{color:var(--red);font-size:13px;font-weight:600}
.mgr10 .cfg .integ-shell button.border{border-width:1px;border-style:solid}
.mgr10 .cfg .integ-shell button.bg-blue-600{background:#2563eb;color:#fff}
.mgr10 .cfg .integ-shell button:disabled{opacity:.5;cursor:default}
`;
