// Pescar no painel novo: a mesma regra do painel antigo (CorretorPainel), num cartão por vez.
// Região escolhida, só contatos da empresa ou da própria cadeia (ids_acima), embaralhado por corretor,
// "Passar" não volta por 7 dias, só no plantão (trigger cold_contacts_pescar_plantao).
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mascarar, primeiroNome } from "./util";

const LIXO = new Set(["EQ", "CR", "DISPARO", "FEIRAO", "OFERTA", "ATIVA", "FACEBOOK", "MCMV", "DATTI", "DUDU", "DUDALINA", "GIORGE", "GIORGINA", "LILIANE", "LILI", "JAPA",
  "BACANA", "LUCIENE", "NOBILE", "ULLY", "ULLLY", "KENOBI", "JORDAN", "ODALYS", "AMSTERDA", "FAVORITA", "CAR", "NEO"]);
const ZONA: Record<string, string> = { ZS: "Zona Sul", ZO: "Zona Oeste", ZN: "Zona Norte", ZL: "Zona Leste" };
function limparRegiao(raw?: string | null): string {
  if (!raw || !raw.trim() || /sem.?[aá]rea/i.test(raw)) return "Sem área";
  const toks = raw.trim().toUpperCase().split(/[_\-\s]+/).filter(Boolean).filter((t) => !LIXO.has(t));
  if (!toks.length) return "Geral";
  const label = toks.map((t) => ZONA[t] || t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())).join(" ");
  if (/^\d/.test(label) || /qtos?|qto/i.test(label)) return "Geral";
  return label;
}

