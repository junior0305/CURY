import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DollarSign, Plus, Pencil, Trash2, Trophy, Target,
  TrendingUp, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Campaign {
  id: string;
  title: string;
  target_action: string;
  target_count: number;
  reward_amount: number;
  is_active: boolean;
  ends_at: string | null;
  created_at: string;
}

interface Investment {
  id: string;
  team_id: string | null;
  investor_id: string | null;
  amount: number;
  category: string;
  description: string | null;
  investment_date: string;
  created_at: string;
}

interface Team { id: string; name: string; }
interface Profile { id: string; first_name: string | null; last_name: string | null; email: string | null; }

const TARGET_ACTIONS = [
  { value: "SALE", label: "🏆 Venda realizada" },
  { value: "CONTACT", label: "📞 Contato efetuado" },
  { value: "MEETING", label: "🤝 Reunião agendada" },
  { value: "PROPOSAL", label: "📄 Proposta enviada" },
  { value: "LEAD_RECEIVED", label: "📥 Lead recebido" },
];

const CATEGORIES = ["Marketing", "Treinamento", "Infraestrutura", "Bonificação", "Outros"];

type Tab = "campaigns" | "investments";

export default function Economia() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("campaigns");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Campaign form
  const [campModal, setCampModal] = useState(false);
  const [editCamp, setEditCamp] = useState<Campaign | null>(null);
  const [deleteCamp, setDeleteCamp] = useState<Campaign | null>(null);
  const [cTitle, setCTitle] = useState("");
  const [cAction, setCAction] = useState("SALE");
  const [cCount, setCCount] = useState("1");
  const [cReward, setCReward] = useState("");
  const [cEndsAt, setCEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

  // Investment form
  const [invModal, setInvModal] = useState(false);
  const [editInv, setEditInv] = useState<Investment | null>(null);
  const [deleteInv, setDeleteInv] = useState<Investment | null>(null);
  const [iTeam, setITeam] = useState("");
  const [iInvestor, setIInvestor] = useState("");
  const [iAmount, setIAmount] = useState("");
  const [iCategory, setICategory] = useState("Marketing");
  const [iDesc, setIDesc] = useState("");
  const [iDate, setIDate] = useState(new Date().toISOString().split("T")[0]);

  const loadData = async () => {
    setLoading(true);
    const [{ data: c }, { data: inv }, { data: t }, { data: p }] = await Promise.all([
      supabase.from("active_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("team_investments").select("*").order("investment_date", { ascending: false }),
      supabase.from("teams").select("id,name").order("name"),
      supabase.from("profiles").select("id,first_name,last_name,email").order("first_name"),
    ]);
    setCampaigns(c || []);
    setInvestments(inv || []);
    setTeams(t || []);
    setProfiles(p || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // ─── Campaigns ───────────────────────────────────────────────────────────────
  const resetCampForm = () => { setCTitle(""); setCAction("SALE"); setCCount("1"); setCReward(""); setCEndsAt(""); };

  const openCreateCamp = () => { setEditCamp(null); resetCampForm(); setCampModal(true); };
  const openEditCamp = (c: Campaign) => {
    setEditCamp(c); setCTitle(c.title); setCAction(c.target_action);
    setCCount(String(c.target_count)); setCReward(String(c.reward_amount));
    setCEndsAt(c.ends_at ? c.ends_at.split("T")[0] : ""); setCampModal(true);
  };

  const handleSaveCamp = async () => {
    if (!cTitle.trim() || !cReward) return toast({ title: "Preencha título e recompensa", variant: "destructive" });
    setSaving(true);
    const payload = {
      title: cTitle.trim(), target_action: cAction,
      target_count: parseInt(cCount) || 1, reward_amount: parseFloat(cReward) || 0,
      ends_at: cEndsAt || null,
    };
    const { error } = editCamp
      ? await supabase.from("active_campaigns").update(payload).eq("id", editCamp.id)
      : await supabase.from("active_campaigns").insert({ ...payload, is_active: true });
    setSaving(false);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: editCamp ? "✅ Campanha atualizada!" : "✅ Campanha criada!" });
    setCampModal(false); loadData();
  };

  const handleDeleteCamp = async () => {
    if (!deleteCamp) return;
    await supabase.from("active_campaigns").delete().eq("id", deleteCamp.id);
    toast({ title: "🗑️ Campanha removida." });
    setDeleteCamp(null); loadData();
  };

  const toggleCampActive = async (c: Campaign) => {
    await supabase.from("active_campaigns").update({ is_active: !c.is_active }).eq("id", c.id);
    loadData();
  };

  // ─── Investments ──────────────────────────────────────────────────────────────
  const resetInvForm = () => { setITeam(""); setIInvestor(""); setIAmount(""); setICategory("Marketing"); setIDesc(""); setIDate(new Date().toISOString().split("T")[0]); };

  const openCreateInv = () => { setEditInv(null); resetInvForm(); setInvModal(true); };
  const openEditInv = (i: Investment) => {
    setEditInv(i); setITeam(i.team_id || ""); setIInvestor(i.investor_id || "");
    setIAmount(String(i.amount)); setICategory(i.category); setIDesc(i.description || "");
    setIDate(i.investment_date); setInvModal(true);
  };

  const handleSaveInv = async () => {
    if (!iAmount || !iTeam) return toast({ title: "Preencha equipe e valor", variant: "destructive" });
    setSaving(true);
    const payload = {
      team_id: iTeam, investor_id: iInvestor || null,
      amount: parseFloat(iAmount) || 0, category: iCategory,
      description: iDesc || null, investment_date: iDate,
    };
    const { error } = editInv
      ? await supabase.from("team_investments").update(payload).eq("id", editInv.id)
      : await supabase.from("team_investments").insert(payload);
    setSaving(false);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: editInv ? "✅ Investimento atualizado!" : "✅ Investimento registrado!" });
    setInvModal(false); loadData();
  };

  const handleDeleteInv = async () => {
    if (!deleteInv) return;
    await supabase.from("team_investments").delete().eq("id", deleteInv.id);
    toast({ title: "🗑️ Investimento removido." });
    setDeleteInv(null); loadData();
  };

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
  const teamName = (id: string | null) => teams.find(t => t.id === id)?.name || "—";
  const profileName = (id: string | null) => {
    const p = profiles.find(p => p.id === id);
    return p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email : "—";
  };

  const totalInvested = investments.reduce((s, i) => s + i.amount, 0);
  const activeCamps = campaigns.filter(c => c.is_active).length;

  // Group investments by team
  const byTeam = teams.map(t => ({
    team: t,
    total: investments.filter(i => i.team_id === t.id).reduce((s, i) => s + i.amount, 0),
    items: investments.filter(i => i.team_id === t.id),
  })).filter(g => g.items.length > 0);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <DollarSign className="w-10 h-10 text-yellow-400 animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <DollarSign className="w-7 h-7 text-yellow-400" />
            Economia de Guerra
          </h2>
          <p className="text-gray-500 text-sm mt-1">Campanhas de incentivo e espólios por equipe</p>
        </div>
        <Button onClick={tab === "campaigns" ? openCreateCamp : openCreateInv}
          className="bg-yellow-600 hover:bg-yellow-500 font-bold gap-2 text-black">
          <Plus className="w-4 h-4" />
          {tab === "campaigns" ? "Nova Campanha" : "Registrar Investimento"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Campanhas Ativas", value: activeCamps, icon: Trophy, color: "text-yellow-400" },
          { label: "Total Investido", value: fmt(totalInvested), icon: TrendingUp, color: "text-green-400" },
          { label: "Equipes", value: byTeam.length, icon: Target, color: "text-blue-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-800/40 border border-gray-700/50 rounded-xl p-4 flex items-center gap-3">
            <Icon className={`w-8 h-8 shrink-0 ${color}`} />
            <div>
              <p className={`text-xl font-black ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab("campaigns")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "campaigns" ? "bg-yellow-900/40 text-yellow-300 border border-yellow-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Trophy className="w-4 h-4" /> Campanhas ({campaigns.length})
        </button>
        <button onClick={() => setTab("investments")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "investments" ? "bg-green-900/40 text-green-300 border border-green-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <TrendingUp className="w-4 h-4" /> Espólios ({investments.length})
        </button>
      </div>

      {/* ─── Campanhas ─────────────────────────────────────────────────────── */}
      {tab === "campaigns" && (
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhuma campanha criada ainda.</p>
            </div>
          ) : campaigns.map(c => {
            const action = TARGET_ACTIONS.find(a => a.value === c.target_action);
            const expired = c.ends_at && new Date(c.ends_at) < new Date();
            return (
              <div key={c.id} className={`border rounded-xl p-4 transition-all ${c.is_active && !expired ? "border-yellow-500/40 bg-slate-800/40" : "border-gray-700/30 bg-slate-900/30 opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-white font-black text-lg">{c.title}</span>
                      {c.is_active && !expired
                        ? <Badge className="bg-green-900/40 text-green-300 border-green-500/30 gap-1"><CheckCircle2 className="w-3 h-3" />Ativa</Badge>
                        : <Badge className="bg-gray-800 text-gray-400 gap-1"><XCircle className="w-3 h-3" />{expired ? "Expirada" : "Inativa"}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <span className="text-gray-400">{action?.label || c.target_action}</span>
                      <span className="text-gray-600">•</span>
                      <span className="text-gray-400">Meta: <span className="text-white font-bold">{c.target_count}x</span></span>
                      <span className="text-gray-600">•</span>
                      <span className="text-yellow-400 font-bold">{fmt(c.reward_amount)}</span>
                      {c.ends_at && (
                        <>
                          <span className="text-gray-600">•</span>
                          <span className={`flex items-center gap-1 text-xs ${expired ? "text-red-400" : "text-gray-400"}`}>
                            <Clock className="w-3 h-3" /> até {fmtDate(c.ends_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => toggleCampActive(c)}
                      className={`h-8 px-2 text-xs font-bold ${c.is_active ? "text-green-400 hover:text-red-400 hover:bg-red-900/20" : "text-gray-500 hover:text-green-400 hover:bg-green-900/20"}`}>
                      {c.is_active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEditCamp(c)} className="h-8 w-8 p-0 text-gray-400 hover:text-white"><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteCamp(c)} className="h-8 w-8 p-0 text-gray-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Investimentos ─────────────────────────────────────────────────── */}
      {tab === "investments" && (
        <div className="space-y-4">
          {investments.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum investimento registrado ainda.</p>
            </div>
          ) : (
            <>
              {/* Por equipe */}
              {byTeam.map(({ team, total, items }) => (
                <div key={team.id} className="border border-green-500/30 rounded-xl overflow-hidden">
                  <div className="bg-green-900/20 px-4 py-3 flex items-center justify-between">
                    <span className="text-green-300 font-bold">{team.name}</span>
                    <span className="text-green-400 font-black">{fmt(total)}</span>
                  </div>
                  <div className="divide-y divide-gray-700/30">
                    {items.map(inv => (
                      <div key={inv.id} className="flex items-center gap-3 px-4 py-3 bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">{inv.category}</Badge>
                            {inv.description && <span className="text-white text-sm">{inv.description}</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {fmtDate(inv.investment_date)}
                            {inv.investor_id && ` • ${profileName(inv.investor_id)}`}
                          </p>
                        </div>
                        <span className="text-green-400 font-bold text-sm shrink-0">{fmt(inv.amount)}</span>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => openEditInv(inv)} className="h-7 w-7 p-0 text-gray-500 hover:text-white"><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteInv(inv)} className="h-7 w-7 p-0 text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ─── Modal Campanha ───────────────────────────────────────────────────── */}
      <Dialog open={campModal} onOpenChange={setCampModal}>
        <DialogContent className="bg-slate-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              {editCamp ? "Editar Campanha" : "Nova Campanha"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Título *</Label>
              <Input value={cTitle} onChange={e => setCTitle(e.target.value)} placeholder="Ex: Sprint de Vendas Julho" className="bg-slate-800 border-gray-600 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Ação alvo</Label>
                <select value={cAction} onChange={e => setCAction(e.target.value)} className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2 text-sm">
                  {TARGET_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Meta (quantidade)</Label>
                <Input value={cCount} onChange={e => setCCount(e.target.value)} type="number" min="1" placeholder="1" className="bg-slate-800 border-gray-600 text-white" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Recompensa (R$) *</Label>
                <Input value={cReward} onChange={e => setCReward(e.target.value)} type="number" step="0.01" placeholder="500.00" className="bg-slate-800 border-gray-600 text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Válida até</Label>
                <Input value={cEndsAt} onChange={e => setCEndsAt(e.target.value)} type="date" className="bg-slate-800 border-gray-600 text-white" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setCampModal(false)} className="flex-1 border-gray-600 text-gray-300">Cancelar</Button>
              <Button onClick={handleSaveCamp} disabled={saving} className="flex-1 bg-yellow-600 hover:bg-yellow-500 font-bold text-black">
                {saving ? "Salvando..." : editCamp ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Investimento ───────────────────────────────────────────────── */}
      <Dialog open={invModal} onOpenChange={setInvModal}>
        <DialogContent className="bg-slate-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              {editInv ? "Editar Investimento" : "Registrar Investimento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Equipe *</Label>
                <select value={iTeam} onChange={e => setITeam(e.target.value)} className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2 text-sm">
                  <option value="">Selecionar...</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Valor (R$) *</Label>
                <Input value={iAmount} onChange={e => setIAmount(e.target.value)} type="number" step="0.01" placeholder="1000.00" className="bg-slate-800 border-gray-600 text-white" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Categoria</Label>
                <select value={iCategory} onChange={e => setICategory(e.target.value)} className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2 text-sm">
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Data</Label>
                <Input value={iDate} onChange={e => setIDate(e.target.value)} type="date" className="bg-slate-800 border-gray-600 text-white" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Responsável (opcional)</Label>
              <select value={iInvestor} onChange={e => setIInvestor(e.target.value)} className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2 text-sm">
                <option value="">Nenhum</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{`${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Descrição (opcional)</Label>
              <Input value={iDesc} onChange={e => setIDesc(e.target.value)} placeholder="Ex: Verba de marketing Q3" className="bg-slate-800 border-gray-600 text-white" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setInvModal(false)} className="flex-1 border-gray-600 text-gray-300">Cancelar</Button>
              <Button onClick={handleSaveInv} disabled={saving} className="flex-1 bg-green-600 hover:bg-green-500 font-bold">
                {saving ? "Salvando..." : editInv ? "Salvar" : "Registrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AlertDialogs delete */}
      <AlertDialog open={!!deleteCamp} onOpenChange={o => !o && setDeleteCamp(null)}>
        <AlertDialogContent className="bg-slate-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400 flex items-center gap-2"><Trash2 className="w-5 h-5" />Excluir Campanha</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">Excluir <strong className="text-white">{deleteCamp?.title}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600 text-gray-300 hover:bg-slate-800">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCamp} className="bg-red-600 hover:bg-red-500 font-bold">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteInv} onOpenChange={o => !o && setDeleteInv(null)}>
        <AlertDialogContent className="bg-slate-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400 flex items-center gap-2"><Trash2 className="w-5 h-5" />Excluir Investimento</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">Confirma exclusão do investimento de <strong className="text-white">{investments.find(i => i.id === deleteInv?.id) ? fmt(deleteInv!.amount) : ""}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600 text-gray-300 hover:bg-slate-800">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInv} className="bg-red-600 hover:bg-red-500 font-bold">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
