// BRIEFING — a munição para a conversa de 1:1.
//
// O bloco que a versão antiga não tinha é o PACTO da vez passada. Sem ele toda
// conversa recomeça do zero e nenhuma delas conta; com ele o gerente entra
// sabendo o que cobrar.
//
// O roteiro veio da tela antiga (/manager/coach), que é a parte boa dela, com a
// linguagem simplificada. Zero LLM — tudo sai do banco.

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import type { PessoaTime } from "@/hooks/useTime";

const ini = (n: string) => n.trim().slice(0, 2).toUpperCase();
const um = (n: number) => n.toFixed(1).replace(".", ",");
const dias = (iso: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

const ROTEIRO = [
  { t: "Comece perguntando como ele está", m: "5 min",
    p: "Não comece pelos números. Escute. Muita gente entrega o motivo real logo nessa primeira pergunta." },
  { t: "Mostre o número e pergunte o que ele acha", m: "10 min",
    p: "Apresente UM ponto só, o principal. Pergunte o que ele acha que está acontecendo. Não imponha — descubra junto." },
  { t: "Combine UMA coisa", m: "5 min",
    p: "Uma mudança específica, que dê para conferir na semana que vem. Uma, não cinco. E marque quando vocês vão revisar." },
];

export default function Briefing({
  pessoa, gente, onFechar,
}: { pessoa: PessoaTime; gente: PessoaTime[]; onFechar: () => void }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [pacto, setPacto] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onFechar]);

  // a última conversa registrada com essa pessoa
  const { data: ultima } = useQuery({
    queryKey: ["coach-ultima", pessoa.profileId],
    queryFn: async () => {
      const { data } = await supabase.from("coaching_sessions")
        .select("session_date,notes,action_items")
        .eq("broker_id", pessoa.profileId)
        .order("session_date", { ascending: false }).limit(1).maybeSingle();
      return data as any;
    },
  });

  // conversas que pararam: o cliente respondeu e o corretor não voltou
  const { data: travadas } = useQuery({
    queryKey: ["coach-travadas", pessoa.profileId],
    queryFn: async () => {
      const { data } = await supabase.from("leads")
        .select("name,last_lead_response_at,last_broker_whatsapp_at")
        .eq("broker_id", pessoa.profileId)
        .not("last_lead_response_at", "is", null)
        .not("status", "in", "(CONCLUDED,EXCLUDED,ABANDONED)")
        .order("last_lead_response_at", { ascending: false }).limit(40);
      return (data ?? []).filter((l: any) =>
        !l.last_broker_whatsapp_at || l.last_broker_whatsapp_at < l.last_lead_response_at).slice(0, 4);
    },
  });

  const media = (f: (p: PessoaTime) => number) =>
    gente.length ? gente.reduce((a, p) => a + f(p), 0) / gente.length : 0;

  const kpis = [
    { l: "Atendimentos no período", v: String(pessoa.atendimentos),
      vs: `time faz ${Math.round(media((p) => p.atendimentos))}`,
      t: pessoa.atendimentos < media((p) => p.atendimentos) ? "ruim" : "bom" },
    { l: "Vendas no período", v: String(pessoa.vendas),
      vs: `time faz ${Math.round(media((p) => p.vendas))}`,
      t: pessoa.vendas < media((p) => p.vendas) ? "ruim" : "bom" },
    { l: "Dias que veio trabalhar", v: String(pessoa.dias),
      vs: `time faz ${Math.round(media((p) => p.dias))}`, t: "" },
    { l: "Leads na mão", v: String(pessoa.carteira),
      vs: `time tem ${Math.round(media((p) => p.carteira))}`, t: "" },
    { l: "Clientes esperando resposta", v: String(pessoa.travados),
      vs: pessoa.travados > 0 ? "responderam e ninguém voltou" : "nenhum",
      t: pessoa.travados > 3 ? "ruim" : "" },
    { l: "Último acesso ao sistema", v: dias(pessoa.ultimoAcesso) === 0 ? "hoje"
        : dias(pessoa.ultimoAcesso) != null ? `há ${dias(pessoa.ultimoAcesso)} dias` : "nunca",
      vs: "", t: (dias(pessoa.ultimoAcesso) ?? 99) > 3 ? "ruim" : "" },
  ];

  async function salvar() {
    if (!pacto.trim()) { toast.error("Escreva o que vocês combinaram."); return; }
    setSalvando(true);
    try {
      const { error } = await supabase.from("coaching_sessions").insert({
        manager_id: session!.user.id, broker_id: pessoa.profileId,
        session_date: new Date().toISOString().slice(0, 10),
        notes: pacto.trim(),
        action_items: [{ id: crypto.randomUUID(), text: pacto.trim(), status: "pending" }],
      });
      if (error) throw error;
      toast.success("Combinado registrado. Na próxima conversa ele aparece aqui.");
      qc.invalidateQueries({ queryKey: ["coach-ultima", pessoa.profileId] });
      setPacto("");
    } catch (e: any) {
      toast.error(`Não consegui salvar: ${e?.message ?? e}`);
    } finally { setSalvando(false); }
  }

  const nome = pessoa.apelido ?? pessoa.nome;
  const resumo = pessoa.atendimentos === 0 && pessoa.dias > 0
    ? `${pessoa.dias} dias de plantão e nenhum atendimento`
    : `${pessoa.atendimentos} atendimentos e ${pessoa.vendas} venda${pessoa.vendas === 1 ? "" : "s"} no período`;

  return (
    <>
      <div className="tm-scrim on" onClick={onFechar} />
      <aside className="tm-bf on" role="dialog" aria-modal="true" aria-label={`Briefing de ${nome}`}>
        <div className="tm-bf-top">
          <div className="tm-bf-h">
            <div className="tm-bf-av">{ini(nome)}</div>
            <div><h3>{nome}</h3><p>{resumo}</p></div>
            <button className="tm-bf-x" onClick={onFechar} aria-label="Fechar">✕</button>
          </div>
        </div>

        <div className="tm-bf-body">
          {ultima && (
            <div className="tm-bfs">
              <h4>O que vocês combinaram da última vez</h4>
              <div className="tm-pacto">
                <span className="qd">Conversa de {new Date(ultima.session_date + "T12:00:00")
                  .toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}</span>
                <b>“{ultima.notes}”</b>
              </div>
            </div>
          )}

          <div className="tm-bfs">
            <h4>Como ele está, comparado ao time</h4>
            <div className="tm-kp">
              {kpis.map((k) => (
                <div key={k.l} className={`tm-kpr ${k.t}`}>
                  <span>{k.l}</span><span className="v">{k.v}</span><span className="vs">{k.vs}</span>
                </div>
              ))}
            </div>
          </div>

          {(travadas ?? []).length > 0 && (
            <div className="tm-bfs">
              <h4>Conversas que pararam · use isto na conversa</h4>
              {(travadas ?? []).map((t: any, i: number) => (
                <div key={i} className="tm-trav">
                  <b>{t.name ?? "cliente sem nome"}</b>
                  <span>Respondeu há {dias(t.last_lead_response_at)} dias e ninguém voltou</span>
                </div>
              ))}
            </div>
          )}

          <div className="tm-bfs">
            <h4>Como conduzir a conversa · 20 minutos</h4>
            {ROTEIRO.map((r, i) => (
              <div key={i} className="tm-rot">
                <i>{i + 1}</i>
                <div>
                  <b>{r.t} <span>· {r.m}</span></b>
                  <p>{r.p}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="tm-bfs">
            <h4>O que vocês vão combinar agora</h4>
            <input className="tm-novo" value={pacto} onChange={(e) => setPacto(e.target.value)}
              placeholder="Ex: responder todo lead no mesmo dia" />
          </div>
        </div>

        <div className="tm-bf-a">
          <button className="mini" onClick={onFechar}>Fechar</button>
          <button className="mini solid" disabled={salvando} onClick={salvar}>
            {salvando ? "salvando…" : "Salvar o combinado"}
          </button>
        </div>
      </aside>
    </>
  );
}
