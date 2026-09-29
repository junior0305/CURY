// DisparoCorretor — o corretor dispara pelo WhatsApp oficial de forma simples:
// escolhe a mensagem (template aprovado do número do gerente), uma foto (se o
// template pedir), sobe um CSV de contatos e dispara. O envio sai pelo NÚMERO
// DO GERENTE e respeita a COTA diária que o gerente definiu.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { lerCsv, ajustarImagem, subirImagem, dispararCampanha } from "@/hooks/useDisparar";

type Tpl = { id: string; name: string; variables: string[] | null; header_type: string | null; body_text: string | null };
type Alvo = { leadId: string; nome: string | null; telefone: string };

export function DisparoCorretor({ managerId, configId, wabaId, cota, brokerId, brokerNome }: {
  managerId: string; configId: string; wabaId: string; cota: number; brokerId: string; brokerNome?: string;
}) {
  const qc = useQueryClient();
  const [alvos, setAlvos] = useState<Alvo[]>([]);
  const [csvNome, setCsvNome] = useState("");
  const [tplId, setTplId] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const { data: templates = [] } = useQuery<Tpl[]>({
    queryKey: ["tplCorretor", wabaId],
    enabled: !!wabaId,
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_templates")
        .select("id, name, variables, header_type, body_text")
        .eq("waba_id", wabaId).eq("meta_status", "APPROVED").order("name", { ascending: true });
      return (data as Tpl[]) || [];
    },
  });

  const { data: usados = 0 } = useQuery<number>({
    queryKey: ["cotaUsada", brokerId],
    enabled: !!brokerId,
    queryFn: async () => {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const { data } = await supabase.from("whatsapp_campaigns")
        .select("audience_count").contains("broker_ids", [brokerId]).gte("created_at", hoje.toISOString());
      return (data || []).reduce((s: number, c: any) => s + (c.audience_count || 0), 0);
    },
  });

  const tpl = templates.find((t) => t.id === tplId) || null;
  const tplVars = (tpl?.variables || []).map(String);
  const varsPedir = tplVars.filter((v) => v.toLowerCase() !== "nome"); // "nome" vem do CSV
  const precisaFoto = (tpl?.header_type || "").toUpperCase() === "IMAGE";
  const restante = Math.max(0, cota - usados);
  const enviaveis = Math.min(alvos.length, restante);

  const lerArquivo = (f: File) => {
    const r = new FileReader();
    r.onload = () => { const a = lerCsv(String(r.result || "")); setAlvos(a); setCsvNome(f.name); };
    r.readAsText(f);
  };
  const lerFoto = async (f: File) => {
    try {
      const { dataUrl } = await ajustarImagem(f);
      setFotoPreview(dataUrl);
      const url = await subirImagem(dataUrl);
      setFotoUrl(url);
    } catch { toast.error("Não consegui processar a foto."); }
  };

  const disparar = async () => {
    if (!alvos.length) { toast.error("Suba um CSV com os contatos."); return; }
    if (!tpl) { toast.error("Escolha a mensagem."); return; }
    if (restante <= 0) { toast.error("Sua cota do dia acabou. Volte amanhã."); return; }
    if (precisaFoto && !fotoUrl) { toast.error("Essa mensagem precisa de uma foto."); return; }
    for (const v of varsPedir) if (!vars[v]?.trim()) { toast.error(`Preencha o campo: ${v}`); return; }
    setEnviando(true);
    try {
      await dispararCampanha({
        managerId, nome: `Disparo ${brokerNome || ""}`.trim() || "Disparo",
        templateId: tpl.id, alvos: alvos.slice(0, enviaveis), vars,
        brokerIds: [brokerId], configId, imagem: precisaFoto ? fotoUrl : null, manual: true,
      });
      toast.success(`🚀 Disparo enviado para ${enviaveis} contato(s)!`);
      setAlvos([]); setCsvNome(""); setFotoUrl(null); setFotoPreview(null); setVars({});
      qc.invalidateQueries({ queryKey: ["cotaUsada", brokerId] });
    } catch (e: any) {
      toast.error("Não consegui disparar: " + (e?.message || "erro"));
    } finally { setEnviando(false); }
  };

  const box: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 12 };
  const num: React.CSSProperties = { fontWeight: 800 };

  return (
    <div style={{ maxWidth: 620 }}>
      {/* cota */}
      <div style={{ ...box, display: "flex", gap: 18, alignItems: "center" }}>
        <div><div style={{ fontSize: 11, color: "var(--muted)" }}>COTA HOJE</div><div style={num}>{cota}</div></div>
        <div><div style={{ fontSize: 11, color: "var(--muted)" }}>USADOS</div><div style={num}>{usados}</div></div>
        <div><div style={{ fontSize: 11, color: "var(--muted)" }}>RESTAM</div><div style={{ ...num, color: restante > 0 ? "var(--accent, #0d9488)" : "var(--warn, #d97706)" }}>{restante}</div></div>
      </div>

      {/* 1. mensagem */}
      <div style={box}>
        <label style={{ fontSize: 12.5, fontWeight: 700, display: "block", marginBottom: 6 }}>1 · Mensagem (aprovada pela Meta)</label>
        <select value={tplId} onChange={(e) => { setTplId(e.target.value); setVars({}); setFotoUrl(null); setFotoPreview(null); }}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontWeight: 600 }}>
          <option value="">— escolha a mensagem —</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {tpl?.body_text && <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, whiteSpace: "pre-wrap" }}>{tpl.body_text}</p>}
        {varsPedir.map((v) => (
          <input key={v} placeholder={`Valor de {{${v}}}`} value={vars[v] || ""}
            onChange={(e) => setVars((s) => ({ ...s, [v]: e.target.value }))}
            style={{ width: "100%", marginTop: 8, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
        ))}
      </div>

      {/* 2. foto (se o template pedir) */}
      {precisaFoto && (
        <div style={box}>
          <label style={{ fontSize: 12.5, fontWeight: 700, display: "block", marginBottom: 6 }}>2 · Foto do topo</label>
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && lerFoto(e.target.files[0])} />
          {fotoPreview && <img src={fotoPreview} alt="" style={{ marginTop: 10, maxHeight: 160, borderRadius: 8, display: "block" }} />}
        </div>
      )}

      {/* 3. contatos */}
      <div style={box}>
        <label style={{ fontSize: 12.5, fontWeight: 700, display: "block", marginBottom: 6 }}>{precisaFoto ? "3" : "2"} · Lista de contatos (CSV: nome, telefone)</label>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])} />
        {!!alvos.length && (
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}>
            <b style={{ color: "var(--text)" }}>{alvos.length}</b> contato(s) em {csvNome}
            {alvos.length > restante && <span style={{ color: "var(--warn, #d97706)" }}> · só os primeiros {restante} caberão na cota</span>}
          </div>
        )}
      </div>

      <button onClick={disparar} disabled={enviando || !alvos.length || !tpl || restante <= 0}
        style={{
          width: "100%", padding: "14px", borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: "pointer",
          border: "none", background: "var(--accent, #0d9488)", color: "#fff",
          opacity: (enviando || !alvos.length || !tpl || restante <= 0) ? 0.5 : 1,
        }}>
        {enviando ? "Enviando…" : `🚀 Disparar para ${enviaveis} contato(s)`}
      </button>
      <p style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", marginTop: 8 }}>
        Sai pelo número da sua equipe. As respostas caem no painel do seu gerente.
      </p>
    </div>
  );
}
