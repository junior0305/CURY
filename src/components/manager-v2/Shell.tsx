// Shell — wrapper compartilhado entre todas as subtelas do painel v2.
// Header + TopNav consistentes. Inter font carregada uma vez.

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import TopNav from "@/components/manager-v2/TopNav";
import { WhatsAppQRBanner } from "@/components/broker/WhatsAppQRBanner";
import { adaptHex } from "@/components/manager-v2/palette";
import { useTheme } from "@/contexts/ThemeContext";

export function loadInter() {
  if (document.querySelector('link[data-v2-inter]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
  link.setAttribute("data-v2-inter", "true");
  document.head.appendChild(link);
}

interface Props {
  title: string;
  subtitle?: string;
  icon: any;
  color: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export default function Shell({ title, subtitle, icon: Icon, color, children, actions }: Props) {
  useEffect(loadInter, []);
  // A cor vem da subtela como hex calibrado pro escuro; aqui ela é traduzida
  // pro tema atual antes de virar fundo, borda e ícone.
  const { mode, preferLight } = useTheme();
  const accent = adaptHex(color, mode);
  // Mesmo padrão do Cockpit: azul + branco por default, escolha manual manda.
  useEffect(() => { preferLight(); }, [preferLight]);

  return (
    <div
      className="crm-themed min-h-screen antialiased relative"
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        color: "var(--crm-text)",
        // Fundo chapado, igual ao Cockpit. Os 3 gradientes radiais que existiam
        // aqui eram feitos pra preto — sobre branco viram manchas sujas — e de
        // qualquer forma competiam com o conteúdo numa ferramenta operacional.
        background: "var(--crm-bg)",
      }}
    >
      <header
        className="sticky top-0 z-30 backdrop-blur-xl"
        style={{
          background: "var(--crm-surface)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/manager"
              className="text-xs flex items-center gap-1 transition-colors hover:opacity-70"
              style={{ color: "var(--crm-text-muted)" }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cockpit</span>
            </Link>
            <div className="h-4 w-px" style={{ background: "var(--crm-border-mid)" }} />
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: `${accent}1F`,
                  border: `1px solid ${accent}55`,
                  boxShadow: mode === "light" ? `0 2px 8px ${accent}20` : `0 0 16px ${accent}20`,
                }}
              >
                <Icon className="w-4 h-4" style={{ color: accent }} />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight">{title}</h1>
                {subtitle && (
                  <p className="text-[11px]" style={{ color: "var(--crm-text-muted)" }}>{subtitle}</p>
                )}
              </div>
            </div>
          </div>
          {actions}
        </div>
      </header>
      <TopNav />
      <WhatsAppQRBanner />
      <main className="px-4 sm:px-6 mt-4 pb-16">{children}</main>
    </div>
  );
}
