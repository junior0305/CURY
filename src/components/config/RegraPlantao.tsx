/**
 * RegraPlantao — Configurar do gerente: como os leads são distribuídos no plantão.
 * Hora que a roleta abre · ordem de chegada x sorteio · represa · atrasado precisa liberação.
 * Fase 1 (18/11): só a config (plantao_config). O motor (represa/roleta por essa regra) e a
 * tela de ordem/ponteiro vêm nas fases 2 e 3. Mockup aprovado: artifact 2PPueCCJvHTcHigbBifsGi.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Clock4, Shuffle, LogIn, Dices, Pause, UserPlus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import "@/styles/regra-plantao.css";

const PRESETS = ["09:00", "09:30", "10:00"];

export default function RegraPlantao({ como }: { como: string | null }) {
  const sb = supabase as any;
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["plantao-regra", como],
    queryFn: async () => { const { data } = await sb.rpc("plantao_config_ler", { p_como: como }); return (data || {}) as any; },
  });
  const pode = data?.pode !== false;
  const [abre, setAbre] = useState("09:00");
  const [modo, setModo] = useState<"login" | "sorteio">("login");
  const [represa, setRepresa] = useState(false);
  const [exige, setExige] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setAbre(data.roleta_abre || "09:00");
    setModo(data.roleta_modo === "sorteio" ? "sorteio" : "login");
    setRepresa(!!data.represa_on);
    setExige(!!data.exige_liberacao);
  }, [data]);

  const custom = !PRESETS.includes(abre);
  const modoTxt = modo === "login" ? "por ordem de chegada" : "por sorteio na abertura";

  async function salvar() {
    setSaving(true);
    const { error } = await sb.rpc("plantao_config_salvar", { p_exige: exige, p_como: como, p_abre: abre || "09:00", p_modo: modo, p_represa: represa });
    setSaving(false);
    if (error) {
      const m = String(error.message || "");
      toast.error(m.includes("entrar_como") ? "Saia do 'Entrar como' pra salvar." : m.includes("so_gerente") ? "Essa escolha é de cada gerente." : "Não consegui salvar.");
      return;
    }
    toast.success("Regra da equipe salva ✅"); refetch();
  }

  if (isLoading) return <div className="rp"><div className="rp-aviso">Carregando…</div></div>;
  if (!pode) return <div className="rp"><div className="rp-aviso">Essa configuração é <b>de cada gerente</b>, para a equipe dele. Selecione um gerente pra ajustar a regra de plantão dele.</div></div>;

  return (
    <div className="rp">
      {/* hora que abre */}
      <div className="rp-card">
        <div className="rp-ch"><div className="rp-ci"><Clock size={18} /></div><div className="rp-ct"><b>Que horas a roleta abre?</b><span>Antes dessa hora os leads ficam represados. Na hora, o sistema solta todos de uma vez.</span></div></div>
        <div className="rp-chips">
          {PRESETS.map((h) => <button key={h} className={"rp-chip" + (abre === h ? " on" : "")} onClick={() => setAbre(h)}>{h}</button>)}
          <button className={"rp-chip" + (custom ? " on" : "")} onClick={() => setAbre(custom ? abre : "08:45")}><Clock4 size={13} /> Escolher horário</button>
        </div>
        {custom && <div className="rp-custom" style={{ display: "flex" }}><span>Abrir às</span><input type="time" value={abre} onChange={(e) => setAbre(e.target.value || "08:45")} /></div>}
      </div>

      {/* modo */}
      <div className="rp-card">
        <div className="rp-ch"><div className="rp-ci"><Shuffle size={18} /></div><div className="rp-ct"><b>Como distribui ao abrir?</b><span>A ordem em que os corretores presentes recebem os leads represados.</span></div></div>
        <div className="rp-modos">
          <button className={"rp-modo" + (modo === "login" ? " on" : "")} onClick={() => setModo("login")}>
            <div className="rd" /><div className="mi"><LogIn size={17} /></div><b>Por ordem de chegada</b><span>Quem fez check-in primeiro recebe primeiro. Premia quem chega cedo.</span>
          </button>
          <button className={"rp-modo" + (modo === "sorteio" ? " on" : "")} onClick={() => setModo("sorteio")}>
            <div className="rd" /><div className="mi"><Dices size={17} /></div><b>Por sorteio</b><span>Na abertura o sistema embaralha quem está presente. Ninguém ganha por logar 1 minuto antes.</span>
          </button>
        </div>
      </div>

      {/* represa */}
      <div className="rp-card">
        <div className="rp-row">
          <div className="rp-ct" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}><div className="rp-ci"><Pause size={18} /></div><div><b>Segurar leads antes de abrir</b><span style={{ display: "block", fontSize: "12.5px", color: "var(--mut)", marginTop: 2, lineHeight: 1.5 }}>Da noite até a hora de abrir, os leads esperam em vez de cair pra quem estiver online.</span></div></div>
          <div className={"rp-tg" + (represa ? " on" : "")} onClick={() => setRepresa(!represa)} />
        </div>
        {represa && <div className="rp-sub">Segurando das <b>21:00</b> até <b>{abre}</b>. Fila de formulário/página do gerente continua entregando na hora.</div>}
      </div>

      {/* atrasado */}
      <div className="rp-card">
        <div className="rp-row">
          <div className="rp-ct" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}><div className="rp-ci"><UserPlus size={18} /></div><div><b>Quem chega atrasado</b><span style={{ display: "block", fontSize: "12.5px", color: "var(--mut)", marginTop: 2, lineHeight: 1.5 }}>Check-in depois da roleta aberta: precisa da sua liberação pra começar a receber?</span></div></div>
          <div className={"rp-tg" + (exige ? " on" : "")} onClick={() => setExige(!exige)} />
        </div>
        {exige && <div className="rp-sub">Entra como <b>“aguardando”</b> (não recebe). Você admite e ele vai <b>pro fim da fila</b> — sem furar quem já estava.</div>}
      </div>

      {/* resumo */}
      <div className="rp-resumo"><div className="rp-ri"><Sparkles size={20} /></div><div className="rp-rt"><b>Resumo</b><p>Abre <span>{abre}</span> · distribui <span>{modoTxt}</span>{represa ? <> · <span>segurando</span> até abrir</> : <> · <span>sem represa</span> (cai na hora)</>}{exige ? " · atrasado precisa de liberação." : " · atrasado entra direto no fim."}</p></div></div>

      <div className="rp-salvar"><button className="rp-b1" onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar regra da equipe"}</button></div>
      <p style={{ fontSize: "11.5px", color: "var(--mut)", marginTop: 10, lineHeight: 1.5, maxWidth: 720 }}>A regra vale pra <b>sua equipe</b>. A tela de ordem/ponteiro (quem é a vez) e o motor que distribui por essa regra entram na sequência.</p>
    </div>
  );
}
