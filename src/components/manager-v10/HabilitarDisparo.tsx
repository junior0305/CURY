// HabilitarDisparo — o gestor liga o disparo para cada corretor da equipe e
// define a cota diária. O disparo do corretor sai pelo NÚMERO do gestor (owner_id
// = gestor), então sem número atrelado não há o que habilitar.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Corretor = {
  id: string;
  first_name: string | null;
  disparo_enabled: boolean | null;
  disparo_cota_diaria: number | null;
  last_seen_at: string | null;
};

export function HabilitarDisparo({ managerId }: { managerId?: string | null }) {
  const qc = useQueryClient();

  const { data: numero } = useQuery({
    queryKey: ["gestorNumeroDisparo", managerId],
    enabled: !!managerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_config")
        .select("id, label, display_number")
        .eq("owner_id", managerId)
        .eq("is_active", true)
        .limit(1);
      return data?.[0] || null;
    },
  });

  const { data: corretores = [], isLoading } = useQuery<Corretor[]>({
    queryKey: ["corretoresDisparo", managerId],
    enabled: !!managerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, disparo_enabled, disparo_cota_diaria, last_seen_at")
        .eq("manager_id", managerId)
        .eq("role", "BROKER")
        .order("first_name", { ascending: true });
      return (data as Corretor[]) || [];
    },
  });

  const salvar = async (id: string, patch: Partial<Corretor>) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) { toast.error("Não salvou: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["corretoresDisparo", managerId] });
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: "4px 0 6px" }}>Quem pode disparar</h2>
      <p style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 16 }}>
        Ligue o disparo por corretor e defina a cota diária. Todos usam o <b>seu número</b>
        {numero ? <> ({numero.label} · {numero.display_number})</> : null} — você mantém o controle.
      </p>

      {!numero && (
        <div className="card" style={{ borderColor: "var(--warn, #d97706)", background: "var(--warn-soft, #fff7ed)", marginBottom: 14 }}>
          <b>Atrele um número primeiro.</b> Na aba <b>Seu número</b>, conecte/assuma um número oficial.
          Sem número seu, o corretor não tem por onde disparar.
        </div>
      )}

      {isLoading ? (
        <div style={{ color: "var(--muted)", padding: 20 }}>Carregando equipe…</div>
      ) : !corretores.length ? (
        <div className="card" style={{ color: "var(--muted)" }}>Nenhum corretor na sua equipe ainda.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {corretores.map((c) => {
            const on = !!c.disparo_enabled;
            return (
              <div key={c.id} className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.first_name || "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {on ? `Liberado · ${c.disparo_cota_diaria || 0} disparos/dia` : "Bloqueado"}
                  </div>
                </div>

                {on && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
                    Cota/dia
                    <input
                      type="number" min={0} max={2000}
                      defaultValue={c.disparo_cota_diaria || 0}
                      onBlur={(e) => {
                        const v = Math.max(0, parseInt(e.target.value || "0", 10) || 0);
                        if (v !== (c.disparo_cota_diaria || 0)) salvar(c.id, { disparo_cota_diaria: v });
                      }}
                      style={{ width: 72, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontWeight: 700 }}
                      disabled={!numero}
                    />
                  </label>
                )}

                <button
                  onClick={() => salvar(c.id, { disparo_enabled: !on, disparo_cota_diaria: !on && !(c.disparo_cota_diaria) ? 50 : c.disparo_cota_diaria })}
                  disabled={!numero}
                  style={{
                    padding: "8px 14px", borderRadius: 10, fontWeight: 800, fontSize: 12.5, cursor: numero ? "pointer" : "not-allowed",
                    border: "1px solid " + (on ? "var(--border)" : "var(--accent, #0d9488)"),
                    background: on ? "var(--surface)" : "var(--accent, #0d9488)",
                    color: on ? "var(--muted)" : "#fff", opacity: numero ? 1 : 0.5, whiteSpace: "nowrap",
                  }}>
                  {on ? "Desligar" : "Habilitar"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
