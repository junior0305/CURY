// Cadastro de superintendente (pelo diretor) ou de gerente (pelo diretor ou pelo super), em Configurar → Equipe.
// Mesmo jeito do cadastro de corretor: login nome@comandra (ou nome.sobrenome se já existir), senha mudar@123
// trocada no primeiro acesso. Quem cria é a edge create-user, que confere se quem pede pode criar esse papel.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export default function CadastrarLider({ papel, chefes, chefeInicial, onFechar, onPronto }: {
  papel: "SUPERINTENDENT" | "MANAGER";
  /** a quem ele responde: para super, o diretor; para gerente, os supers que quem cadastra pode escolher */
  chefes: { id: string; nome: string }[];
  chefeInicial?: string;
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [chefe, setChefe] = useState(chefeInicial ?? chefes[0]?.id ?? "");
  const [salvando, setSalvando] = useState(false);
  const [conflito, setConflito] = useState(false);
  const rot = papel === "SUPERINTENDENT" ? "superintendente" : "gerente";

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onFechar]);

  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeiro = semAcento(partes[0] ?? "");
  const ultimo = semAcento(partes[partes.length - 1] ?? "");
  const login = primeiro ? `${primeiro}@comandra` : "nome@comandra";
  const alternativo = primeiro && ultimo && primeiro !== ultimo ? `${primeiro}.${ultimo}@comandra` : `${primeiro}.${rot}@comandra`;

  useEffect(() => {
    if (!primeiro) { setConflito(false); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("id").eq("email", `${primeiro}@comandra`).maybeSingle();
      setConflito(!!data);
    }, 350);
    return () => clearTimeout(t);
  }, [primeiro]);

  async function cadastrar() {
    if (!partes.length) { toast.error(`Escreva o nome do ${rot}.`); return; }
    if (!chefe) { toast.error(`Escolha a quem o ${rot} responde.`); return; }
    setSalvando(true);
    try {
      const email = conflito ? alternativo : login;
      const { data, error } = await supabase.functions.invoke("create-user", { body: {
        email, password: "mudar@123", firstName: partes[0], lastName: partes.slice(1).join(" ") || null,
        role: papel, phone: tel.replace(/\D/g, "") || null, managerId: chefe, leadAssignmentEnabled: papel === "MANAGER",
      } });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success(`${partes[0]} cadastrado como ${rot}. Login: ${email} · senha: mudar@123 (troca no primeiro acesso)`);
      onPronto();
    } catch (e: any) {
      toast.error(`Não consegui cadastrar: ${e?.message ?? e}`);
    } finally { setSalvando(false); }
  }

  return (
    <>
      <div className="tm-scrim on" onClick={onFechar} />
      <div className="tm-modal on" role="dialog" aria-modal="true" aria-labelledby="cl-t">
        <h3 id="cl-t">Cadastrar {rot}</h3>
        <div className="tm-f" style={{ marginTop: 16 }}>
          <label htmlFor="cl-nome">Nome</label>
          <input id="cl-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={papel === "SUPERINTENDENT" ? "Ex.: Liliane Souza" : "Ex.: Carlos Bacana"} autoComplete="off" autoFocus />
        </div>
        <div className="tm-f" style={{ marginTop: 12 }}>
          <label htmlFor="cl-tel">WhatsApp</label>
          <input id="cl-tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="11 98888-7777" autoComplete="off" />
        </div>
        {chefes.length > 1 ? (
          <div className="tm-f" style={{ marginTop: 12 }}>
            <label htmlFor="cl-chefe">{papel === "SUPERINTENDENT" ? "Responde ao diretor" : "Superintendência"}</label>
            <select id="cl-chefe" value={chefe} onChange={(e) => setChefe(e.target.value)}>
              {chefes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        ) : null}
        <div className="tm-auto" style={{ marginTop: 16 }}>
          <div className="tm-autol">Configurado automaticamente</div>
          <div>Login: <b>{conflito ? alternativo : login}</b></div>
          <div>Senha inicial: <b>mudar@123</b> (troca no primeiro acesso)</div>
          <div>Responde a: <b>{chefes.find((c) => c.id === chefe)?.nome ?? "—"}</b></div>
          <div>WhatsApp do Comandra: criado na hora; ele conecta em Configurar → Meu WhatsApp</div>
        </div>
        {conflito ? <p className="tm-aviso" style={{ marginTop: 10 }}>Já existe alguém com o login <b>{login}</b>. Vou usar <b>{alternativo}</b>.</p> : null}
        <div className="tm-modala" style={{ marginTop: 20 }}>
          <button className="mini" type="button" onClick={onFechar}>Cancelar</button>
          <button className="mini solid" type="button" disabled={salvando} onClick={cadastrar}>{salvando ? "Cadastrando…" : `Cadastrar ${rot}`}</button>
        </div>
      </div>
    </>
  );
}
