// Cadastro de Gerente pelo Superintendente
// Cria usuário com papel MANAGER vinculado diretamente ao ID do Superintendente.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export default function CadastrarGerente({
  superId,
  superNome,
  onFechar,
  onPronto,
}: {
  superId: string;
  superNome: string;
  onFechar: () => void;
  onPronto: (novoId?: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [conflito, setConflito] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onFechar]);

  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeiro = semAcento(partes[0] ?? "");
  const ultimo = semAcento(partes[partes.length - 1] ?? "");
  const login = primeiro ? `${primeiro}@comandra` : "nome@comandra";
  const loginAlternativo = primeiro && ultimo && primeiro !== ultimo
    ? `${primeiro}.${ultimo}@comandra`
    : `${primeiro}.gerente@comandra`;

  useEffect(() => {
    if (!primeiro) { setConflito(false); return; }
    const t = setTimeout(async () => {
      const { data: perfil } = await supabase.from("profiles").select("id").eq("email", `${primeiro}@comandra`).maybeSingle();
      setConflito(!!perfil);
    }, 350);
    return () => clearTimeout(t);
  }, [primeiro]);

  async function cadastrar() {
    if (!nome.trim()) { toast.error("Escreva o nome do gerente."); return; }
    setSalvando(true);
    try {
      const emailFinal = conflito ? loginAlternativo : login;
      const firstName = partes[0];
      const lastName = partes.slice(1).join(" ") || null;

      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: emailFinal,
          password: "mudar@123",
          firstName,
          lastName,
          role: "MANAGER",
          phone: tel.replace(/\D/g, "") || null,
          managerId: superId,
          leadAssignmentEnabled: true,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(`Gerente ${firstName} cadastrado com sucesso! Login: ${emailFinal} | Senha: mudar@123`);
      onPronto((data as any)?.user?.id);
    } catch (e: any) {
      toast.error(`Não consegui cadastrar o gerente: ${e?.message ?? e}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="tm-scrim on" onClick={onFechar} />
      <div className="tm-modal on" role="dialog" aria-modal="true" aria-labelledby="cg-t">
        <h3 id="cg-t">Cadastrar novo Gerente</h3>
        <p>Ele entrará com o papel <b>Gerente de Vendas (MANAGER)</b> na sua superintendência ({superNome}).</p>

        <div className="tm-f" style={{ marginTop: 16 }}>
          <label htmlFor="cg-nome">Nome do Gerente</label>
          <input
            id="cg-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Carlos Bacana"
            autoComplete="off"
            autoFocus
          />
        </div>

        <div className="tm-f" style={{ marginTop: 12 }}>
          <label htmlFor="cg-tel">WhatsApp / Telefone</label>
          <input
            id="cg-tel"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            placeholder="11 98888-7777"
            autoComplete="off"
          />
        </div>

        <div className="tm-auto" style={{ marginTop: 16 }}>
          <div className="tm-autol">Configurações automáticas</div>
          <div>Login de Acesso: <b>{conflito ? loginAlternativo : login}</b></div>
          <div>Senha Inicial: <b>mudar@123</b> <span style={{ fontSize: 11, color: "var(--cv-text-muted)" }}>(troca no 1º login)</span></div>
          <div>Superintendência: <b>{superNome}</b></div>
          <div>Papel: <b>Gerente de Equipe (MANAGER)</b></div>
        </div>

        {conflito && (
          <p className="tm-aviso" style={{ marginTop: 10 }}>
            ⚠️ Já existe um usuário com o login <b>{login}</b>. O sistema usará <b>{loginAlternativo}</b> para evitar conflito.
          </p>
        )}

        <div className="tm-modala" style={{ marginTop: 20 }}>
          <button className="mini" type="button" onClick={onFechar}>Cancelar</button>
          <button className="mini solid" type="button" disabled={salvando} onClick={cadastrar}>
            {salvando ? "Cadastrando…" : "Confirmar e Criar Gerente"}
          </button>
        </div>
      </div>
    </>
  );
}
