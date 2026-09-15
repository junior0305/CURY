// Cadastro de corretor PELO GERENTE.
//
// Até hoje ele dependia do Junior para isso. A função `create-user` foi trancada
// no servidor em 14/09: gerente só cria BROKER e o `manager_id` é forçado para
// ele mesmo, mesmo que alguém adultere o pedido. Esconder o botão não protegeria
// nada — quem sabe chamar a URL continua chamando.
//
// O padrão do cadastro (Junior, 15/09): login `nome@cury`, senha `mudar@123` com
// troca no primeiro acesso, instância do WhatsApp com a inicial maiúscula, equipe
// e gerente do criador, boas-vindas e follow-up ligados, e entra na fila EQ_NOME.
//
// ⚠️ Nome repetido quebra tanto o login quanto a instância da Evolution — daí o
// sufixo com a inicial do gerente: Joana_Du.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export default function CadastrarCorretor({
  managerId, onFechar, onPronto,
}: { managerId: string; onFechar: () => void; onPronto: () => void }) {
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerente, setGerente] = useState<{ nome: string; equipe: string | null; fila: string | null }>(
    { nome: "", equipe: null, fila: null });
  const [conflito, setConflito] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onFechar]);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("profiles")
        .select("first_name,team_id").eq("id", managerId).maybeSingle();
      const nomeGer = (p as any)?.first_name ?? "";
      let equipe: string | null = null;
      if ((p as any)?.team_id) {
        const { data: t } = await supabase.from("teams").select("name").eq("id", (p as any).team_id).maybeSingle();
        equipe = (t as any)?.name ?? null;
      }
      setGerente({ nome: nomeGer, equipe, fila: `EQ_${semAcento(nomeGer).toUpperCase()}` });
    })();
  }, [managerId]);

  // o primeiro nome vira login e instância; se já existir, entra o sufixo
  const primeiro = semAcento(nome).split(/\s+/)[0] ?? "";
  const login = primeiro ? `${primeiro}@cury` : "nome@cury";
  const sufixo = semAcento(gerente.nome).slice(0, 2);
  const base = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1) : "Nome";
  const instancia = conflito && primeiro
    ? `${base}_${sufixo.charAt(0).toUpperCase() + sufixo.slice(1)}` : base;

  useEffect(() => {
    if (!primeiro) { setConflito(false); return; }
    const t = setTimeout(async () => {
      const [{ data: perfil }, { data: inst }] = await Promise.all([
        supabase.from("profiles").select("id").eq("email", `${primeiro}@cury`).maybeSingle(),
        supabase.from("bot_instances").select("id").eq("instance_name", base).maybeSingle(),
      ]);
      setConflito(!!perfil || !!inst);
    }, 350);
    return () => clearTimeout(t);
  }, [primeiro, base]);

  async function cadastrar() {
    if (!nome.trim()) { toast.error("Escreva o nome do corretor."); return; }
    setSalvando(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: conflito ? `${primeiro}.${sufixo}@cury` : login,
          password: "mudar@123",
          firstName: nome.trim().split(/\s+/)[0],
          lastName: nome.trim().split(/\s+/).slice(1).join(" ") || null,
          role: "BROKER",
          phone: tel.replace(/\D/g, "") || null,
          leadAssignmentEnabled: true,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${nome.trim()} cadastrado. A senha é mudar@123 e ele troca no primeiro acesso.`);
      onPronto();
    } catch (e: any) {
      toast.error(`Não consegui cadastrar: ${e?.message ?? e}`);
    } finally { setSalvando(false); }
  }

  return (
    <>
      <div className="tm-scrim on" onClick={onFechar} />
      <div className="tm-modal on" role="dialog" aria-modal="true" aria-labelledby="cc-t">
        <h3 id="cc-t">Cadastrar corretor</h3>
        <p>Ele entra na sua equipe, com você como gerente.</p>

        <div className="tm-fotol">
          <label className="tm-foto">
            {foto ? <img src={foto} alt="" /> : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="9" r="3.4" /><path d="M4.5 20c0-3.6 3.4-5.6 7.5-5.6s7.5 2 7.5 5.6" />
              </svg>
            )}
            <input type="file" accept="image/*" hidden onChange={(e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const r = new FileReader(); r.onload = () => setFoto(String(r.result)); r.readAsDataURL(f);
            }} />
          </label>
          <div>Foto do corretor<br /><small>aparece no ranking e nas listas</small></div>
        </div>

        <div className="tm-f">
          <label htmlFor="cc-nome">Nome</label>
          <input id="cc-nome" value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder="Joana" autoComplete="off" autoFocus />
        </div>
        <div className="tm-f2">
          <div className="tm-f">
            <label htmlFor="cc-tel">Telefone</label>
            <input id="cc-tel" value={tel} onChange={(e) => setTel(e.target.value)}
              placeholder="11 98888-7777" autoComplete="off" />
          </div>
          <div className="tm-f">
            <label htmlFor="cc-ger">Gerente</label>
            <input id="cc-ger" value={`${gerente.nome} (você)`} readOnly />
          </div>
        </div>

        <div className="tm-auto">
          <div className="tm-autol">O sistema já preenche</div>
          <div>Login <b>{conflito ? `${primeiro}.${sufixo}@cury` : login}</b></div>
          <div>Senha <b>mudar@123</b></div>
          <div>WhatsApp <b>{instancia}</b></div>
          <div>Equipe <b>{gerente.equipe ?? "—"}</b></div>
          <div>Fila de leads <b>{gerente.fila ?? "—"}</b></div>
          <div>Boas-vindas e follow-up <b>ligados</b></div>
          <div>Recebe lead <b>sim</b></div>
        </div>

        {conflito && (
          <p className="tm-aviso">
            Já existe alguém com esse nome. O login e o WhatsApp ganham a sua
            inicial no fim para não conflitar.
          </p>
        )}

        <div className="tm-modala">
          <button className="mini" onClick={onFechar}>Cancelar</button>
          <button className="mini solid" disabled={salvando} onClick={cadastrar}>
            {salvando ? "cadastrando…" : "Cadastrar"}
          </button>
        </div>
      </div>
    </>
  );
}
