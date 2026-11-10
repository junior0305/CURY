// Trocar corretor de equipe (10/11) e "Saíram e ainda têm carteira" (quem saiu junto com um gerente).
// Troca: lead de campanha do gerente antigo fica na equipe antiga (sem corretor, o gerente antigo passa);
// o resto vai com o corretor. Carteira de quem saiu: o líder escolhe dividir, baixar a lista para ligar ou disparar.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import DesligarCorretor from "@/components/manager-v10/DesligarCorretor";

const sb = supabase as any;

export function TrocarEquipe({ broker, gerentes, atual, onFechar, onPronto }: {
  broker: { id: string; nome: string }; gerentes: { id: string; nome: string }[]; atual: string;
  onFechar: () => void; onPronto: () => void;
}) {
  const [novo, setNovo] = useState("");
  const [indo, setIndo] = useState(false);
  async function trocar() {
    if (!novo) { toast.error("Escolha a equipe nova."); return; }
    setIndo(true);
    const { data, error } = await sb.rpc("trocar_equipe", { p_broker: broker.id, p_novo: novo });
    setIndo(false);
    if (error) { toast.error(error.message || "Não consegui trocar."); return; }
    toast.success(`${broker.nome} mudou de equipe com ${data.foram} lead(s)`
      + (data.ficaram ? `. ${data.ficaram} das campanhas do gerente antigo ficaram na equipe antiga, para ele passar.` : "."));
    onPronto();
  }
  return (
    <>
      <div className="tm-scrim on" onClick={onFechar} />
      <div className="tm-modal on" role="dialog" aria-modal="true" aria-labelledby="te-t" style={{ maxWidth: 520 }}>
        <h3 id="te-t">Trocar {broker.nome} de equipe</h3>
        <p>Ele continua na empresa. Vai com ele o que ele já atende (Pescar, listas, indicação, campanhas da superintendência e tudo que está em visita ou pasta).
          Lead de campanha do gerente antigo fica na equipe antiga, sem corretor, para o gerente antigo passar. Os dois gerentes são avisados.</p>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>Equipe nova:
          <select value={novo} onChange={(e) => setNovo(e.target.value)} aria-label="Equipe nova"
            style={{ font: "inherit", minHeight: 38, borderRadius: 8, border: "1px solid var(--hair)", padding: "0 8px", background: "transparent", color: "inherit" }}>
            <option value="">escolher…</option>
            {gerentes.filter((g) => g.id !== atual).map((g) => <option key={g.id} value={g.id}>Equipe {g.nome}</option>)}
          </select>
        </label>
        <div className="tm-modala">
          <button className="mini" onClick={onFechar}>Cancelar</button>
          <button className="mini solid" disabled={indo || !novo} onClick={trocar}>{indo ? "trocando…" : "Trocar de equipe"}</button>
        </div>
      </div>
    </>
  );
}

type Pendente = { id: string; nome: string; carteira: number; desligado_em: string | null };
const STATUS: Record<string, string> = { NEW: "Novo", IN_PROGRESS: "Tentando", NEGOTIATING: "Conversando", VISIT_SCHEDULED: "Visita",
  VISITA_REALIZADA: "Veio", DOCS_REQUESTED: "Documentos", FOLLOW_UP_AUTO: "Retorno", REACTIVATED: "Reativado" };

export function CarteirasPendentes() {
  const qc = useQueryClient();
  const [dividir, setDividir] = useState<string | null>(null);
  const { data: lista = [] } = useQuery({
    queryKey: ["carteiras-pendentes"], staleTime: 30_000,
    queryFn: async () => ((await sb.rpc("carteiras_pendentes")).data ?? []) as Pendente[],
  });
  if (!lista.length) return null;

  async function baixar(p: Pendente, paraDisparo: boolean) {
    const { data, error } = await sb.from("leads").select("name,phone,status,campanha_nome,last_interaction_at,created_at")
      .eq("broker_id", p.id).not("status", "in", "(CONCLUDED,EXCLUDED,ABANDONED)").order("created_at", { ascending: false }).limit(5000);
    if (error) { toast.error("Não consegui baixar: " + error.message); return; }
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = paraDisparo
      ? [["nome", "telefone"], ...(data ?? []).map((l: any) => [l.name, l.phone])]
      : [["nome", "telefone", "etapa", "campanha", "chegou", "ultimo contato"],
         ...(data ?? []).map((l: any) => [l.name, l.phone, STATUS[l.status] ?? l.status, l.campanha_nome,
           l.created_at?.slice(0, 10), l.last_interaction_at?.slice(0, 10)])];
    const csv = "﻿" + linhas.map((r) => r.map(esc).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${paraDisparo ? "disparo" : "carteira"}-${p.nome.split(" ")[0].toLowerCase()}.csv`;
    a.click();
    toast.success(paraDisparo ? "Arquivo pronto: suba no Disparar (lista de contatos) e escolha quem recebe as respostas." : "Lista baixada para imprimir ou ligar.");
  }

  return (
    <div className="cfg-lista" style={{ marginTop: 14 }}>
      <div className="cfg-lista-h"><b>Saíram e ainda têm carteira</b><span>sem acesso · os leads esperam você decidir</span></div>
      {lista.map((p) => (
        <div key={p.id} className="cfg-pessoa">
          <div className="cfg-pessoa-b"><b>{p.nome}</b><span>{p.carteira} leads em aberto</span></div>
          <div className="cfg-pessoa-acoes">
            <button className="cfg-btn prim" onClick={() => setDividir(p.id)}>Dividir a carteira</button>
            <button className="cfg-btn" onClick={() => baixar(p, false)}>Baixar a lista</button>
            <button className="cfg-btn" onClick={() => baixar(p, true)}>Arquivo para disparar</button>
          </div>
        </div>
      ))}
      {dividir ? <DesligarCorretor brokerId={dividir} onFechar={() => setDividir(null)}
        onPronto={() => { setDividir(null); qc.invalidateQueries({ queryKey: ["carteiras-pendentes"] }); }} /> : null}
    </div>
  );
}
