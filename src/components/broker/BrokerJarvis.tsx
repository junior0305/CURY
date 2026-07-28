// BrokerJarvis — console do Jarvis no painel do corretor (Atender).
// Cria lead (atribuído a ele mesmo, source=broker_manual via LeadForm) + responde da carteira dele.
import { useState } from "react";

const hs = (t?: string | null) => (t ? (Date.now() - new Date(t).getTime()) / 3.6e6 : 99999);

function parseLead(text: string): { name: string; phone: string } {
  const digits = text.replace(/[^\d]/g, "");
  const phone = /^\d{10,13}$/.test(digits) ? digits : digits.length >= 10 ? digits.slice(-11) : "";
  const name = text
    .replace(/[\d()+\-.]/g, " ")
    .replace(/\b(cria|criar|crie|adiciona|adicionar|adicione|cadastr\w*|nov[oa]|um|uma|lead|contato|cliente|manual|por|favor|pra|para|telefone|tel|fone|numero|número|com|nome|do|da|de|o|a|meu|minha)\b/gi, " ")
    .replace(/[,:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { name, phone };
}

export default function BrokerJarvis({ leads = [], onCreateLead }: { leads?: any[]; onCreateLead: (name: string, phone: string) => void }) {
  const [cmd, setCmd] = useState("");
  const [ans, setAns] = useState<string | null>(null);

  function run(raw?: string) {
    const text = (raw ?? cmd).trim();
    if (!text) return;
    const t = text.toLowerCase();
    setCmd("");
    try {
      if (/(cria|criar|crie|adiciona|adicionar|adicione|cadastr|nov[oa])/.test(t) && /(lead|contato|cliente)/.test(t)) {
        const { name, phone } = parseLead(text);
        setAns(`Abrindo o cadastro${name ? ` com ${name}` : ""}${phone ? ` · ${phone}` : ""} — confere e salva.`);
        onCreateLead(name, phone);
        return;
      }
      if (/parad/.test(t)) {
        const n = leads.filter((l) => { const r = hs(l.lastLeadResponseAt); return !["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(l.status) && r > 2 && r < 72 && hs(l.lastBrokerWhatsappAt) > r; }).length;
        setAns(`Você tem ${n} lead(s) parado(s) — o cliente respondeu há +2h e você não voltou.`);
        return;
      }
      if (/(vend|fech)/.test(t)) {
        const d0 = new Date(); d0.setDate(1); d0.setHours(0, 0, 0, 0);
        const n = leads.filter((l) => l.status === "CONCLUDED" && l.lastInteractionAt && new Date(l.lastInteractionAt) >= d0).length;
        setAns(`Você fechou ${n} venda(s) no mês.`);
        return;
      }
      if (/(quant|meus lead|minha carteira|quantos)/.test(t)) { setAns(`Você tem ${leads.length} lead(s) na carteira.`); return; }
      if (/(próxim|proxim|agora|atender|quente)/.test(t)) {
        const hot = leads.filter((l) => l.leadTemperature === "quente" || l.status === "NEGOTIATING").sort((a, b) => hs(b.lastLeadResponseAt) - hs(a.lastLeadResponseAt))[0];
        setAns(hot ? `Foca no ${(hot.name || "lead").split(" ")[0]} — seu mais quente agora.` : "Sem lead quente parado agora.");
        return;
      }
      setAns("Eu sei: criar lead, seus parados, suas vendas, quantos leads você tem, e o próximo pra atender.");
    } catch (e: any) { setAns("Ops: " + String(e?.message || e)); }
  }

  const cv = (n: string, f: string) => `var(${n}, ${f})`;
  const box: React.CSSProperties = { background: cv("--crm-surface", "rgba(255,255,255,.06)"), border: `1px solid ${cv("--crm-border", "rgba(255,255,255,.12)")}` };

  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 12, padding: "9px 13px", ...box }}>
        <span style={{ fontSize: 15 }}>🧠</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          autoComplete="off"
          placeholder='Fale com o Jarvis: "cria lead João, 11 99999-8888", "meus parados", "próximo pra atender"'
          style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: cv("--crm-text", "#eaeef6"), fontSize: 14, minWidth: 0 }}
        />
        <button onClick={() => run()} aria-label="enviar" style={{ background: "#37E0D0", color: "#032b28", border: 0, borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontWeight: 700, flex: "none" }}>➤</button>
      </div>
      {ans && (
        <div style={{ marginTop: 8, borderRadius: 10, padding: "9px 12px", display: "flex", gap: 10, alignItems: "flex-start", ...box }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "monospace", fontSize: 9.5, letterSpacing: ".12em", color: "#37E0D0", marginBottom: 3 }}>COMANDRA</div>
            <div style={{ fontSize: 13, color: cv("--crm-text", "#eaeef6"), lineHeight: 1.5 }}>{ans}</div>
          </div>
          <span onClick={() => setAns(null)} style={{ cursor: "pointer", color: cv("--crm-text-muted", "#8b93a7"), fontSize: 15, lineHeight: 1, flex: "none" }}>×</span>
        </div>
      )}
    </div>
  );
}
