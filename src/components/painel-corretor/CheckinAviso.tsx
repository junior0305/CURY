// Aviso que abre por cima do painel quando o corretor está sem check-in (06/11, Junior): das 7h às 20h, ao abrir o
// Comandra. Não trava o corretor: "Hoje não estou no plantão" não pergunta mais no dia e "Lembrar em 30 min" fecha.
// Pedido de liberação vencido (1 hora sem resposta) abre de novo e só sai pedindo outra vez ou dizendo que não está no plantão.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PlantaoCheckin from "./PlantaoCheckin";
import type { ClassesTarefa } from "./TarefasLead";
import { diaSP } from "./util";

const K_DIA = "pc_checkin_nao_hoje", K_ADIA = "pc_checkin_adiar";
const ler = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };
const noHorario = () => { const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" })); return h >= 7 && h < 20; };

export default function CheckinAviso({ uid, c, fundo = "var(--surface, #fff)" }: { uid: string; c: ClassesTarefa; fundo?: string }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const { data: dia } = useQuery<any>({
    queryKey: ["plantaoDia", uid], enabled: !!uid, refetchInterval: 60_000, refetchOnWindowFocus: true,
    queryFn: async () => { const { data, error } = await (supabase as any).rpc("plantao_meu_dia"); if (error) throw error; return data; },
  });
  const { data: souCorretor } = useQuery<boolean>({
    queryKey: ["souCorretor", uid], enabled: !!uid, staleTime: 3600_000,
    queryFn: async () => { const { data } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle(); return data?.role === "BROKER"; },
  });

  const sit: string | undefined = dia?.situacao;
  const vencido = sit === "vencido";
  const semCheckin = sit === "sem_checkin" || sit === "saiu";
  const naoHoje = ler(K_DIA) === diaSP(agora);
  const adiado = Number(ler(K_ADIA) || 0) > agora;
  if (!uid || !souCorretor || !noHorario() || !(semCheckin || vencido) || naoHoje || (adiado && !vencido)) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Check-in do plantão"
      style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(5,12,24,.62)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: fundo, color: "var(--text, #12233A)", borderRadius: 18, padding: 18, width: "min(440px, 100%)", maxHeight: "90vh", overflowY: "auto",
        display: "grid", gap: 12, boxShadow: "0 18px 50px rgba(0,0,0,.4)", fontFamily: "Inter, system-ui, sans-serif" }}>
        <b style={{ fontSize: 19 }}>{vencido ? "⏰ Seu pedido de liberação venceu" : "📍 Você ainda não fez check-in hoje"}</b>
        <span style={{ fontSize: 14, lineHeight: 1.45, color: "var(--muted, #55657A)" }}>
          {vencido ? "Ninguém respondeu em 1 hora. Faça o check-in ou peça a liberação de novo para entrar na roleta."
            : "Sem check-in você não entra na roleta e não recebe cliente novo. Quem chega primeiro recebe primeiro."}
        </span>
        <PlantaoCheckin uid={uid} c={c} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className={c.btn} onClick={() => { gravar(K_DIA, diaSP(Date.now())); setAgora(Date.now()); }}>Hoje não estou no plantão</button>
          {!vencido && <button type="button" className={c.btn} onClick={() => { gravar(K_ADIA, String(Date.now() + 30 * 60_000)); setAgora(Date.now()); }}>Lembrar em 30 min</button>}
        </div>
      </div>
    </div>
  );
}
