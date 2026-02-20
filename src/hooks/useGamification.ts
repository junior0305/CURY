import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

export interface BrokerXP {
  totalXp: number;
  level: number;
  levelName: string;
  xpForNext: number;
  xpInCurrentLevel: number;
  progressPercent: number;
}

export interface MissionTemplate {
  id: string;
  title: string;
  description: string;
  actionType: string;
  targetCount: number;
  xpReward: number;
  prizeType: string | null;
  prizeValue: number;
  prizeLabel: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
}

export interface DailyMission {
  id: string;
  templateId: string;
  title: string;
  description: string;
  actionType: string;
  progress: number;
  target: number;
  xpReward: number;
  prizeType: string | null;
  prizeValue: number;
  prizeLabel: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  completed: boolean;
  completedAt: string | null;
  prizeClaimed: boolean;
}

export interface PrizeClaim {
  id: string;
  prizeType: string;
  prizeValue: number;
  prizeLabel: string;
  status: "PENDING" | "APPROVED" | "PAID" | "REJECTED";
  createdAt: string;
}

const XP_THRESHOLDS = [0, 200, 500, 1000, 2000, 4000, 7000, 11000, 16000, 22000, 99999];
const LEVEL_NAMES = ["", "Recruta", "Soldado", "Cabo", "Sargento", "Tenente", "Capitão", "Major", "Coronel", "General", "Lenda"];

