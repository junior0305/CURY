// WhatsApp Oficial — conexão da BM própria e disparo pela API oficial.
//
// Regras que a tela OBEDECE (elas moram no banco, não aqui — tela se contorna,
// trigger não):
//   · cada um conecta e dispara pelo PRÓPRIO número, na PRÓPRIA BM, com o
//     PRÓPRIO dinheiro;
//   · corretor vê só o dele; gerente vê o da equipe; superintendente, dois níveis;
//   · corretor dispara SÓ lista CSV; gerente dispara também da base própria;
//   · CSV vale pros dois.
//
// O cartão mostra o CUSTO antes do clique. É o número que decide: disparar pros
// 127 da Zona Sul ou só pros 39 que já responderam alguma vez.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import {
  MessageSquare, Loader2, Plus, Upload, Link2, CheckCircle2,
  AlertTriangle, Send, Wallet, Users,
} from "lucide-react";
import Shell from "@/components/manager-v2/Shell";

// Vêm do app DISPARADOR na Meta. O config_id define o fluxo de WhatsApp
// Embedded Signup; sem ele o popup abre no login genérico do Facebook.
const FB_APP_ID = "2304296553741453";
const FB_ES_CONFIG_ID = "1083508644286736";

interface Conexao {
  id: string;
  owner_id: string | null;
  label: string | null;
  display_number: string | null;
  waba_id: string;
  phone_number_id: string;
  business_id: string;
  status: string;
  quality: string | null;
  tier: number | null;
  coexistence: boolean;
}

interface Publico {
  regiao: string;
  leads: number;
  ja_responderam: number;
  nunca_responderam: number;
}

