// Integrações → Facebook Lead Ads: o cliente conecta a Página dele e os leads
// passam a cair sozinhos (substitui o Make). Fase 1: conectar + ver páginas.
// Fase 2 (próxima): mapear formulário → fila → corretores, e o CAPI.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Facebook, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

type Page = {
  page_id: string; page_name: string | null; subscribed: boolean;
  connected_at: string; last_lead_at: string | null;
};

export default function IntegracaoFacebook() {
  const { session } = useAuth();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  const base = `${window.location.origin}/supabase/functions/v1/fb-connect-callback`;

  async function carregar() {
    setLoading(true);
    const { data } = await supabase.from("fb_connected_pages")
      .select("page_id,page_name,subscribed,connected_at,last_lead_at")
      .order("connected_at", { ascending: false });
    setPages((data as Page[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  // mensagem de retorno (?fb=ok|erro&msg=...)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const fb = p.get("fb");
    if (fb) {
      const msg = p.get("msg") || "";
      fb === "ok" ? toast.success(msg || "Facebook conectado.") : toast.error(msg || "Falha ao conectar.");
      // limpa a URL
      window.history.replaceState({}, "", window.location.pathname);
      carregar();
    }
  }, []);

  const conectar = () => {
    const uid = session?.user?.id ?? "";
    window.location.href = `${base}?mode=start&state=${encodeURIComponent(uid)}`;
  };

  const temConexao = pages.length > 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Facebook className="h-5 w-5 text-blue-600" /> Facebook Lead Ads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conecte a Página do Facebook e os leads de qualquer campanha caem aqui
            sozinhos — sem configurar nada por campanha.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="rounded-xl border p-5 bg-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">
              {temConexao ? "Facebook conectado" : "Conecte seu Facebook"}
            </div>
            <div className="text-sm text-muted-foreground">
              {temConexao
                ? "Você pode conectar mais páginas quando quiser."
                : "Clique para entrar com o Facebook e escolher as páginas que recebem leads."}
            </div>
          </div>
          <Button onClick={conectar} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Facebook className="h-4 w-4 mr-2" />
            {temConexao ? "Conectar mais páginas" : "Conectar Facebook"}
          </Button>
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Páginas conectadas</div>
        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> carregando…
          </div>
        ) : !pages.length ? (
          <div className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
            Nenhuma página conectada ainda. Clique em <b>Conectar Facebook</b> acima.
          </div>
        ) : (
          <div className="space-y-2">
            {pages.map((p) => (
              <div key={p.page_id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">{p.page_name || p.page_id}</div>
                  <div className="text-xs text-muted-foreground">
                    conectada {new Date(p.connected_at).toLocaleDateString("pt-BR")}
                    {p.last_lead_at ? ` · último lead ${new Date(p.last_lead_at).toLocaleDateString("pt-BR")}` : ""}
                  </div>
                </div>
                {p.subscribed ? (
                  <Badge className="bg-green-100 text-green-700 border-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> recebendo leads
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    <AlertCircle className="h-3 w-3 mr-1" /> não assinada
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {temConexao ? <MapaFormularios /> : null}

      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <b>Em breve:</b> ligar o <b>CAPI</b> (otimização de anúncios) reaproveitando esta conexão.
      </div>
    </div>
  );
}

// Mapa formulário → corretores. Cada formulário vira uma "fila" (distribution_queue)
// com os corretores marcados. Sem corretor = cai na distribuição padrão.
function MapaFormularios() {
  const [paginas, setPaginas] = useState<any[]>([]);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [mapa, setMapa] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    const [{ data: fb }, { data: brk }] = await Promise.all([
      supabase.functions.invoke("fb-forms", { body: {} }),
      supabase.from("profiles").select("id,first_name,last_name").eq("role", "BROKER").eq("is_active", true).order("first_name"),
    ]);
    const pags = ((fb as any)?.paginas ?? []) as any[];
    setPaginas(pags);
    setBrokers((brk as any[]) ?? []);
    const m: Record<string, string[]> = {};
    for (const p of pags) for (const f of (p.forms ?? [])) m[f.id] = f.broker_ids ?? [];
    setMapa(m);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  async function toggle(formId: string, brokerId: string) {
    const s = new Set(mapa[formId] ?? []);
    s.has(brokerId) ? s.delete(brokerId) : s.add(brokerId);
    const arr = [...s];
    setMapa((m) => ({ ...m, [formId]: arr }));
    setBusy(formId);
    const { data, error } = await supabase.functions.invoke("fb-map-form", { body: { form_id: formId, broker_ids: arr } });
    setBusy(null);
    if (error || (data as any)?.error) toast.error("Não consegui salvar.");
  }

  const nomeBroker = (b: any) => [b.first_name, b.last_name].filter(Boolean).join(" ") || "—";
  if (loading) return <div className="text-sm text-muted-foreground">carregando formulários…</div>;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Formulários → quem recebe</div>
        <div className="text-xs text-muted-foreground">Marque os corretores de cada formulário. Sem corretor marcado, o lead cai na distribuição padrão.</div>
      </div>
      {!paginas.length ? (
        <div className="text-sm text-muted-foreground">Conecte uma página primeiro.</div>
      ) : paginas.map((p) => (
        <div key={p.page_id}>
          <div className="text-xs font-semibold text-muted-foreground mb-1">{p.page_name}</div>
          {p.erro ? <div className="text-xs text-amber-600 mb-1">{p.erro}</div> : null}
          <div className="space-y-2">
            {(p.forms ?? []).map((f: any) => (
              <div key={f.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{f.name}</div>
                  {busy === f.id ? (
                    <span className="text-xs text-muted-foreground">salvando…</span>
                  ) : (mapa[f.id]?.length ? (
                    <Badge className="bg-green-100 text-green-700 border-green-200">{mapa[f.id].length} corretor(es)</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">→ distribuição padrão</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {brokers.map((b) => {
                    const on = (mapa[f.id] ?? []).includes(b.id);
                    return (
                      <button key={b.id} type="button" onClick={() => toggle(f.id, b.id)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? "bg-blue-600 text-white border-blue-600" : "bg-background text-foreground hover:bg-muted"}`}>
                        {nomeBroker(b)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
