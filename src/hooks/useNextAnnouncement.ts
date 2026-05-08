import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Announcement } from "@/components/announcements/AnnouncementCard";

export function useNextAnnouncement(userId?: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["nextAnnouncement", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_next_announcement", { p_user_id: userId });
      if (error) {
        console.warn("[useNextAnnouncement]", error.message);
        return null;
      }
      return (data as Announcement | null) ?? null;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  function refetch() {
    qc.invalidateQueries({ queryKey: ["nextAnnouncement", userId] });
  }

  return { announcement: q.data ?? null, isLoading: q.isLoading, refetch };
}
