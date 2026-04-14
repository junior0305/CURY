import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, LogOut, ShieldCheck } from "lucide-react";

const WOLF_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@500;600;700&display=swap');
  .wolf-display { font-family:'Orbitron',monospace; letter-spacing:0.05em; }
  .wolf-ui { font-family:'Rajdhani',sans-serif; }
  @keyframes neonBreathe {
    0%,100%{opacity:1;filter:drop-shadow(0 0 4px #00D4FF);}
    50%{opacity:.75;filter:drop-shadow(0 0 12px #00D4FF);}
  }
  .anim-neon { animation: neonBreathe 2.5s ease-in-out infinite; }
  .hex-bg {
    background-color: #080B14;
    background-image:
      radial-gradient(ellipse 80% 50% at 50% -20%,rgba(0,212,255,.07) 0%,transparent 60%),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='48'%3E%3Cpolygon points='28,2 54,16 54,44 28,58 2,44 2,16' fill='none' stroke='%2300D4FF' stroke-width='0.4' opacity='0.1'/%3E%3C/svg%3E");
    background-size:auto,56px 48px;
  }
`;

export default function ForcePasswordChange() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [showPass, setShowPass]     = useState(false);
  const [showConf, setShowConf]     = useState(false);
  const [loading, setLoading]       = useState(false);

  const strength = (() => {
    if (password.length === 0) return 0;
    let s = 0;
    if (password.length >= 8)                          s++;
    if (/[A-Z]/.test(password))                        s++;
    if (/[0-9]/.test(password))                        s++;
    if (/[^A-Za-z0-9]/.test(password))                s++;
    return s;
  })();

  const strengthLabel = ["", "Fraca", "Razoável", "Boa", "Forte"][strength];
  const strengthColor = ["", "#EF4444", "#F59E0B", "#10B981", "#00D4FF"][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      // 1. Limpa a flag ANTES de atualizar a senha — assim quando USER_UPDATED
      //    disparar no AuthProvider, o profile já terá must_change_password=false.
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", user!.id);
      if (profileError) throw profileError;

      // 2. Atualiza a senha — dispara USER_UPDATED, AuthProvider re-lê o profile
      //    (que já tem must_change_password=false) e redireciona para /dashboard.
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;

      toast.success("Senha atualizada com sucesso! Bem-vindo ao sistema.");
      // O redirect é feito pelo efeito de role no AuthProvider.
      // navigate + reload explícito causavam tela preta e race condition.
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast.error("Erro ao atualizar senha: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{WOLF_STYLES}</style>
      <div className="hex-bg wolf-ui min-h-screen flex items-center justify-center p-4"
        style={{ position: "relative" }}>

        {/* Logout discreto */}
        <button
          onClick={signOut}
          className="absolute top-4 right-4 flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sair
        </button>

        <div className="w-full max-w-sm">

          {/* Logo + título */}
          <div className="flex flex-col items-center mb-8">
            <img
              src="/comandra-icon.png"
              alt="Comandra"
              className="w-14 h-14 object-contain anim-neon mb-4"
              style={{ filter: "drop-shadow(0 0 10px rgba(0,212,255,.7))" }}
            />
            <h1 className="wolf-display text-lg font-black text-white tracking-widest uppercase">
              Comandra
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">War Room</p>
          </div>

          {/* Card */}
          <div className="rounded-2xl p-6 space-y-5"
            style={{
              background: "rgba(8,14,28,0.95)",
              border: "1px solid rgba(0,212,255,.2)",
              boxShadow: "0 0 40px rgba(0,212,255,.06), 0 0 80px rgba(0,212,255,.03)",
            }}>

            {/* Header do card */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl"
                style={{ background: "rgba(0,212,255,.1)", border: "1px solid rgba(0,212,255,.2)" }}>
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="wolf-display text-xs font-bold text-white uppercase tracking-wider">
                  Troca de senha obrigatória
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Crie sua senha pessoal antes de continuar
                </p>
              </div>
            </div>

            <div className="h-px" style={{ background: "rgba(0,212,255,.1)" }} />

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Nova senha */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Nova Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    required
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl text-sm text-white placeholder-slate-600 outline-none transition-all"
                    style={{
                      background: "rgba(255,255,255,.04)",
                      border: "1px solid rgba(0,212,255,.15)",
                    }}
                    onFocus={e => (e.target.style.borderColor = "rgba(0,212,255,.5)")}
                    onBlur={e => (e.target.style.borderColor = "rgba(0,212,255,.15)")}
                  />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                    {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Barra de força */}
                {password.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="h-1 flex-1 rounded-full transition-all"
                          style={{ background: i <= strength ? strengthColor : "rgba(255,255,255,.08)" }} />
                      ))}
                    </div>
                    <p className="text-[10px] font-bold" style={{ color: strengthColor }}>
                      {strengthLabel}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirmar senha */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Confirmar Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                  <input
                    type={showConf ? "text" : "password"}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    required
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl text-sm text-white placeholder-slate-600 outline-none transition-all"
                    style={{
                      background: "rgba(255,255,255,.04)",
                      border: confirm.length > 0
                        ? password === confirm
                          ? "1px solid rgba(16,185,129,.5)"
                          : "1px solid rgba(239,68,68,.5)"
                        : "1px solid rgba(0,212,255,.15)",
                    }}
                    onFocus={e => {
                      if (!confirm.length) e.target.style.borderColor = "rgba(0,212,255,.5)";
                    }}
                    onBlur={e => {
                      if (!confirm.length) e.target.style.borderColor = "rgba(0,212,255,.15)";
                    }}
                  />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowConf(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                    {showConf ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {confirm.length > 0 && password !== confirm && (
                  <p className="text-[10px] text-red-400 font-semibold">As senhas não coincidem</p>
                )}
              </div>

              {/* Requisitos */}
              <div className="px-3 py-2 rounded-lg space-y-1"
                style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                {[
                  { ok: password.length >= 8,           text: "Mínimo 8 caracteres" },
                  { ok: /[A-Z]/.test(password),          text: "Uma letra maiúscula" },
                  { ok: /[0-9]/.test(password),          text: "Um número" },
                ].map(r => (
                  <div key={r.text} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0 transition-all"
                      style={{ background: r.ok ? "#10B981" : "rgba(255,255,255,.15)" }} />
                    <span className="text-[10px]" style={{ color: r.ok ? "#10B981" : "#475569" }}>
                      {r.text}
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={loading || password.length < 8 || password !== confirm}
                className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all"
                style={{
                  background: loading || password.length < 8 || password !== confirm
                    ? "rgba(0,212,255,.1)"
                    : "linear-gradient(135deg, rgba(0,212,255,.25), rgba(124,58,237,.25))",
                  border: "1px solid rgba(0,212,255,.3)",
                  color: loading || password.length < 8 || password !== confirm ? "#334155" : "#00D4FF",
                  boxShadow: loading || password.length < 8 || password !== confirm
                    ? "none"
                    : "0 0 20px rgba(0,212,255,.15)",
                  cursor: loading || password.length < 8 || password !== confirm ? "not-allowed" : "pointer",
                }}>
                {loading ? "Salvando..." : "Definir minha senha"}
              </button>
            </form>
          </div>

          <p className="text-center text-[10px] text-slate-700 mt-4">
            Esta senha substitui a senha genérica criada pelo administrador.
          </p>
        </div>
      </div>
    </>
  );
}