export default function Pescar({ userId, onPegou }: { userId: string; onPegou: (leadId: string) => void }) {
  const qc = useQueryClient();
  const [regiao, setRegiao] = useState("");
  const [fila, setFila] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const { data: areas = [] } = useQuery<{ tag: string; n: number }[]>({
    queryKey: ["poolAreas"], staleTime: 60_000,
    queryFn: async () => { const { data } = await supabase.rpc("pool_areas"); return (data as any) || []; },
  });
  const regioes = useMemo(() => {
    const m = new Map<string, { label: string; count: number; tags: string[] }>();
    for (const a of areas) {
      const label = limparRegiao(a.tag); const cur = m.get(label) || { label, count: 0, tags: [] };
      cur.count += Number(a.n) || 0; cur.tags.push(a.tag); m.set(label, cur);
    }
    return [...m.values()].sort((x, y) => y.count - x.count);
  }, [areas]);
  const atualReg = regioes.find((r) => r.label === regiao) || null;

  const { data: hoje = 0 } = useQuery<number>({
    queryKey: ["pescaHoje"], refetchInterval: 20_000,
    queryFn: async () => {
      const { count } = await supabase.from("cold_contacts").select("id", { count: "exact", head: true })
        .eq("claimed_by", userId).gte("claimed_at", new Date(Date.now() - 864e5).toISOString());
      return count || 0;
    },
  });

  const carregar = async () => {
    setCarregando(true);
    try {
      const { data: skips } = await supabase.from("cold_skip").select("contact_id").eq("broker_id", userId).gte("skipped_at", new Date(Date.now() - 7 * 864e5).toISOString());
      const pular = new Set((skips || []).map((s: any) => s.contact_id));
      const { data: acima } = await (supabase as any).rpc("ids_acima", { p: userId });
      const cadeia = ((acima ?? []) as any[]).map((r) => (typeof r === "string" ? r : r.ids_acima)).filter(Boolean);
      let q = supabase.from("cold_contacts").select("id, name, phone, tag").eq("status", "available").or(`previous_broker_id.is.null,previous_broker_id.neq.${userId}`)
        .or(cadeia.length ? `dono_equipe.is.null,dono_equipe.in.(${cadeia.join(",")})` : "dono_equipe.is.null").order("created_at", { ascending: true }).limit(400);
      if (atualReg) q = q.in("tag", atualReg.tags);
      const { data } = await q;
      const lista = ((data as any[]) || []).filter((c) => !pular.has(c.id));
      for (let i = lista.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [lista[i], lista[j]] = [lista[j], lista[i]]; }
      setFila(lista.slice(0, 80));
    } finally { setCarregando(false); }
  };
  useEffect(() => { if (regioes.length) carregar(); }, [regiao, regioes.length]); // eslint-disable-line
  const atual = fila[0] || null;
  const proximo = () => { if (fila.length <= 1) carregar(); else setFila((f) => f.slice(1)); };

  // outro corretor pegou o que está na tela: some sozinho
  useEffect(() => {
    if (!fila.length) return;
    const t = setInterval(async () => {
      const ids = fila.slice(0, 8).map((c) => c.id);
      const { data } = await supabase.from("cold_contacts").select("id").in("id", ids).neq("status", "available");
      const foram = new Set(((data as any[]) || []).map((c) => c.id));
      if (foram.size) setFila((f) => { const r = f.filter((c) => !foram.has(c.id)); if (!r.length) carregar(); return r; });
    }, 15_000);
    return () => clearInterval(t);
  }, [fila]); // eslint-disable-line

  const pegar = async () => {
    if (!atual || ocupado) return;
    setOcupado(true);
    try {
      const { error: e1 } = await supabase.rpc("claim_cold_contact", { p_broker_id: userId, p_contact_id: atual.id });
      if (e1) {
        const m = String(e1.message || "");
        if (/already_claimed/i.test(m)) { toast.info("Outro corretor pegou esse agora. Aqui vai o próximo."); proximo(); return; }
        if (/fora_do_plantao/i.test(m)) { toast.error("O Pescar só funciona com você no plantão. Bata o ponto e tente de novo."); return; }
        toast.error((e1 as any).details || m || "Não consegui pegar."); return;
      }
      const { data: leadId, error: e2 } = await supabase.rpc("promote_cold_to_lead", { p_contact_id: atual.id });
      if (e2 || !leadId) { toast.error((e2 as any)?.details || e2?.message || "Não consegui criar o lead. Avise seu gerente."); return; }
      toast.success(`✅ ${primeiroNome(atual.name) || "Contato"} é seu! Já está nos seus clientes.`);
      qc.invalidateQueries({ queryKey: ["pescaHoje"] });
      qc.invalidateQueries({ queryKey: ["pcLeads"] });
      qc.invalidateQueries({ queryKey: ["poolAreas"] });
      proximo();
      onPegou(String(leadId));
    } catch (e: any) { toast.error(e?.message || "Não consegui pegar."); }
    finally { setOcupado(false); }
  };
  const passar = async () => {
    if (!atual || ocupado) return;
    setOcupado(true);
    try { await supabase.rpc("skip_cold_contact", { p_broker_id: userId, p_contact_id: atual.id }); } catch { /* segue */ }
    finally { proximo(); setOcupado(false); }
  };

  const total = regioes.reduce((s, r) => s + r.count, 0);
  return (
    <>
      <div className="lbl">Escolha a região</div>
      <div className="chips regs">
        <button type="button" className={regiao === "" ? "on" : ""} onClick={() => setRegiao("")}>Todas · {total}</button>
        {regioes.map((r) => <button type="button" key={r.label} className={regiao === r.label ? "on" : ""} onClick={() => setRegiao(r.label)}>{r.label} · {r.count}</button>)}
      </div>
      <div className="card plain pesca">
        {carregando && !atual ? <span className="meta">Procurando contatos…</span>
          : !atual ? <><b>Acabaram os contatos {atualReg ? `em ${atualReg.label}` : "por aqui"}</b><span className="meta">Tente outra região ou volte mais tarde.</span></>
          : <>
            <span className="meta">{limparRegiao(atual.tag)}</span>
            <span className="nome">{atual.name || "Contato"}</span>
            <span className="meta" style={{ fontVariantNumeric: "tabular-nums" }}>{mascarar(atual.phone)} · o número aparece quando você chamar</span>
            <div className="big"><button className="btn" type="button" onClick={passar} disabled={ocupado}>Passar</button><button className="btn pri" type="button" onClick={pegar} disabled={ocupado}>Pegar 🎣</button></div>
          </>}
      </div>
      <p className="hint">Você pegou {hoje} hoje. Quem você pega fica nos seus clientes e entra na régua de toques.</p>
    </>
  );
}
