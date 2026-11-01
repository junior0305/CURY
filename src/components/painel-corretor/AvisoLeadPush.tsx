// Cartão "Ligar aviso de cliente nova" (Web Push, 01/11). Usado no painel do celular e no do notebook.
// Usa as variáveis --surface/--border/--text/--muted/--accent, que existem nos dois painéis.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { estadoPush, ativarPush, manterPush, type EstadoPush } from "@/lib/pushLead";
import { supabase } from "@/integrations/supabase/client";

const CHAVE = "pc_push_adiado";

export default function AvisoLeadPush({ uid, sempre }: { uid: string; sempre?: boolean }) {
  const [est, setEst] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [adiado, setAdiado] = useState(() => { try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now(); } catch { return false; } });
  useEffect(() => { estadoPush().then(setEst).catch(() => setEst("sem_suporte")); manterPush(); }, []);
  if (!est || !uid) return null;
  if (!sempre && (est === "ativo" || adiado)) return null;

  const ligar = async () => {
    setOcupado(true);
    try {
      const r = await ativarPush(uid);
      setEst(r);
      if (r === "ativo") toast.success("Aviso ligado 🔔 Mandamos uma notificação de teste agora.");
      else if (r === "negado") toast.error("O navegador bloqueou as notificações. Veja como liberar abaixo.");
    } catch { toast.error("Não consegui ligar o aviso neste aparelho. Tente de novo."); }
    finally { setOcupado(false); }
  };
  const testar = async () => {
    const { error } = await supabase.functions.invoke("push-lead", { body: { teste: true } });
    if (error) toast.error("Não consegui mandar o teste."); else toast.success("Teste enviado. Deve chegar em alguns segundos.");
  };
  const adiar = () => { try { localStorage.setItem(CHAVE, String(Date.now() + 3 * 864e5)); } catch { /* */ } setAdiado(true); };

  const caixa: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 14, padding: 12, display: "grid", gap: 8, color: "var(--text)" };
  const txt: React.CSSProperties = { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, margin: 0 };
  const btn: React.CSSProperties = { border: 0, borderRadius: 10, padding: "9px 12px", fontWeight: 700, fontSize: 13.5, background: "var(--accent)", color: "var(--tealink, #fff)", cursor: "pointer" };
  const btn2: React.CSSProperties = { ...btn, background: "transparent", color: "var(--muted)", border: "1px solid var(--border)" };

  return (
    <div style={caixa} role="region" aria-label="Aviso de cliente nova">
      <b style={{ fontSize: 14 }}>🔔 {est === "ativo" ? "Aviso de cliente nova ligado neste aparelho" : "Saiba na hora quando chegar cliente nova"}</b>
      {est === "ativo" && <p style={txt}>Toca e aparece na tela mesmo com o Comandra fechado.</p>}
      {est === "desligado" && <p style={txt}>O celular toca e mostra a notificação mesmo com o Comandra fechado. É só permitir uma vez.</p>}
      {est === "instalar" && <p style={txt}>No iPhone, o aviso só funciona com o Comandra na tela de início: toque em <b>Compartilhar</b> (o quadrado com a seta) → <b>Adicionar à Tela de Início</b>. Depois abra o Comandra pelo ícone e ligue o aviso aqui.</p>}
      {est === "negado" && <p style={txt}>As notificações estão bloqueadas neste navegador. Libere em: cadeado ao lado do endereço (ou Configurações do celular) → <b>Notificações</b> → <b>Permitir</b>. Depois volte aqui.</p>}
      {est === "sem_suporte" && <p style={txt}>Este navegador não recebe notificação. No Android, abra o Comandra pelo <b>Chrome</b>.</p>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {est === "desligado" && <button type="button" style={btn} onClick={ligar} disabled={ocupado}>{ocupado ? "Ligando…" : "Ligar aviso"}</button>}
        {est === "ativo" && <button type="button" style={btn2} onClick={testar}>Testar agora</button>}
        {est === "negado" && <button type="button" style={btn2} onClick={() => estadoPush().then(setEst)}>Já liberei</button>}
        {!sempre && est !== "ativo" && <button type="button" style={btn2} onClick={adiar}>Agora não</button>}
      </div>
    </div>
  );
}
