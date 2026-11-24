// Brinde de lead: ao abrir o Comandra, o corretor ganha até 2 leads/dia do
// backlog de represados (mais novos primeiro), sem plantão nem equipe.
// RPCs brinde_status / brinde_pegar. Aparece uma vez por sessão (se fechar, não repete).
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export default function BrindeLead({ uid }: { uid?: string }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [resta, setResta] = useState(0);
  const [pegando, setPegando] = useState(false);
  const [ganho, setGanho] = useState<{ nome: string; regiao: string; codigo: string } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let vivo = true;
    (async () => {
      try { if (sessionStorage.getItem("brinde_fechado") === "1") return; } catch { /* ok */ }
      const { data } = await sb.rpc("brinde_status");
      if (!vivo || !data) return;
      if ((data.resta ?? 0) > 0 && (data.estoque ?? 0) > 0) { setResta(data.resta); setAberto(true); }
    })();
    return () => { vivo = false; };
  }, [uid]);

  function fechar() {
    setAberto(false);
    try { sessionStorage.setItem("brinde_fechado", "1"); } catch { /* ok */ }
  }

  async function pegar() {
    setPegando(true);
    const { data, error } = await sb.rpc("brinde_pegar");
    setPegando(false);
    if (error) { toast.error(error.message); return; }
    if (!data?.ok) {
      if (data?.motivo === "sem_estoque") toast("Os brindes de hoje acabaram. Volta amanhã! 🎁");
      setResta(data?.resta ?? 0);
      if (data?.motivo === "limite") fechar();
      return;
    }
    setGanho({ nome: data.nome || "Cliente novo", regiao: data.regiao || "", codigo: data.codigo });
    setResta(data.resta ?? 0);
    qc.invalidateQueries();
  }

  if (!aberto) return null;
  return (
    <div className="brinde-ov" role="dialog" aria-modal="true" aria-label="Lead de brinde">
      <style>{`
        .brinde-ov{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;
          padding:max(20px,env(safe-area-inset-top)) 18px;background:rgba(8,14,26,.55);backdrop-filter:blur(3px)}
        .brinde-card{width:100%;max-width:360px;border-radius:22px;padding:26px 22px 20px;text-align:center;
          background:#fff;color:#0f1b2d;box-shadow:0 20px 60px rgba(8,14,26,.4);position:relative;overflow:hidden;
          animation:brinde-pop .32s cubic-bezier(.2,1.3,.4,1)}
        .brinde-card::before{content:"";position:absolute;inset:0 0 auto;height:92px;
          background:linear-gradient(135deg,#0f766e,#2563c9)}
        @media (prefers-color-scheme:dark){.brinde-card{background:#121d31;color:#eaf0f8}}
        @keyframes brinde-pop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}
        .brinde-ic{position:relative;font-size:46px;line-height:1;margin:6px 0 10px;filter:drop-shadow(0 6px 14px rgba(0,0,0,.3))}
        .brinde-card h2{position:relative;font:800 21px Archivo,system-ui,sans-serif;margin:0 0 6px}
        .brinde-card p{font-size:14px;line-height:1.5;color:#475268;margin:0 0 16px}
        @media (prefers-color-scheme:dark){.brinde-card p{color:#a7b4ca}}
        .brinde-lead{background:rgba(15,118,110,.09);border:1px solid rgba(15,118,110,.25);border-radius:14px;
          padding:13px;margin:4px 0 12px;display:flex;flex-direction:column;gap:3px}
        .brinde-lead b{font:700 17px Archivo,system-ui;color:inherit}
        .brinde-lead span{font-size:13px;color:#64748b}
        .brinde-dica{font-size:13px}
        .brinde-go{display:block;width:100%;border:0;border-radius:12px;padding:14px;cursor:pointer;
          font:800 16px Archivo,system-ui;color:#fff;background:linear-gradient(135deg,#0f766e,#2563c9);text-decoration:none}
        .brinde-go:disabled{opacity:.6}
        .brinde-x,.brinde-x2{display:block;width:100%;background:none;border:0;cursor:pointer;padding:12px 0 2px;
          font:600 14px system-ui;color:#8793a6}
        .brinde-x2{color:#0f766e;font-weight:700}
        @media (prefers-color-scheme:dark){.brinde-x2{color:#2dd4bf}}
      `}</style>
      <div className="brinde-card">
        {!ganho ? (
          <>
            <div className="brinde-ic">🎁</div>
            <h2>Presente por entrar!</h2>
            <p>Você tem <b>{resta}</b> lead{resta > 1 ? "s" : ""} de brinde esperando. É seu agora — sem fila, sem plantão.</p>
            <button className="brinde-go" disabled={pegando} onClick={pegar}>{pegando ? "Pegando…" : "Pegar meu lead 🎉"}</button>
            <button className="brinde-x" onClick={fechar}>Agora não</button>
          </>
        ) : (
          <>
            <div className="brinde-ic">🎉</div>
            <h2>É seu!</h2>
            <div className="brinde-lead"><b>{ganho.nome}</b>{ganho.regiao ? <span>📍 {ganho.regiao}</span> : null}</div>
            <p className="brinde-dica">Já está na sua lista de clientes. Chama agora, enquanto está fresco!</p>
            <a className="brinde-go" href={`/l/${ganho.codigo}`}>Falar com o cliente</a>
            {resta > 0
              ? <button className="brinde-x2" onClick={() => setGanho(null)}>Pegar mais 1 (resta {resta})</button>
              : <button className="brinde-x" onClick={fechar}>Fechar</button>}
          </>
        )}
      </div>
    </div>
  );
}
