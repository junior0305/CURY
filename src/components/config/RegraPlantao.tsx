/**
 * RegraPlantao — Configurar do gerente: como os leads são distribuídos no plantão.
 * Hora que a roleta abre · ordem de chegada x sorteio · represa · atrasado precisa liberação.
 * Fase 1 (18/11): só a config (plantao_config). O motor (represa/roleta por essa regra) e a
 * tela de ordem/ponteiro vêm nas fases 2 e 3. Mockup aprovado: artifact 2PPueCCJvHTcHigbBifsGi.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Clock4, Shuffle, LogIn, Dices, Pause, UserPlus, Sparkles, PlayCircle, Clock3, Hand } from "lucide-react";
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
  const [libRoletas, setLibRoletas] = useState<"ambas" | "manha" | "tarde">("ambas");
  const [liberacao, setLiberacao] = useState<"auto" | "manual">("auto");
  const [temR2, setTemR2] = useState(false);
  const [r2abre, setR2abre] = useState("14:00");
  const [r2modo, setR2modo] = useState<"login" | "sorteio">("login");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setAbre(data.roleta_abre || "09:00");
    setModo(data.roleta_modo === "sorteio" ? "sorteio" : "login");
    setRepresa(!!data.represa_on);
    setExige(!!data.exige_liberacao);
    setLibRoletas(data.liberacao_roletas === "manha" ? "manha" : data.liberacao_roletas === "tarde" ? "tarde" : "ambas");
    setLiberacao(data.liberacao === "manual" ? "manual" : "auto");
    setTemR2(!!data.tem_roleta2);
    setR2abre(data.roleta2_abre || "14:00");
    setR2modo(data.roleta2_modo === "sorteio" ? "sorteio" : "login");
  }, [data]);

  const custom = !PRESETS.includes(abre);
  const modoTxt = modo === "login" ? "por ordem de chegada" : "por sorteio na abertura";

  async function salvar() {
    setSaving(true);
    const { error } = await sb.rpc("plantao_config_salvar", { p_exige: exige, p_como: como, p_abre: abre || "09:00", p_modo: modo, p_represa: represa, p_liberacao: liberacao, p_lib_roletas: libRoletas, p_r2: temR2, p_r2abre: r2abre || "14:00", p_r2modo: r2modo });
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
          <div className="rp-ct" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}><div className="rp-ci"><Pause size={18} /></div><div><b>Segurar leads (represa)</b><span style={{ display: "block", fontSize: "12.5px", color: "var(--mut)", marginTop: 2, lineHeight: 1.5 }}>A noite — e sempre que <b>ninguém da equipe estiver logado</b> — os leads esperam em vez de cair pra quem não está. Logado = fez check-in hoje e está online.</span></div></div>
          <div className={"rp-tg" + (represa ? " on" : "")} onClick={() => setRepresa(!represa)} />
        </div>
        {represa && <div className="rp-sub">{liberacao === "manual" ? <><b>Todos</b> os leads ficam represados até <b>você soltar</b> no botão — não solta por horário nem por login.</> : <>Segurando das <b>21:00</b> até <b>{abre}</b>, e sempre que <b>ninguém da equipe estiver logado</b>. Solta sozinho pros presentes conforme cada um entra.</>} Fila de formulário/página do gerente continua entregando na hora.</div>}
      </div>

      {/* liberação (só quando represa ligada) */}
      {represa && (
        <div className="rp-card">
          <div className="rp-ch"><div className="rp-ci"><PlayCircle size={18} /></div><div className="rp-ct"><b>Liberação dos represados</b><span>Na hora de abrir, o sistema solta sozinho ou você aperta o botão?</span></div></div>
          <div className="rp-modos">
            <button className={"rp-modo" + (liberacao === "auto" ? " on" : "")} onClick={() => setLiberacao("auto")}>
              <div className="rd" /><div className="mi"><Clock3 size={17} /></div><b>Automática</b><span>Solta na hora marcada e conforme a equipe vai logando. Ninguém logado → segura até alguém entrar.</span>
            </button>
            <button className={"rp-modo" + (liberacao === "manual" ? " on" : "")} onClick={() => setLiberacao("manual")}>
              <div className="rd" /><div className="mi"><Hand size={17} /></div><b>Eu solto (manual)</b><span><b>Todo</b> lead fica represado até você clicar em “Soltar leads”. Nunca solta por horário nem por login — sempre você.</span>
            </button>
          </div>
        </div>
      )}

      {/* atrasado */}
      <div className="rp-card">
        <div className="rp-row">
          <div className="rp-ct" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}><div className="rp-ci"><UserPlus size={18} /></div><div><b>Quem chega atrasado</b><span style={{ display: "block", fontSize: "12.5px", color: "var(--mut)", marginTop: 2, lineHeight: 1.5 }}>Check-in depois da roleta aberta: precisa da sua liberação pra começar a receber?</span></div></div>
          <div className={"rp-tg" + (exige ? " on" : "")} onClick={() => setExige(!exige)} />
        </div>
        {exige && <div className="rp-sub">Entra como <b>“aguardando”</b> (não recebe). Você admite e ele vai <b>pro fim da fila</b> — sem furar quem já estava.</div>}
        {exige && temR2 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--line)" }}>
            <b style={{ fontSize: "13px", display: "block", marginBottom: 8 }}>Em quais roletas vale a liberação?</b>
            <div className="rp-chips">
              {([["ambas", "Nas duas"], ["manha", "Só na manhã"], ["tarde", "Só na tarde"]] as const).map(([v, t]) => (
                <button key={v} className={"rp-chip" + (libRoletas === v ? " on" : "")} onClick={() => setLibRoletas(v)}>{t}</button>
              ))}
            </div>
            <div className="rp-sub" style={{ marginTop: 10 }}>
              {libRoletas === "ambas" ? <>Quem chega depois do sorteio — <b>na manhã ou na tarde</b> — espera você liberar.</>
                : libRoletas === "manha" ? <>Só na <b>manhã</b>: atrasado da manhã espera; na <b>tarde</b> entra direto no fim.</>
                : <>Só na <b>tarde</b>: atrasado da manhã entra direto no fim; na <b>tarde</b> espera você liberar.</>}
            </div>
          </div>
        )}
      </div>

      {/* roleta 2 (tarde) */}
      <div className="rp-card">
        <div className="rp-row">
          <div className="rp-ct" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}><div className="rp-ci"><Clock size={18} /></div><div><b>Tem 2ª roleta (tarde)?</b><span style={{ display: "block", fontSize: "12.5px", color: "var(--mut)", marginTop: 2, lineHeight: 1.5 }}>Um 2º turno, <b>sem represa</b> — novo sorteio ou ordem de chegada. Também separa os relatórios (1ª × 2ª roleta).</span></div></div>
          <div className={"rp-tg" + (temR2 ? " on" : "")} onClick={() => setTemR2(!temR2)} />
        </div>
        {temR2 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--line)" }}>
            <b style={{ fontSize: "13px" }}>Começa às</b>
            <div className="rp-chips" style={{ marginTop: 8 }}>
              {["13:30", "14:00"].map((h) => <button key={h} className={"rp-chip" + (r2abre === h ? " on" : "")} onClick={() => setR2abre(h)}>{h}</button>)}
              <button className={"rp-chip" + (!["13:30", "14:00"].includes(r2abre) ? " on" : "")} onClick={() => setR2abre(["13:30", "14:00"].includes(r2abre) ? "15:00" : r2abre)}><Clock4 size={13} /> Escolher</button>
            </div>
            {!["13:30", "14:00"].includes(r2abre) && <div className="rp-custom" style={{ display: "flex", marginTop: 10 }}><span>Começa às</span><input type="time" value={r2abre} onChange={(e) => setR2abre(e.target.value || "15:00")} /></div>}
            <b style={{ fontSize: "13px", display: "block", margin: "16px 0 8px" }}>Como distribui às {r2abre}</b>
            <div className="rp-modos">
              <button className={"rp-modo" + (r2modo === "login" ? " on" : "")} onClick={() => setR2modo("login")}>
                <div className="rd" /><div className="mi"><LogIn size={17} /></div><b>Ordem de chegada</b><span>Quem chega depois entra no fim da fila.</span>
              </button>
              <button className={"rp-modo" + (r2modo === "sorteio" ? " on" : "")} onClick={() => setR2modo("sorteio")}>
                <div className="rd" /><div className="mi"><Dices size={17} /></div><b>Novo sorteio</b><span>Às {r2abre}, embaralha de novo todo mundo presente.</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* resumo */}
      <div className="rp-resumo"><div className="rp-ri"><Sparkles size={20} /></div><div className="rp-rt"><b>Resumo</b><p>Abre <span>{abre}</span> · distribui <span>{modoTxt}</span>{represa ? (liberacao === "manual" ? <> · <span>segurando tudo</span> (<span>você solta</span>)</> : <> · <span>segurando</span> até abrir / sem ninguém logado (<span>solta sozinho</span>)</>) : <> · <span>sem represa</span> (cai na hora)</>}{exige ? (temR2 ? ` · atrasado precisa de liberação (${libRoletas === "ambas" ? "nas duas roletas" : libRoletas === "manha" ? "só manhã" : "só tarde"}).` : " · atrasado precisa de liberação.") : " · atrasado entra direto no fim."}{temR2 ? <> · <span>2ª roleta {r2abre}</span> ({r2modo === "sorteio" ? "sorteio" : "chegada"})</> : ""}</p></div></div>

      <div className="rp-salvar"><button className="rp-b1" onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar regra da equipe"}</button></div>
      <p style={{ fontSize: "11.5px", color: "var(--mut)", marginTop: 10, lineHeight: 1.5, maxWidth: 720 }}>A regra vale pra <b>sua equipe</b>. A tela de ordem/ponteiro (quem é a vez) e o motor que distribui por essa regra entram na sequência.</p>
    </div>
  );
}
