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

      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <b>Próximo passo (em construção):</b> depois de conectar, você vai mapear cada
        <b> formulário → fila → corretores</b>, e ligar o <b>CAPI</b> (otimização de anúncios)
        reaproveitando esta mesma conexão.
      </div>
    </div>
  );
}
