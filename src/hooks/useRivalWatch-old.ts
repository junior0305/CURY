import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";

// Escuta mudanças de XP no ranking e notifica quando alguém ultrapassa o usuário
export function useRivalWatch(enabled = true) {
  const { user } = useAuth();
  const myRankRef = useRef<number | null>(null);
  const myXpRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !user?.id) return;

    // Carregar ranking inicial
    const loadMyRank = async () => {
      const { data } = await supabase
        .from("broker_xp")
        .select("broker_id, total_xp")
        .order("total_xp", { ascending: false });

      if (!data) return;
      const myIdx = data.findIndex(d => d.broker_id === user.id);
      myRankRef.current = myIdx + 1;
      const myData = data.find(d => d.broker_id === user.id);
      myXpRef.current = myData?.total_xp || 0;
    };

    loadMyRank();

    // Escutar mudanças no XP de qualquer broker
    const channel = supabase
      .channel("rival-watch")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "broker_xp",
      }, async (payload) => {
        if (payload.new.broker_id === user.id) return; // ignora próprio XP

        // Recarregar ranking
        const { data } = await supabase
          .from("broker_xp")
          .select("broker_id, total_xp")
          .order("total_xp", { ascending: false });

        if (!data) return;

        const newMyIdx = data.findIndex(d => d.broker_id === user.id);
        const newMyRank = newMyIdx + 1;

        // Se meu rank piorou, alguém me ultrapassou
        if (myRankRef.current !== null && newMyRank > myRankRef.current) {
          // Descobrir quem me ultrapassou
          const rivalId = payload.new.broker_id;
          const { data: rivalProfile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", rivalId)
            .maybeSingle();

          const rivalName = rivalProfile
            ? `${rivalProfile.first_name || ""} ${rivalProfile.last_name || ""}`.trim()
            : "Um rival";

          toast.warning(`⚔️ ${rivalName} te ultrapassou no ranking!`, {
            description: `Você caiu para ${newMyRank}º lugar. Hora de reagir!`,
            duration: 6000,
            action: {
              label: "Ver ranking",
              onClick: () => {},
            },
          });
        }

        myRankRef.current = newMyRank;
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, enabled]);
}
