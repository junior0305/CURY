import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy, Gift, CheckCircle2, Lock, Banknote, Clock, XCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";

const PRIZE_ICONS: Record<string, string> = { PIX: "💸", FOLGA: "🏖️", BONUS: "🎁" };
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

interface MyRewardsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MyRewardsModal = ({ isOpen, onOpenChange }: MyRewardsModalProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // 1. Fetch Active Campaigns
  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery({
    queryKey: ['my-active-campaigns'],
    queryFn: async () => {
      const { data } = await supabase
        .from('active_campaigns')
        .select('*')
        .eq('is_active', true);
      return data || [];
    }
  });

  // 2. Fetch My Performance for Campaigns
  const { data: campaignProgress = {}, isLoading: loadingProgress } = useQuery({
    queryKey: ['my-campaign-progress', user?.id],
    queryFn: async () => {
      if (!user?.id || campaigns.length === 0) return {};

      const progressMap: Record<string, number> = {};
      
      for (const campaign of campaigns) {
        // Count sales/visits based on CURRENT STATUS solely (Milestone Logic)
        // If the broker currently HAS 10 sales in their portfolio, they qualify, regardless of WHEN strictly.
        // This is robust for "First to Reach" or "Total Accumulated" campaigns.
        const { count } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('broker_id', user.id)
          .eq('status', campaign.target_action === 'SALE' ? 'CONCLUDED' : 'VISIT_SCHEDULED');
          // REMOVED DATE FILTER: This fixes the issue where a campaign created TODAY wouldn't count sales made YESTERDAY.
          // .gte('last_interaction_at', campaign.created_at) 
          // .lte('last_interaction_at', campaign.ends_at);
        
        progressMap[campaign.id] = count || 0;
      }
      return progressMap;
    },
    enabled: campaigns.length > 0 && !!user?.id
  });

  // 2b. Histórico de prêmios (prize_claims) — inclui pagamentos do admin
  const { data: prizeClaims = [], isLoading: loadingClaims } = useQuery({
    queryKey: ['my-prize-claims', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from('prize_claims')
        .select('id, prize_type, prize_value, prize_label, status, paid_at, notes, created_at')
        .eq('broker_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!user?.id,
  });

  // 3. Check if already redeemed
  const { data: redeemedCampaigns = [], isLoading: loadingRedeemed } = useQuery({
    queryKey: ['my-redeemed-campaigns', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from('achievements')
        .select('metadata')
        .eq('profile_id', user.id)
        .eq('reward_type', 'CAMPAIGN_REWARD');
      
      // Extract campaign IDs from metadata
      return data?.map((a: any) => a.metadata?.campaign_id).filter(Boolean) || [];
    },
    enabled: !!user?.id
  });

  // 4. Redeem Mutation
  const redeemMutation = useMutation({
    mutationFn: async (campaign: any) => {
      const { error } = await supabase.from('achievements').insert({
        profile_id: user?.id,
        reward_type: 'CAMPAIGN_REWARD',
        reward_value: campaign.reward_amount,
        reward_label: `Campanha: ${campaign.title}`,
        status: 'PENDING', // Needs Admin Approval
        metadata: { campaign_id: campaign.id }
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação enviada! Aguarde a aprovação do Admin.");
      queryClient.invalidateQueries({ queryKey: ['my-redeemed-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['pending-achievements'] }); // Refresh Admin
    },
    onError: (err: any) => toast.error("Erro ao solicitar: " + err.message)
  });

  const isLoading = loadingCampaigns || loadingProgress || loadingRedeemed || loadingClaims;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white rounded-3xl p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 text-white text-center">
          <Trophy className="w-12 h-12 mx-auto mb-2 text-yellow-300 animate-bounce" />
          <DialogTitle className="text-2xl font-black uppercase tracking-tight">Espólio de Guerra</DialogTitle>
          <DialogDescription className="text-indigo-100 font-medium">
            Suas conquistas e prêmios pendentes de resgate.
          </DialogDescription>
        </div>

        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* ── Histórico de Prêmios (prize_claims) ─────────────────────── */}
          {prizeClaims.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Meus Prêmios</h3>
              {prizeClaims.map((claim: any) => {
                const isPaid     = claim.status === 'PAID';
                const isApproved = claim.status === 'APPROVED';
                const isRejected = claim.status === 'REJECTED';
                return (
                  <div key={claim.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isPaid ? 'bg-emerald-50 border-emerald-200' : isApproved ? 'bg-blue-50 border-blue-200' : isRejected ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
                    <span className="text-2xl">{PRIZE_ICONS[claim.prize_type] || "🎁"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-800">{fmt(claim.prize_value)}</span>
                        <span className="text-slate-500 text-xs">— {claim.prize_label}</span>
                        {isPaid && <Badge className="bg-emerald-500 text-white text-[9px] gap-1"><Banknote className="w-2.5 h-2.5" /> PAGO {fmtDate(claim.paid_at)}</Badge>}
                        {isApproved && <Badge className="bg-blue-500 text-white text-[9px] gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> APROVADO</Badge>}
                        {isRejected && <Badge className="bg-red-500 text-white text-[9px] gap-1"><XCircle className="w-2.5 h-2.5" /> RECUSADO</Badge>}
                        {!isPaid && !isApproved && !isRejected && <Badge className="bg-yellow-500 text-white text-[9px] gap-1"><Clock className="w-2.5 h-2.5" /> AGUARDANDO</Badge>}
                      </div>
                      {claim.notes && <p className="text-[11px] text-slate-500 mt-0.5">{claim.notes}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Gift className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Nenhuma campanha ativa no momento.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-2">Campanhas Ativas</h3>
              {campaigns.map((campaign: any) => {
                const progress = campaignProgress[campaign.id] || 0;
                const target = campaign.target_count || 1;
                const percentage = Math.min((progress / target) * 100, 100);
                const isCompleted = progress >= target;
                const isRedeemed = redeemedCampaigns.includes(campaign.id);

                return (
                  <Card key={campaign.id} className="border-none shadow-md bg-slate-50 overflow-hidden relative group">
                    {/* Background Progress Bar */}
                    <div 
                      className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-1000" 
                      style={{ width: `${percentage}%` }} 
                    />

                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1 z-10">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-white text-indigo-600 border-indigo-100 font-black text-[9px] uppercase">
                            {campaign.target_action === 'SALE' ? 'VENDAS' : 'VISITAS'}
                          </Badge>
                          {isRedeemed && <Badge className="bg-emerald-500 text-white font-black text-[9px]">RESGATADO</Badge>}
                        </div>
                        <h4 className="font-bold text-slate-800">{campaign.title}</h4>
                        <p className="text-xs text-slate-500 font-medium">
                          Meta: <span className="text-indigo-600 font-bold">{progress}</span> / {target}
                        </p>
                      </div>

                      <div className="z-10">
                        {isRedeemed ? (
                          <div className="h-10 w-10 bg-emerald-100 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                          </div>
                        ) : isCompleted ? (
                          <Button 
                            size="sm" 
                            onClick={() => redeemMutation.mutate(campaign)}
                            disabled={redeemMutation.isPending}
                            className="bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white font-black shadow-lg shadow-orange-200 animate-pulse"
                          >
                            {redeemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "RESGATAR"}
                          </Button>
                        ) : (
                          <div className="h-10 w-10 bg-slate-200 rounded-full flex items-center justify-center">
                            <Lock className="w-5 h-5 text-slate-400" />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};