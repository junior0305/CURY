// LOGIN — a porta da frente do Comandra.
//
// Formulário próprio em vez do Auth UI do Supabase por um motivo prático: as
// mensagens de erro. O componente pronto diz "Invalid login credentials" em
// inglês, e quem lê isso num estande de vendas não sabe se errou a senha, se
// foi bloqueado ou se a internet caiu. Aqui cada caso tem uma frase que diz o
// que fazer.
//
// O seletor de unidade saiu junto com São José: havia duas praças, o padrão de
// quem nunca escolheu era SJC, e usuário novo caía num banco morto.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { loadFonts } from "@/components/manager-v10/RailV10";
import "@/styles/login.css";

/** O que a Meta… digo, o que o Supabase responde, dito em português. */
function explica(msg: string): { titulo: string; texto: string } {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login credentials"))
    return { titulo: "E-mail ou senha não conferem.",
             texto: "Confira o e-mail e tente de novo. Se não lembra a senha, use o link abaixo." };
  if (m.includes("email not confirmed"))
    return { titulo: "Este e-mail ainda não foi confirmado.",
             texto: "Peça ao seu gerente para liberar o acesso." };
  if (m.includes("banned") || m.includes("user is banned"))
    return { titulo: "Seu acesso está bloqueado.",
             texto: "Fale com o seu gerente para reativar." };
  if (m.includes("too many") || m.includes("rate limit"))
    return { titulo: "Muitas tentativas seguidas.",
             texto: "Espere um minuto antes de tentar de novo." };
  if (m.includes("fetch") || m.includes("network") || m.includes("failed to fetch"))
    return { titulo: "Não consegui falar com o servidor.",
             texto: "Verifique a sua internet e tente de novo." };
  return { titulo: "Não consegui entrar.", texto: msg };
}

export default function Login() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [vendo, setVendo] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<{ titulo: string; texto: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  loadFonts();

  useEffect(() => { if (session) navigate("/dashboard"); }, [session, navigate]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha) return;
    setEntrando(true); setErro(null); setAviso(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password: senha,
      });
      if (error) setErro(explica(error.message));
      // O redirecionamento é do useEffect, quando a sessão chega — assim vale
      // também para quem já tinha sessão e voltou nesta tela.
    } catch (e: any) {
      setErro(explica(e?.message ?? ""));
    } finally { setEntrando(false); }
  }

  async function esqueci() {
    if (!email.trim()) {
      setErro({ titulo: "Escreva o seu e-mail primeiro.",
                texto: "É para lá que mando o link de nova senha." });
      return;
    }
    setEntrando(true); setErro(null); setAviso(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/force-password-change`,
      });
      if (error) setErro(explica(error.message));
      else setAviso(`Mandei um link para ${email.trim().toLowerCase()}. Pode demorar alguns minutos — olhe também o spam.`);
    } catch (e: any) {
      setErro(explica(e?.message ?? ""));
    } finally { setEntrando(false); }
  }

  return (
    <div className="lg">
      <div className="lg-cartao">
        <div className="lg-marca">
          <img src="/comandra-icon.png" alt="" />
          <b>Comandra</b>
          <span>O painel de quem vende imóvel</span>
        </div>

        {erro ? (
          <div className="lg-erro" role="alert">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></svg>
            <div><b>{erro.titulo}</b><br />{erro.texto}</div>
          </div>
        ) : null}

        {aviso ? <div className="lg-ok" role="status"><b>Link enviado.</b> {aviso}</div> : null}

        <form onSubmit={entrar} noValidate>
          <div className="lg-campo">
            <label htmlFor="lg-email">E-mail</label>
            <input id="lg-email" type="email" autoComplete="username" autoFocus
              placeholder="voce@curyvendas.com.br" disabled={entrando}
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="lg-campo">
            <label htmlFor="lg-senha">Senha</label>
            <div className="lg-senha">
              <input id="lg-senha" type={vendo ? "text" : "password"} autoComplete="current-password"
                placeholder="sua senha" disabled={entrando}
                value={senha} onChange={(e) => setSenha(e.target.value)} />
              <button type="button" className="lg-olho" onClick={() => setVendo((v) => !v)}
                aria-label={vendo ? "Esconder a senha" : "Mostrar a senha"}
                title={vendo ? "Esconder a senha" : "Mostrar a senha"}>
                {vendo
                  ? <svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M9.4 5.3A9.6 9.6 0 0112 5c5 0 9 4.5 9 7 0 .9-.6 2.1-1.6 3.3M6.3 6.5C3.9 8 2 10.4 2 12c0 2.5 4 7 10 7 1.6 0 3-.3 4.2-.8" /></svg>
                  : <svg viewBox="0 0 24 24"><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>}
              </button>
            </div>
          </div>

          <button type="submit" className="lg-entrar" disabled={entrando || !email.trim() || !senha}>
            {entrando ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div className="lg-pe">
          <button type="button" className="lg-link" onClick={esqueci} disabled={entrando}>
            Esqueci minha senha
          </button>
        </div>
      </div>
    </div>
  );
}
