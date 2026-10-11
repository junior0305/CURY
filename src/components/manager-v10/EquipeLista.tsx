// "Minha equipe": os corretores cadastrados do gerente, com as duas ações de
// cadastro à vista — resetar a senha (volta para mudar@123, troca no próximo
// acesso) e desligar (separa a carteira; ver DesligarCorretor).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sec } from "@/components/manager-v10/ui";
import DesligarCorretor from "@/components/manager-v10/DesligarCorretor";

type Pessoa = { id: string; first_name: string | null; last_name: string | null; email: string | null;
  last_seen_at: string | null; lead_assignment_enabled: boolean | null; must_change_password: boolean | null };

const quando = (iso: string | null) => {
  if (!iso) return "nunca entrou";
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  return h < 0.25 ? "online agora" : h < 24 ? `entrou há ${Math.round(h)}h` : `entrou há ${Math.round(h / 24)}d`;
};

export default function EquipeLista({ managerId }: { managerId: string | undefined }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [desligar, setDesligar] = useState<string | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["equipe-lista", managerId],
    enabled: !!managerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("id,first_name,last_name,email,last_seen_at,lead_assignment_enabled,must_change_password")
        .eq("manager_id", managerId!).eq("role", "BROKER").eq("is_active", true).order("first_name");
      return (data ?? []) as Pessoa[];
    },
  });
  if (!data.length) return null;

  async function resetar(p: Pessoa) {
    setOcupado(p.id);
    try {
      const { data: r, error } = await supabase.functions.invoke("create-user", { body: { action: "reset-password", userId: p.id } });
      if (error || (r as any)?.error) throw new Error((r as any)?.error || error?.message);
      toast.success(`Senha de ${p.first_name} voltou para mudar@123 — troca no próximo acesso`);
      qc.invalidateQueries({ queryKey: ["equipe-lista", managerId] });
    } catch (e: any) { toast.error(e?.message ?? "Não consegui resetar."); }
    finally { setOcupado(null); }
  }

  return (
    <Sec title="Minha equipe" tag={<span className="dim">{data.length} corretores</span>}>
      <div className="panel">
        {data.map((p) => (
          <div key={p.id} className="item" style={{ flexWrap: "wrap" }}>
            <span className={`pip${p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 9e5 ? " ok" : ""}`} />
            <div className="item-b">
              <b>{[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}</b>
              <span>{p.email ?? "—"} · {quando(p.last_seen_at)}
                {p.lead_assignment_enabled === false ? <> · <em>fora da roleta</em></> : null}
                {p.must_change_password ? <> · <em>senha provisória</em></> : null}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button className="mini key" disabled={ocupado === p.id} onClick={() => resetar(p)}>
                {ocupado === p.id ? "…" : "Resetar senha"}</button>
              <button className="mini" style={{ color: "var(--red)" }} onClick={() => setDesligar(p.id)}>Desligar</button>
            </div>
          </div>
        ))}
      </div>
      {desligar ? (
        <DesligarCorretor brokerId={desligar} onFechar={() => setDesligar(null)}
          onPronto={() => { setDesligar(null); qc.invalidateQueries({ queryKey: ["equipe-lista", managerId] }); }} />
      ) : null}
    </Sec>
  );
}
