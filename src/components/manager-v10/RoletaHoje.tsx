/* Painel fixo do gerente (topo das abas Tempo real e Time): as duas coisas que ele faz toda hora.
 *  1. Roleta — quem recebe lead agora. Sempre visível, mesmo sem ninguém ter batido ponto no C2S.
 *     O robô do plantão (/root/c2s/rodizio_plantao.py, a cada 30 min) liga quem bateu ponto; o que
 *     o gerente decide aqui (ligar ou desligar) vale até a meia-noite e o robô respeita.
 *  2. Leads de hoje — o que chegou hoje, há quanto tempo, se alguém atendeu; Cobrar e Passar
 *     para outro corretor (a redistribuição é sempre decisão do gerente, nunca automática). */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { definirRecebimento } from "@/hooks/useTempoReal";
import { cobrarCorretor, redistribuir } from "@/hooks/useLeads";
import { buscarPlantao } from "@/utils/c2sMatching";
import { chaveNome, chaveGerente, gerenteC2S } from "@/hooks/useDiretoria";
import "@/styles/roleta.css";

type Corretor = { id: string; nome: string; on: boolean; fonte: string | null; online: boolean; plantao: boolean };
type Lead = { id: string; nome: string; brokerId: string | null; corretor: string; min: number; estado: "sem" | "respondeu" | "ok"; origem: string };

const diaSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const tempo = (m: number) => (m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${Math.floor(m / 1440)} d`);

function useRoleta(managerId: string) {
  return useQuery({
    queryKey: ["roleta-hoje", managerId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const hoje = diaSP();
      const [{ data: ger }, { data: bs }, plantao] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("id", managerId).maybeSingle(),
        supabase.from("profiles").select("id,first_name,last_name,last_seen_at,lead_assignment_enabled,lead_assignment_source,lead_assignment_date")
          .eq("manager_id", managerId).eq("role", "BROKER").eq("is_active", true).order("first_name"),
        buscarPlantao(`${hoje}T03:00:00Z`).catch(() => []),
      ]);
      const kg = chaveGerente((ger as any)?.first_name);
      const noPlantao = new Set(plantao.filter((r) => r.created_at?.slice(0, 10) >= hoje && chaveGerente(gerenteC2S(r.gerente)) === kg).map((r) => chaveNome(r.corretor)));
      const corretores: Corretor[] = ((bs ?? []) as any[]).map((b) => ({
        id: b.id, nome: [b.first_name, b.last_name].filter(Boolean).join(" ").trim() || "—",
        on: b.lead_assignment_enabled !== false,
        fonte: b.lead_assignment_date === hoje ? b.lead_assignment_source : null,
        online: !!b.last_seen_at && Date.now() - new Date(b.last_seen_at).getTime() < 15 * 60_000,
        plantao: noPlantao.has(chaveNome(b.first_name)) || noPlantao.has(chaveNome(`${b.first_name}${b.last_name ?? ""}`)),
      }));
      const nomes = new Map(corretores.map((c) => [c.id, c.nome.split(" ")[0]]));
      const { data: ls } = await supabase.from("leads")
        .select("id,name,phone,broker_id,status,created_at,welcome_responded_at,last_lead_response_at,source,fb_campaign")
        .eq("manager_id", managerId).gte("created_at", `${hoje}T03:00:00Z`).neq("status", "EXCLUDED")
        .order("created_at", { ascending: false }).limit(200);
      const leads: Lead[] = ((ls ?? []) as any[]).map((l) => {
        const respondeu = !!(l.welcome_responded_at || l.last_lead_response_at);
        return { id: l.id, nome: l.name || l.phone || "Sem nome", brokerId: l.broker_id, corretor: l.broker_id ? nomes.get(l.broker_id) ?? "outro corretor" : "sem corretor",
          min: Math.max(0, Math.round((Date.now() - new Date(l.created_at).getTime()) / 60_000)),
          estado: l.status !== "NEW" ? "ok" : respondeu ? "respondeu" : "sem",
          origem: /disparo/i.test(l.fb_campaign ?? "") ? "disparo" : l.source === "facebook_make" ? "anúncio" : (l.source ?? "outro").replace(/_/g, " ") };
      });
      return { corretores, leads, alguemNoPlantao: noPlantao.size > 0 };
    },
  });
}

export default function RoletaHoje({ managerId, quem }: { managerId: string; quem: string }) {
  const qc = useQueryClient();
  const { data } = useRoleta(managerId);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [passando, setPassando] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  const recarregar = () => { qc.invalidateQueries({ queryKey: ["roleta-hoje", managerId] }); qc.invalidateQueries({ queryKey: ["tempo-real"] }); qc.invalidateQueries({ queryKey: ["aba-leads"] }); };
  async function alternar(c: Corretor, receber: boolean) {
    setOcupado(c.id);
    try { await definirRecebimento(c.id, receber); recarregar(); toast.success(`${c.nome.split(" ")[0]} ${receber ? "entrou na" : "saiu da"} roleta (vale até meia-noite).`); }
    catch (e: any) { toast.error(`Não consegui mudar: ${e?.message ?? e}`); } finally { setOcupado(null); }
  }
  async function todos(receber: boolean) {
    if (!data) return;
    setOcupado("todos");
    try { for (const c of data.corretores.filter((x) => x.on !== receber)) await definirRecebimento(c.id, receber); recarregar(); toast.success(receber ? "Time inteiro na roleta até meia-noite." : "Ninguém recebe lead até você ligar alguém."); }
    catch (e: any) { toast.error(`Não consegui mudar: ${e?.message ?? e}`); } finally { setOcupado(null); }
  }
  async function cobrar(l: Lead) {
    setOcupado(l.id);
    try { const r = await cobrarCorretor(l.id, quem); toast.success(r.avisado_no_whats ? `${r.corretor} recebeu o toque no WhatsApp.` : `Aviso no painel de ${r.corretor} (WhatsApp não saiu).`); recarregar(); }
    catch (e: any) { toast.error(`Não consegui cobrar: ${e?.message ?? e}`); } finally { setOcupado(null); }
  }
  async function passar(l: Lead, brokerId: string) {
    setOcupado(l.id);
    try { await redistribuir([l.id], [brokerId], managerId); toast.success(`${l.nome} passou para ${data?.corretores.find((c) => c.id === brokerId)?.nome.split(" ")[0]}.`); setPassando(null); recarregar(); }
    catch (e: any) { toast.error(`Não consegui passar: ${e?.message ?? e}`); } finally { setOcupado(null); }
  }

  const ordem = useMemo(() => (data?.leads ?? []).slice().sort((a, b) => {
    const p = (x: Lead) => (x.estado === "respondeu" ? 0 : x.estado === "sem" ? 1 : 2);
    return p(a) - p(b) || b.min - a.min;
  }), [data]);
  if (!data) return null;
  const ligados = data.corretores.filter((c) => c.on);
  const atrasados = data.leads.filter((l) => l.estado !== "ok" && l.min >= 15).length;
  const mostrar = verTodos ? ordem : ordem.slice(0, 8);
  const destinos = [...data.corretores].sort((a, b) => Number(b.on) - Number(a.on) || Number(b.online) - Number(a.online));

  return (
    <div className="rlt">
      <section className="rlt-card">
        <div className="rlt-h">
          <div><b>Roleta de leads</b><span>{ligados.length} de {data.corretores.length} recebendo agora{data.alguemNoPlantao ? "" : " · ninguém bateu ponto no C2S ainda"}</span></div>
          <div className="rlt-bt">
            <button disabled={ocupado === "todos"} onClick={() => todos(true)}>Ligar todos</button>
            <button disabled={ocupado === "todos"} onClick={() => todos(false)}>Desligar todos</button>
          </div>
        </div>
        <div className="rlt-chips">
          {data.corretores.map((c) => (
            <button key={c.id} className={`rlt-chip${c.on ? " on" : ""}`} disabled={ocupado === c.id} onClick={() => alternar(c, !c.on)}
              title={c.on ? "Clique para tirar da roleta" : "Clique para colocar na roleta"} aria-pressed={c.on}>
              <span className="sw"><i /></span>
              <span className="nm">{c.nome.split(" ").slice(0, 2).join(" ")}
                <small>{c.on ? "recebe" : "não recebe"}{c.fonte === "gerente" ? " · por você" : c.fonte === "plantao" ? " · plantão" : ""}{c.plantao ? " · no plantão" : ""}{c.online ? " · online" : ""}</small></span>
            </button>))}
          {!data.corretores.length ? <span className="rlt-vazio">Nenhum corretor ativo na equipe.</span> : null}
        </div>
        <p className="rlt-nota">Quem bate ponto no C2S entra sozinho. O que você liga ou desliga aqui vale até a meia-noite, mesmo sem check-in.</p>
      </section>

      <section className="rlt-card">
        <div className="rlt-h">
          <div><b>Leads de hoje</b><span>{data.leads.length} chegaram{atrasados ? <> · <em>{atrasados} sem atendimento há 15 min ou mais</em></> : " · todos em dia"}</span></div>
        </div>
        {!data.leads.length ? <div className="rlt-vazio">Nenhum lead chegou hoje ainda.</div> : (
          <div className="rlt-ls">
            {mostrar.map((l) => (
              <div key={l.id} className={`rlt-l ${l.estado}${l.estado !== "ok" && l.min >= 15 ? " late" : ""}`}>
                <div className="rlt-ln"><b>{l.nome}</b><small>{l.corretor} · {l.origem} · chegou há {tempo(l.min)}</small></div>
                <span className={`rlt-st ${l.estado}`}>{l.estado === "respondeu" ? "cliente respondeu, ninguém atendeu" : l.estado === "sem" ? "sem atendimento" : "em atendimento"}</span>
                <div className="rlt-ac">
                  {l.estado !== "ok" && l.brokerId ? <button disabled={ocupado === l.id} onClick={() => cobrar(l)}>Cobrar</button> : null}
                  {passando === l.id ? (
                    <select autoFocus aria-label="Passar para" defaultValue="" onChange={(e) => e.target.value && passar(l, e.target.value)} onBlur={() => setPassando(null)}>
                      <option value="" disabled>Passar para…</option>
                      {destinos.filter((c) => c.id !== l.brokerId).map((c) => <option key={c.id} value={c.id}>{c.nome.split(" ")[0]}{c.on ? " · na roleta" : ""}{c.online ? " · online" : ""}</option>)}
                    </select>
                  ) : <button className="solid" disabled={ocupado === l.id} onClick={() => setPassando(l.id)}>{l.brokerId ? "Passar" : "Distribuir"}</button>}
                </div>
              </div>))}
            {ordem.length > 8 ? <button className="rlt-mais" onClick={() => setVerTodos((v) => !v)}>{verTodos ? "Mostrar só os 8 mais urgentes" : `Ver os ${ordem.length} leads de hoje`}</button> : null}
          </div>)}
      </section>
    </div>
  );
}
