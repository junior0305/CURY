import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Volume2, Trophy, Car, Check, Loader2, Music, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AudioSettings() {
  const [isUploading, setIsUploading] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'SALE' | 'OVERTAKE') => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'audio/mpeg' && !file.name.endsWith('.mp3')) {
      toast.error("Por favor, envie apenas arquivos MP3.");
      return;
    }

    setIsUploading(type);
    const fileName = type === 'SALE' ? 'sale.mp3' : 'overtake.mp3';

    try {
      // Upload para o Supabase Storage (sobrescrevendo se já existir)
      const { error } = await supabase.storage
        .from('audio-arena')
        .upload(fileName, file, {
          upsert: true,
          contentType: 'audio/mpeg'
        });

      if (error) throw error;

      toast.success(`Áudio de ${type === 'SALE' ? 'Venda' : 'Ultrapassagem'} atualizado com sucesso!`);
      // Forçar refresh para o hook recarregar os sons (opcional, mas bom avisar)
      toast.info("Recarregue a página para ouvir a nova versão.");
    } catch (err: any) {
      console.error("[AudioSettings] Erro no upload:", err);
      toast.error(`Erro ao subir arquivo: ${err.message}`);
    } finally {
      setIsUploading(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
          <Music className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Configuração da Arena Sonora</h2>
          <p className="text-sm text-slate-500 font-medium">Personalize os efeitos de áudio da gamificação.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Upload de Venda */}
        <Card className="p-6 border-none shadow-xl rounded-3xl bg-white ring-1 ring-slate-100">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-12 w-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Som de Venda</h3>
              <p className="text-xs text-slate-400">Toca no mural quando uma venda é aprovada.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative group">
              <input
                type="file"
                accept=".mp3"
                onChange={(e) => handleFileUpload(e, 'SALE')}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={!!isUploading}
              />
              <div className="h-32 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 group-hover:border-emerald-400 group-hover:bg-emerald-50 transition-all">
                {isUploading === 'SALE' ? (
                  <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-slate-300 group-hover:text-emerald-500" />
                    <span className="text-xs font-bold text-slate-400 group-hover:text-emerald-700">Clique para enviar sale.mp3</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
              <Volume2 className="h-3 w-3" />
              <span>Arquivo atual: sale.mp3</span>
            </div>
          </div>
        </Card>

        {/* Upload de Ultrapassagem */}
        <Card className="p-6 border-none shadow-xl rounded-3xl bg-white ring-1 ring-slate-100">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-12 w-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
              <Car className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Som de Ultrapassagem</h3>
              <p className="text-xs text-slate-400">Toca quando a liderança do ranking muda.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative group">
              <input
                type="file"
                accept=".mp3"
                onChange={(e) => handleFileUpload(e, 'OVERTAKE')}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={!!isUploading}
              />
              <div className="h-32 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 group-hover:border-indigo-400 group-hover:bg-indigo-50 transition-all">
                {isUploading === 'OVERTAKE' ? (
                  <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-slate-300 group-hover:text-indigo-500" />
                    <span className="text-xs font-bold text-slate-400 group-hover:text-indigo-700">Clique para enviar overtake.mp3</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
              <Volume2 className="h-3 w-3" />
              <span>Arquivo atual: overtake.mp3</span>
            </div>
          </div>
        </Card>

        {/* NOVO: Upload de Novo Lead */}
        <Card className="p-6 border-none shadow-xl rounded-3xl bg-white ring-1 ring-slate-100">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-12 w-12 bg-sky-100 text-sky-600 rounded-2xl flex items-center justify-center">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Som de Novo Lead</h3>
              <p className="text-xs text-slate-400">Toca quando um lead entra na fila do corretor.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative group">
              <input
                type="file"
                accept=".mp3"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.type !== 'audio/mpeg' && !file.name.endsWith('.mp3')) {
                    toast.error("Por favor, envie apenas arquivos MP3.");
                    return;
                  }
                  
                  // Reusando a lógica de upload (poderia ser refatorada, mas mantendo simples para o admin)
                  const fileName = 'new_lead.mp3';
                  const uploadFile = async () => {
                    setIsUploading('NEW_LEAD');
                    try {
                      const { error } = await supabase.storage
                        .from('audio-arena')
                        .upload(fileName, file, { upsert: true, contentType: 'audio/mpeg' });
                      if (error) throw error;
                      toast.success("Áudio de Novo Lead atualizado!");
                    } catch (err: any) {
                      toast.error(`Erro: ${err.message}`);
                    } finally {
                      setIsUploading(null);
                    }
                  };
                  uploadFile();
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={!!isUploading}
              />
              <div className="h-32 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 group-hover:border-sky-400 group-hover:bg-sky-50 transition-all">
                {isUploading === 'NEW_LEAD' ? (
                  <Loader2 className="h-8 w-8 text-sky-500 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-slate-300 group-hover:text-sky-500" />
                    <span className="text-xs font-bold text-slate-400 group-hover:text-sky-700">Clique para enviar new_lead.mp3</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
              <Volume2 className="h-3 w-3" />
              <span>Arquivo atual: new_lead.mp3</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4 bg-slate-900 border-none rounded-2xl">
        <div className="flex items-center gap-3">
          <Check className="h-5 w-5 text-emerald-400" />
          <p className="text-xs text-slate-300 leading-relaxed">
            Os arquivos são salvos diretamente no seu servidor Supabase. O sistema aceita apenas arquivos no formato <strong className="text-white">.mp3</strong>. Após o upload, as alterações serão aplicadas a todos os usuários logados.
          </p>
        </div>
      </Card>
    </div>
  );
}