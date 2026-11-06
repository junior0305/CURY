// Check-in de plantão do corretor (06/11, protótipo https://claude.ai/artifact/3fXsuS6dy3QPiVzsZq1vZQ).
// Escolhe o plantão (mais perto primeiro) → "Cheguei no plantão" liga a roleta. Conferências 9h30 e 16h,
// "Em visita" (até 2h) e "Saí". Plantão fora da lista: o corretor digita o nome e o gerente aprova.
// Serve o celular (PainelCorretor) e o computador (CorretorPainel), cada um com as próprias classes.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pegarLocal, distTxt, horaTxt, motivoTxt, erroTxt, confTxt, type Local, type ConfDia } from "@/lib/plantao";
import type { ClassesTarefa } from "./TarefasLead";

type Dia = {
  situacao: "sem_checkin" | "roleta" | "visita" | "fora" | "saiu"; plantao: { nome: string; status: string } | null;
  checkin_em: string | null; checkin_dist_m: number | null; visita_desde: string | null;
  conferencia_pendente: { qual: string; ate: string } | null; c930: ConfDia; c16: ConfDia;
};
type Perto = { id: string; nome: string; endereco: string | null; dist: number | null; status: string; equipe: string | null };

const coluna = { display: "grid", gap: 8 } as const;
const fila = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } as const;