const brl = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WhatsAppOficial() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [carregando, setCarregando] = useState(true);
  const [conexoes, setConexoes] = useState<Conexao[]>([]);
  const [publico, setPublico] = useState<Publico[]>([]);
  const [precoMkt, setPrecoMkt] = useState(0.3);
  const [role, setRole] = useState<string>("BROKER");
  const [diasParado, setDiasParado] = useState(30);
  const [soResponderam, setSoResponderam] = useState(true);
  const [conectando, setConectando] = useState(false);
  const sessionRef = useRef<{ code?: string; waba_id?: string; phone_number_id?: string }>({});

  const minhaConexao = useMemo(
    () => conexoes.find((c) => c.owner_id === userId) || null,
    [conexoes, userId]
  );
  const podeBase = role !== "BROKER";

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setCarregando(true);
      const [{ data: perfil }, { data: conf }, { data: cfg }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
        supabase.from("whatsapp_config").select("*").order("label"),
        supabase.from("system_settings").select("key,value").eq("key", "wa_preco_marketing").maybeSingle(),
      ]);
      setRole(perfil?.role || "BROKER");
      setConexoes((conf || []) as Conexao[]);
      const p = Number(String(cfg?.value ?? "").replace(/"/g, ""));
      if (Number.isFinite(p) && p > 0) setPrecoMkt(p);
      setCarregando(false);
    })();
  }, [userId]);

  // O sugeridor. Recalcula quando os filtros mudam — o gerente vê a conta
  // mexer antes de gastar.
  useEffect(() => {
    if (!userId || !podeBase) return;
    supabase
      .rpc("wa_publico", {
        p_owner: userId,
        p_regiao: null,
        p_dias_parado: diasParado,
        p_so_quem_respondeu: soResponderam,
      })
      .then(({ data }) => setPublico((data || []) as Publico[]));
  }, [userId, podeBase, diasParado, soResponderam]);

  // ── Embedded Signup ──────────────────────────────────────────────────
  // O SDK da Meta precisa estar carregado antes do clique. Carrega uma vez.
  useEffect(() => {
    if ((window as any).FB || document.getElementById("fb-sdk")) return;
    (window as any).fbAsyncInit = () =>
      (window as any).FB.init({ appId: FB_APP_ID, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
    const s = document.createElement("script");
    s.id = "fb-sdk";
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  // A Meta devolve waba_id e phone_number_id por postMessage; o `code` vem no
  // callback do login. Os dois chegam por caminhos diferentes — guardamos o
  // primeiro que chegar e disparamos quando tivermos os dois.
  useEffect(() => {
    function ouvir(ev: MessageEvent) {
      if (!/facebook\.com$/.test(new URL(ev.origin).hostname)) return;
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "WA_EMBEDDED_SIGNUP" && d.event === "FINISH") {
          sessionRef.current = { waba_id: d.data?.waba_id, phone_number_id: d.data?.phone_number_id };
          tentarFechar();
        }
        if (d.type === "WA_EMBEDDED_SIGNUP" && d.event === "CANCEL") {
          toast.warning("Conexão cancelada em: " + (d.data?.current_step || "?"));
        }
      } catch { /* mensagem que não é nossa */ }
    }
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, []);

  async function tentarFechar() {
    const s = sessionRef.current;
    if (!s.code || !s.waba_id || !s.phone_number_id) return;
    setConectando(true);
    const { data, error } = await supabase.functions.invoke("wa-onboard", {
      body: { ...s, owner_id: userId },
    });
    setConectando(false);
    sessionRef.current = {};
    if (error || data?.error) {
      toast.error("Falhou: " + (data?.error || error?.message));
      return;
    }
    toast.success(`${data.numero} conectado${data.aviso ? " — " + data.aviso : ""}`);
    const { data: conf } = await supabase.from("whatsapp_config").select("*").order("label");
    setConexoes((conf || []) as Conexao[]);
  }

  function conectarBM() {
    const FB = (window as any).FB;
    if (!FB) { toast.error("SDK da Meta ainda carregando, tente de novo."); return; }
    FB.login(
      (resp: any) => {
        const code = resp?.authResponse?.code;
        if (!code) { toast.warning("Autorização não concluída."); return; }
        sessionRef.current = { ...sessionRef.current, code };
        tentarFechar();
      },
      {
        config_id: FB_ES_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      }
    );
  }

  async function subirCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const linhas = (await f.text()).split(/\r?\n/).filter(Boolean);
    toast.success(`${linhas.length - 1} contatos lidos de ${f.name}`);
  }

  if (carregando) {
    return (
      <Shell title="WhatsApp Oficial" icon={MessageSquare} color="#10B981">
        <div className="flex items-center gap-2 text-sm p-8" style={{ color: "var(--crm-text-muted)" }}>
          <Loader2 className="w-4 h-4 animate-spin" /> carregando…
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title="WhatsApp Oficial"
      subtitle={podeBase ? "sua BM, seu número, seu disparo" : "disparo por lista (CSV)"}
      icon={MessageSquare}
      color="#10B981"
    >
      {/* ── CONEXÃO ────────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-sm font-bold mb-3" style={{ color: "var(--crm-text)" }}>
          Seu número
        </h2>

        {minhaConexao ? (
          <div
            className="rounded-xl p-4 flex items-center gap-4"
            style={{ background: "var(--crm-card)", border: "1px solid var(--crm-border)" }}
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: "var(--crm-good, #047857)" }} />
            <div className="min-w-0">
              <div className="font-semibold">{minhaConexao.display_number || minhaConexao.label}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--crm-text-muted)" }}>
                qualidade {minhaConexao.quality || "—"} · até {minhaConexao.tier?.toLocaleString("pt-BR") || "—"} msgs/dia
                {minhaConexao.coexistence && " · compartilhado com seu WhatsApp Business"}
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={conectarBM}
            className="w-full rounded-xl p-5 text-left transition-colors"
            style={{ background: "var(--crm-card)", border: "1px dashed var(--crm-border-mid)" }}
          >
            <div className="flex items-center gap-3">
              {conectando ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--crm-accent)" }} /> : <Link2 className="w-5 h-5" style={{ color: "var(--crm-accent)" }} />}
              <div>
                <div className="font-semibold">{conectando ? "Conectando…" : "Conectar meu WhatsApp"}</div>
                <div className="text-xs mt-1" style={{ color: "var(--crm-text-muted)" }}>
                  Use o número que você já atende. Você autoriza na Meta, o disparo sai no
                  seu nome e é cobrado na sua conta.
                </div>
              </div>
            </div>
          </button>
        )}

        {/* Gerente enxerga os da equipe — mas não dispara por eles: o número
            e o dinheiro são do corretor. */}
        {conexoes.filter((c) => c.owner_id && c.owner_id !== userId).length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: "var(--crm-text-muted)" }}>
              Da sua equipe
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {conexoes
                .filter((c) => c.owner_id && c.owner_id !== userId)
                .map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg px-3 py-2 text-sm flex items-center gap-2"
                    style={{ background: "var(--crm-card-soft)", border: "1px solid var(--crm-border)" }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: c.status === "ativo" ? "var(--crm-good, #047857)" : "var(--crm-text-subtle)" }}
                    />
                    <span className="truncate">{c.label || c.display_number}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>

      {/* ── DISPARO POR LISTA (vale pros dois) ─────────────────────── */}
      <section className="mb-6">
        <h2 className="text-sm font-bold mb-3" style={{ color: "var(--crm-text)" }}>
          Disparar uma lista
        </h2>
        <label
          className="block rounded-xl p-4 cursor-pointer transition-colors"
          style={{ background: "var(--crm-card)", border: "1px dashed var(--crm-border-mid)" }}
        >
          <input type="file" accept=".csv" className="hidden" onChange={subirCsv} />
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5" style={{ color: "var(--crm-accent)" }} />
            <div>
              <div className="font-semibold text-sm">Subir CSV</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--crm-text-muted)" }}>
                Uma coluna <b>telefone</b>, opcionalmente <b>nome</b>. Quem pediu pra sair
                é descartado automaticamente.
              </div>
            </div>
          </div>
        </label>
      </section>

      {/* ── SUGERIDOR: só gerente dispara da base ──────────────────── */}
      {podeBase && (
        <section>
          <div className="flex items-baseline gap-3 mb-1 flex-wrap">
            <h2 className="text-sm font-bold" style={{ color: "var(--crm-text)" }}>
              Disparar da sua base
            </h2>
            <span className="text-[11px]" style={{ color: "var(--crm-text-muted)" }}>
              o custo aparece antes do clique
            </span>
          </div>

          <div className="flex gap-2 flex-wrap my-3">
            {[15, 30, 60, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDiasParado(d)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                style={{
                  background: diasParado === d ? "var(--crm-accent-soft)" : "var(--crm-card-soft)",
                  border: `1px solid ${diasParado === d ? "var(--crm-accent-line)" : "var(--crm-border)"}`,
                  color: diasParado === d ? "var(--crm-accent)" : "var(--crm-text-muted)",
                }}
              >
                parados +{d}d
              </button>
            ))}
            <button
              onClick={() => setSoResponderam((v) => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
              style={{
                background: soResponderam ? "var(--crm-accent-soft)" : "var(--crm-card-soft)",
                border: `1px solid ${soResponderam ? "var(--crm-accent-line)" : "var(--crm-border)"}`,
                color: soResponderam ? "var(--crm-accent)" : "var(--crm-text-muted)",
              }}
            >
              só quem já respondeu
            </button>
          </div>

          {publico.length === 0 ? (
            <div className="rounded-xl p-6 text-center text-sm"
                 style={{ background: "var(--crm-card)", border: "1px solid var(--crm-border)", color: "var(--crm-text-muted)" }}>
              Nenhum lead nesse recorte.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {publico.map((p, i) => {
                const custo = p.leads * precoMkt;
                // 4-5% de retorno é a medição da casa em base própria.
                const retorno = Math.round(p.leads * 0.045);
                return (
                  <motion.div
                    key={p.regiao}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16, delay: i * 0.03, ease: [0.23, 1, 0.32, 1] }}
                    className="rounded-xl p-4"
                    style={{ background: "var(--crm-card)", border: "1px solid var(--crm-border)" }}
                  >
                    <div className="text-[11px] uppercase tracking-wider font-bold"
                         style={{ color: "var(--crm-text-muted)" }}>
                      {p.regiao}
                    </div>
                    <div className="text-3xl font-black tabular-nums mt-1" style={{ color: "var(--crm-text)" }}>
                      {p.leads.toLocaleString("pt-BR")}
                    </div>
                    <div className="text-xs mt-1 flex items-center gap-1.5" style={{ color: "var(--crm-text-muted)" }}>
                      <Users className="w-3 h-3" />
                      {p.ja_responderam} já responderam alguma vez
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3"
                         style={{ borderTop: "1px solid var(--crm-border)" }}>
                      <div className="flex items-center gap-1.5 text-sm font-bold"
                           style={{ color: "var(--crm-text)" }}>
                        <Wallet className="w-3.5 h-3.5" style={{ color: "var(--crm-text-muted)" }} />
                        {brl(custo)}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--crm-text-muted)" }}>
                        ~{retorno} conversas
                      </div>
                    </div>
                    <button
                      disabled={!minhaConexao}
                      onClick={() => toast.info("Escolha o template na próxima etapa.")}
                      className="w-full mt-3 rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
                      style={{
                        background: "var(--crm-accent-soft)",
                        border: "1px solid var(--crm-accent-line)",
                        color: "var(--crm-accent)",
                      }}
                    >
                      <Send className="w-3 h-3" /> Disparar
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}

          {!minhaConexao && (
            <div className="mt-3 rounded-lg px-3 py-2 text-xs flex items-center gap-2"
                 style={{ background: "var(--crm-card-soft)", border: "1px solid var(--crm-border)", color: "var(--crm-text-muted)" }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Conecte seu número acima para poder disparar.
            </div>
          )}
        </section>
      )}
    </Shell>
  );
}
