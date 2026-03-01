import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  Search,
  Bot,
  User,
  TrendingUp,
  TrendingDown,
  Minus,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Filter,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Conversation {
  id: string;
  campaign_id: string | null;
  bot_instance_id: string | null;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string;
  status: string;
  sentiment: string | null;
  interest_level: number | null;
  messages_count: number;
  started_at: string;
  last_message_at: string | null;
  bot_name?: string;
  campaign_name?: string;
}

interface Message {
  id: string;
  message_text: string;
  direction: string;
  sender_type: string;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  ai_confidence: number | null;
}

export default function Conversas() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSentiment, setFilterSentiment] = useState("all");

  const loadConversations = async () => {
    setLoading(true);
    
    let query = supabase
      .from("ia_conversations")
      .select(`
        *,
        bot_instances!ia_conversations_bot_instance_id_fkey(name),
        ia_campaigns!ia_conversations_campaign_id_fkey(name)
      `)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (filterStatus !== "all") {
      query = query.eq("status", filterStatus);
    }

    if (filterSentiment !== "all") {
      query = query.eq("sentiment", filterSentiment);
    }

    const { data, error } = await query;

    if (error) {
      toast({ title: "Erro ao carregar conversas", description: error.message, variant: "destructive" });
    } else {
      const enriched = (data || []).map(conv => ({
        ...conv,
        bot_name: (conv as any).bot_instances?.name || "N/A",
        campaign_name: (conv as any).ia_campaigns?.name || "N/A",
      }));
      setConversations(enriched);
    }
    
    setLoading(false);
  };

  const loadMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from("ia_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Erro ao carregar mensagens", description: error.message, variant: "destructive" });
    } else {
      setMessages(data || []);
    }
  };

  useEffect(() => {
    loadConversations();

    const channel = supabase
      .channel("conversations_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "ia_conversations" }, () => {
        loadConversations();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ia_messages" }, (payload) => {
        if (selectedConversation && payload.new.conversation_id === selectedConversation.id) {
          setMessages(prev => [...prev, payload.new as Message]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterStatus, filterSentiment]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  const getSentimentBadge = (sentiment: string | null) => {
    if (!sentiment) return <Badge variant="secondary" className="text-xs">Desconhecido</Badge>;
    
    const styles = {
      positive: { icon: TrendingUp, bg: "bg-green-900/40", text: "text-green-300", border: "border-green-500/30", label: "Positivo" },
      neutral: { icon: Minus, bg: "bg-yellow-900/40", text: "text-yellow-300", border: "border-yellow-500/30", label: "Neutro" },
      negative: { icon: TrendingDown, bg: "bg-red-900/40", text: "text-red-300", border: "border-red-500/30", label: "Negativo" },
      unknown: { icon: AlertCircle, bg: "bg-gray-900/40", text: "text-gray-400", border: "border-gray-500/30", label: "Desconhecido" },
    };

    const style = styles[sentiment as keyof typeof styles] || styles.unknown;
    const Icon = style.icon;

    return (
      <Badge className={`${style.bg} ${style.text} border ${style.border} gap-1 text-xs`}>
        <Icon className="w-3 h-3" />
        {style.label}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      active: { bg: "bg-green-900/40", text: "text-green-300", border: "border-green-500/30", label: "Ativa" },
      waiting_response: { bg: "bg-yellow-900/40", text: "text-yellow-300", border: "border-yellow-500/30", label: "Aguardando" },
      qualified: { bg: "bg-blue-900/40", text: "text-blue-300", border: "border-blue-500/30", label: "Qualificado" },
      not_interested: { bg: "bg-red-900/40", text: "text-red-300", border: "border-red-500/30", label: "Sem Interesse" },
      escalated: { bg: "bg-purple-900/40", text: "text-purple-300", border: "border-purple-500/30", label: "Escalado" },
      closed: { bg: "bg-gray-900/40", text: "text-gray-400", border: "border-gray-500/30", label: "Fechada" },
    };

    const style = styles[status as keyof typeof styles] || styles.active;
    return <Badge className={`${style.bg} ${style.text} border ${style.border} text-xs`}>{style.label}</Badge>;
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Agora";
    if (minutes < 60) return `${minutes}m atrás`;
    if (hours < 24) return `${hours}h atrás`;
    return `${days}d atrás`;
  };

  const filteredConversations = conversations.filter(conv =>
    !search ||
    conv.lead_name?.toLowerCase().includes(search.toLowerCase()) ||
    conv.lead_phone.includes(search)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="w-10 h-10 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-2 border-purple-500/30 bg-purple-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-purple-400" />
              Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">
              {conversations.filter(c => c.status === "active").length}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-green-500/30 bg-green-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              Positivas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">
              {conversations.filter(c => c.sentiment === "positive").length}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-500/30 bg-blue-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              Qualificados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">
              {conversations.filter(c => c.status === "qualified").length}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-orange-500/30 bg-orange-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-orange-400" />
              Mensagens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">
              {conversations.reduce((sum, c) => sum + c.messages_count, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="pl-10 bg-slate-800 border-gray-700 text-white"
          />
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px] bg-slate-800 border-gray-700 text-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-gray-700">
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="waiting_response">Aguardando</SelectItem>
            <SelectItem value="qualified">Qualificados</SelectItem>
            <SelectItem value="not_interested">Sem Interesse</SelectItem>
            <SelectItem value="escalated">Escalados</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterSentiment} onValueChange={setFilterSentiment}>
          <SelectTrigger className="w-[180px] bg-slate-800 border-gray-700 text-white">
            <SelectValue placeholder="Sentimento" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-gray-700">
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="positive">Positivo</SelectItem>
            <SelectItem value="neutral">Neutro</SelectItem>
            <SelectItem value="negative">Negativo</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={loadConversations} variant="outline" className="border-gray-600 text-gray-300 hover:bg-slate-800">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Layout Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
        {/* Lista de Conversas */}
        <Card className="lg:col-span-1 border-2 border-gray-700/50 bg-slate-800/40 overflow-hidden flex flex-col">
          <CardHeader className="pb-3 border-b border-gray-700/50">
            <CardTitle className="text-white text-sm font-bold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-purple-400" />
              Conversas ({filteredConversations.length})
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {filteredConversations.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Nenhuma conversa encontrada</p>
                </div>
              ) : (
                filteredConversations.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      selectedConversation?.id === conv.id
                        ? "bg-purple-900/40 border-2 border-purple-500/50"
                        : "bg-slate-900/40 border-2 border-transparent hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-bold text-sm truncate">
                          {conv.lead_name || conv.lead_phone}
                        </h4>
                        <p className="text-xs text-gray-500 font-mono">{conv.lead_phone}</p>
                      </div>
                      {conv.interest_level !== null && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {conv.interest_level}% 🔥
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      {getStatusBadge(conv.status)}
                      {getSentimentBadge(conv.sentiment)}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 flex items-center gap-1">
                        <Bot className="w-3 h-3" />
                        {conv.bot_name}
                      </span>
                      <span className="text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(conv.last_message_at || conv.started_at)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Área de Chat */}
        <Card className="lg:col-span-2 border-2 border-gray-700/50 bg-slate-800/40 overflow-hidden flex flex-col">
          {selectedConversation ? (
            <>
              {/* Header da Conversa */}
              <CardHeader className="pb-3 border-b border-gray-700/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold">
                      {selectedConversation.lead_name || selectedConversation.lead_phone}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Campanha: {selectedConversation.campaign_name} • Bot: {selectedConversation.bot_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedConversation.status)}
                    {getSentimentBadge(selectedConversation.sentiment)}
                  </div>
                </div>
              </CardHeader>

              {/* Mensagens */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === "outgoing" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                          msg.direction === "outgoing"
                            ? "bg-purple-600/80 text-white"
                            : "bg-slate-700/60 text-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {msg.sender_type === "ia" ? (
                            <Bot className="w-3 h-3 text-purple-300" />
                          ) : (
                            <User className="w-3 h-3 text-gray-400" />
                          )}
                          <span className="text-xs opacity-70">
                            {msg.sender_type === "ia" ? "IA" : "Lead"}
                          </span>
                          {msg.ai_confidence && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1">
                              {msg.ai_confidence}% conf.
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{msg.message_text}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] opacity-60">
                            {new Date(msg.created_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {msg.delivered_at && msg.direction === "outgoing" && (
                            <CheckCircle2 className="w-3 h-3 opacity-60" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Input (desabilitado - apenas visualização) */}
              <div className="p-4 border-t border-gray-700/50">
                <div className="flex items-center gap-2">
                  <Input
                    disabled
                    placeholder="Modo visualização - IA está respondendo automaticamente"
                    className="flex-1 bg-slate-900/60 border-gray-700 text-gray-500"
                  />
                  <Button disabled size="icon" className="bg-purple-600 hover:bg-purple-500">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  💡 A IA está gerenciando esta conversa automaticamente. Para intervir, use o botão "Escalar para Humano".
                </p>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-sm">Selecione uma conversa para visualizar</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}