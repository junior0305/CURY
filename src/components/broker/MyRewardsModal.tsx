import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy, Gift, CheckCircle2, Lock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";

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
        // Count sales/visits within campaign period
        const { count } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('broker_id', user.id)
          .eq('status', campaign.target_action === 'SALE' ? 'CONCLUDED' : 'VISIT_SCHEDULED') // Simplified logic: Status matches action
          .gte('created_at', campaign.created_at) // Assuming campaign starts at creation
          .lte('created_at', campaign.ends_at);
        
        progressMap[campaign.id] = count || 0;
      }
      return progressMap;
    },
    enabled: campaigns.length > 0 && !!user?.id
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

  const isLoading = loadingCampaigns || loadingProgress || loadingRedeemed;

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