export default function PlantaoCheckin({ uid, c }: { uid: string; c: ClassesTarefa }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [local, setLocal] = useState<(Local & { em: number }) | null>(null);
  const [lista, setLista] = useState<Perto[] | null>(null);
  const [escolhido, setEscolhido] = useState<string>("");
  const [novo, setNovo] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [aviso, setAviso] = useState("");
  const [agora, setAgora] = useState(Date.now());

  const { data: dia, isError } = useQuery<Dia>({
    queryKey: ["plantaoDia", uid], enabled: !!uid, refetchInterval: 60_000, refetchOnWindowFocus: true,
    queryFn: async () => { const { data, error } = await (supabase as any).rpc("plantao_meu_dia"); if (error) throw error; return data; },
  });
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const atualizar = () => qc.invalidateQueries({ queryKey: ["plantaoDia", uid] });

  // localização recente (até 2 min) vale para o check-in logo depois de abrir a lista
  const localAgora = async () => {
    if (local && Date.now() - local.em < 120_000) return local;
    const l = await pegarLocal(); const v = { ...l, em: Date.now() }; setLocal(v); return v;
  };
  const rodar = async (chave: string, f: () => Promise<void>) => {
    if (ocupado) return; setOcupado(chave); setAviso("");
    try { await f(); } catch (e: any) { setAviso(erroTxt(e)); } finally { setOcupado(null); }
  };

  const abrirLista = () => rodar("lista", async () => {
    const l = await localAgora();
    const { data, error } = await (supabase as any).rpc("plantoes_perto", { p_lat: l.lat, p_lng: l.lng });
    if (error) throw error;
    const ps = (data || []) as Perto[]; setLista(ps); setEscolhido(ps[0]?.id || "");
  });
  const fazerCheckin = () => rodar("checkin", async () => {
    if (!escolhido) { setAviso("Escolha o plantão onde você está."); return; }
    const l = await localAgora();
    const { data, error } = await (supabase as any).rpc("plantao_checkin", { p_plantao: escolhido, p_lat: l.lat, p_lng: l.lng, p_prec: l.prec });
    if (error) throw error;
    if (!data?.ok) { setAviso(motivoTxt(data)); setLocal(null); return; }
    toast.success(`Check-in no ${data.plantao} · você está na roleta`); setLista(null); atualizar();
  });
  const fazerNovo = () => rodar("novo", async () => {
    if (!nomeNovo.trim()) { setAviso("Escreva o nome do plantão."); return; }
    const l = await localAgora();
    const { data, error } = await (supabase as any).rpc("plantao_novo", { p_nome: nomeNovo.trim(), p_lat: l.lat, p_lng: l.lng, p_prec: l.prec });
    if (error) throw error;
    if (!data?.ok) { setAviso(motivoTxt(data)); return; }
    toast.success("Check-in feito · seu gerente vai aprovar o plantão novo"); setNovo(false); setNomeNovo(""); setLista(null); atualizar();
  });
  const conferir = () => rodar("conferir", async () => {
    setLocal(null);
    const l = await pegarLocal();
    const { data, error } = await (supabase as any).rpc("plantao_conferir", { p_lat: l.lat, p_lng: l.lng, p_prec: l.prec });
    if (error) throw error;
    if (!data?.ok) { setAviso(motivoTxt(data)); atualizar(); return; }
    toast.success("Conferido · você segue na roleta"); atualizar();
  });
  const simples = (fn: "plantao_visita" | "plantao_saida", msg: string) => rodar(fn, async () => {
    const { error } = await (supabase as any).rpc(fn); if (error) throw error; toast.success(msg); atualizar();
  });

  if (!uid || isError || !dia) return null;
  const pend = dia.conferencia_pendente;
  const restaMin = pend ? Math.max(0, Math.ceil((Date.parse(pend.ate) - agora) / 60000)) : 0;
  const nomeP = dia.plantao?.nome || "plantão";

  const escolher = (
    <div style={coluna}>
      {!lista ? <button className={c.pri} type="button" onClick={abrirLista} disabled={!!ocupado}>{ocupado === "lista" ? "Pegando sua localização…" : "Ver plantões perto de mim"}</button> : <>
        <span className={c.meta}>Em qual plantão você está? Mais perto primeiro.</span>
        {lista.slice(0, 6).map((p) => (
          <button key={p.id} type="button" className={c.btn} onClick={() => setEscolhido(p.id)} aria-pressed={escolhido === p.id}
            style={{ display: "flex", justifyContent: "space-between", gap: 8, textAlign: "left", outline: escolhido === p.id ? "2px solid #2BB5A0" : undefined }}>
            <span><b>{p.nome}</b>{p.status === "pendente" ? " · aguardando o gerente" : ""}{p.endereco ? <><br /><small>{p.endereco}</small></> : null}</span>
            <span>{distTxt(p.dist)}</span>
          </button>))}
        <button className={c.pri} type="button" onClick={fazerCheckin} disabled={!!ocupado || !escolhido}>{ocupado === "checkin" ? "Conferindo…" : "Cheguei no plantão"}</button>
        {!novo ? <button className={c.btn} type="button" onClick={() => setNovo(true)}>Meu plantão não está na lista</button> : (
          <div style={coluna}>
            <input className={c.inp} placeholder="Nome do plantão (ex.: Plantão Tikoá Penha)" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} aria-label="Nome do plantão" />
            <div style={fila}>
              <button className={c.pri} type="button" onClick={fazerNovo} disabled={!!ocupado}>{ocupado === "novo" ? "Conferindo…" : "Fazer check-in aqui"}</button>
              <button className={c.btn} type="button" onClick={() => setNovo(false)}>Cancelar</button>
            </div>
            <span className={c.meta}>A roleta liga agora e seu gerente aprova o plantão. O Comandra grava onde você está.</span>
          </div>)}
      </>}
    </div>
  );

  return (
    <div style={coluna} aria-label="Plantão de hoje">
      <span className={c.titulo}>Plantão de hoje</span>
      {pend && (dia.situacao === "roleta" || dia.situacao === "visita") ? <>
        <b>Conferência das {pend.qual}: confirme que você está no {nomeP}</b>
        <span className={c.meta}>{restaMin > 0 ? `Faltam ${restaMin} min. Sem resposta você sai da roleta.` : "O prazo acabou. Confirme para voltar."}</span>
        <div style={fila}>
          <button className={c.pri} type="button" onClick={conferir} disabled={!!ocupado}>{ocupado === "conferir" ? "Conferindo…" : "Estou no plantão"}</button>
          <button className={c.btn} type="button" onClick={() => simples("plantao_visita", "Em visita · você segue na roleta por até 2h")} disabled={!!ocupado}>Estou em visita com cliente</button>
        </div>
      </> : dia.situacao === "roleta" ? <>
        <b>✅ Você está na roleta · {nomeP}</b>
        <span className={c.meta}>Check-in às {horaTxt(dia.checkin_em)}{dia.checkin_dist_m != null ? `, a ${distTxt(dia.checkin_dist_m)}` : ""}{dia.plantao?.status === "pendente" ? " · plantão aguardando o gerente" : ""}</span>
        <span className={c.meta}>Conferência 9h30: {confTxt(dia.c930)} · 16h: {confTxt(dia.c16)}</span>
        <div style={fila}>
          <button className={c.btn} type="button" onClick={() => simples("plantao_visita", "Em visita · você segue na roleta por até 2h")} disabled={!!ocupado}>Estou em visita com cliente</button>
          <button className={c.btn} type="button" onClick={() => simples("plantao_saida", "Você saiu da roleta")} disabled={!!ocupado}>Saí do plantão</button>
        </div>
      </> : dia.situacao === "visita" ? <>
        <b>🚗 Em visita com cliente desde {horaTxt(dia.visita_desde)}</b>
        <span className={c.meta}>Você segue na roleta. Em 2h volta ao normal; ao voltar ao {nomeP}, confirme.</span>
        <div style={fila}>
          <button className={c.pri} type="button" onClick={conferir} disabled={!!ocupado}>{ocupado === "conferir" ? "Conferindo…" : "Voltei ao plantão"}</button>
          <button className={c.btn} type="button" onClick={() => simples("plantao_saida", "Você saiu da roleta")} disabled={!!ocupado}>Saí do plantão</button>
        </div>
      </> : dia.situacao === "fora" ? <>
        <b>⚠️ Você saiu da roleta</b>
        <span className={c.meta}>A conferência no {nomeP} não passou (ou seu gerente marcou). Volte ao plantão e confirme.</span>
        <div style={fila}>
          <button className={c.pri} type="button" onClick={conferir} disabled={!!ocupado}>{ocupado === "conferir" ? "Conferindo…" : "Conferir de novo"}</button>
          <button className={c.btn} type="button" onClick={() => simples("plantao_visita", "Em visita · você voltou para a roleta por até 2h")} disabled={!!ocupado}>Estou em visita com cliente</button>
        </div>
        <span className={c.meta}>Não funcionou? Peça ao seu gerente para confirmar você.</span>
      </> : <>
        <b>{dia.situacao === "saiu" ? "Você saiu do plantão" : "Você ainda não fez check-in hoje"}</b>
        <span className={c.meta}>Sem check-in você não entra na roleta e não recebe cliente novo.</span>
        {escolher}
      </>}
      {aviso && <span className={c.meta} role="alert" style={{ color: "#E5654B", fontWeight: 600 }}>{aviso}</span>}
      <span className={c.meta}>A localização só é lida quando você toca: no check-in e nas conferências das 9h30 e 16h.</span>
    </div>
  );
}