function calcXPStats(totalXp: number): BrokerXP {
  let level = 1;
  for (let i = 1; i < XP_THRESHOLDS.length - 1; i++) {
    if (totalXp >= XP_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  const xpStart = XP_THRESHOLDS[level - 1];
  const xpForNext = XP_THRESHOLDS[level];
  const xpInCurrentLevel = totalXp - xpStart;
  const rangeSize = xpForNext - xpStart;
  const progressPercent = level >= 10 ? 100 : Math.min(100, Math.floor((xpInCurrentLevel / rangeSize) * 100));
  return { totalXp, level, levelName: LEVEL_NAMES[level], xpForNext, xpInCurrentLevel, progressPercent };
}

export function useGamification(brokerId?: string) {
  const { user } = useAuth();
  const targetId = brokerId || user?.id;

  const [xpStats, setXpStats] = useState<BrokerXP | null>(null);
  const [missions, setMissions] = useState<DailyMission[]>([]);
  const [prizeClaims, setPrizeClaims] = useState<PrizeClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const prevXp = useRef<number>(-1);

  const loadXP = useCallback(async () => {
    if (!targetId) return;
    const { data } = await supabase
      .from("broker_xp")
      .select("total_xp")
      .eq("broker_id", targetId)
      .maybeSingle();

    const total = data?.total_xp ?? 0;
    // Só atualiza o estado se o valor mudou (evita re-renders desnecessários)
    if (total !== prevXp.current) {
      prevXp.current = total;
      setXpStats(calcXPStats(total));
    }
  }, [targetId]);

  const loadMissions = useCallback(async () => {
    if (!targetId) return;
    const today = new Date().toISOString().split("T")[0];

    const { data: existing } = await supabase
      .from("daily_missions")
      .select(`*, mission_templates(*)`)
      .eq("broker_id", targetId)
      .eq("date", today);

    if (!existing || existing.length === 0) {
      const { data: templates } = await supabase
        .from("mission_templates")
        .select("*")
        .eq("is_active", true);

      if (templates && templates.length > 0) {
        const easy   = templates.filter(t => t.difficulty === "EASY");
        const medium = templates.filter(t => t.difficulty === "MEDIUM");
        const hard   = templates.filter(t => t.difficulty === "HARD");
        const pick   = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
        const selected = [
          easy.length   > 0 ? pick(easy)   : null,
          medium.length > 0 ? pick(medium) : null,
          hard.length   > 0 ? pick(hard)   : null,
        ].filter(Boolean);

        if (selected.length > 0) {
          await supabase.from("daily_missions").insert(
            selected.map((t: any) => ({
              broker_id: targetId,
              template_id: t.id,
              date: today,
              progress: 0,
              target: t.target_count,
              completed: false,
            }))
          );
          return loadMissions();
        }
      }
      setMissions([]);
      return;
    }

    setMissions(existing.map((m: any) => ({
      id: m.id,
      templateId: m.template_id,
      title: m.mission_templates.title,
      description: m.mission_templates.description,
      actionType: m.mission_templates.action_type,
      progress: m.progress,
      target: m.target,
      xpReward: m.mission_templates.xp_reward,
      prizeType: m.mission_templates.prize_type,
      prizeValue: m.mission_templates.prize_value,
      prizeLabel: m.mission_templates.prize_label,
      difficulty: m.mission_templates.difficulty,
      completed: m.completed,
      completedAt: m.completed_at,
      prizeClaimed: m.prize_claimed,
    })));
  }, [targetId]);

  const loadPrizeClaims = useCallback(async () => {
    if (!targetId) return;
    const { data } = await supabase
      .from("prize_claims")
      .select("*")
      .eq("broker_id", targetId)
      .order("created_at", { ascending: false })
      .limit(10);
    setPrizeClaims((data || []).map((p: any) => ({
      id: p.id,
      prizeType: p.prize_type,
      prizeValue: p.prize_value,
      prizeLabel: p.prize_label,
      status: p.status,
      createdAt: p.created_at,
    })));
  }, [targetId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadXP(), loadMissions(), loadPrizeClaims()]);
    setLoading(false);
  }, [loadXP, loadMissions, loadPrizeClaims]);

  // Carga inicial
  useEffect(() => { loadAll(); }, [loadAll]);

  // ── POLLING DE XP A CADA 5 SEGUNDOS ──────────────────────────────────────
  // O realtime do Supabase não captura mudanças feitas por triggers do banco.
  // O polling garante que o XP aparece na tela em até 5s após qualquer ação.
  useEffect(() => {
    if (!targetId) return;
    const interval = setInterval(loadXP, 5000);
    return () => clearInterval(interval);
  }, [targetId, loadXP]);

  // ── Realtime para missões e prize_claims ──────────────────────────────────
  useEffect(() => {
    if (!targetId) return;
    const channel = supabase
      .channel(`gamification-${targetId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "broker_xp",
        filter: `broker_id=eq.${targetId}`,
      }, () => loadXP())
      .on("postgres_changes", {
        event: "*", schema: "public", table: "daily_missions",
        filter: `broker_id=eq.${targetId}`,
      }, () => loadMissions())
      .on("postgres_changes", {
        event: "*", schema: "public", table: "prize_claims",
        filter: `broker_id=eq.${targetId}`,
      }, () => loadPrizeClaims())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [targetId, loadXP, loadMissions, loadPrizeClaims]);

  // ── Funções expostas ──────────────────────────────────────────────────────
  const trackAction = useCallback(async (actionType: string) => {
    if (!targetId) return;
    const matchingMissions = missions.filter(
      m => m.actionType === actionType && !m.completed
    );
    for (const mission of matchingMissions) {
      const newProgress = mission.progress + 1;
      const nowComplete = newProgress >= mission.target;
      await supabase.from("daily_missions").update({
        progress: newProgress,
        completed: nowComplete,
        completed_at: nowComplete ? new Date().toISOString() : null,
      }).eq("id", mission.id);

      if (nowComplete) {
        await supabase.rpc("add_xp", {
          p_broker_id: targetId,
          p_amount: mission.xpReward,
          p_reason: "MISSION_COMPLETE",
          p_metadata: { mission_id: mission.id, title: mission.title },
        });
        if (mission.prizeType && mission.prizeValue > 0) {
          await supabase.from("prize_claims").insert({
            broker_id: targetId,
            mission_id: mission.id,
            prize_type: mission.prizeType,
            prize_value: mission.prizeValue,
            prize_label: mission.prizeLabel || mission.prizeType,
            status: "PENDING",
          });
        }
      }
    }
    await loadMissions();
    await loadXP();
  }, [targetId, missions, loadMissions, loadXP]);

  const awardXP = useCallback(async (amount: number, reason: string) => {
    if (!targetId) return;
    await supabase.rpc("add_xp", {
      p_broker_id: targetId,
      p_amount: amount,
      p_reason: reason,
      p_metadata: {},
    });
    await loadXP();
  }, [targetId, loadXP]);

  return { xpStats, missions, prizeClaims, loading, trackAction, awardXP, reload: loadAll };
}
