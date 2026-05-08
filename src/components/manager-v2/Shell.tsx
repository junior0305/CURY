// Shell — wrapper compartilhado entre todas as subtelas do painel v2.
// Header + TopNav consistentes. Inter font carregada uma vez.

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import TopNav from "@/components/manager-v2/TopNav";
import { WhatsAppQRBanner } from "@/components/broker/WhatsAppQRBanner";

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

  return (
    <div
      className="min-h-screen text-slate-100 antialiased relative"
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        background: `
          radial-gradient(ellipse 90% 60% at 50% -10%, rgba(56,189,248,0.10), transparent 70%),
          radial-gradient(ellipse 60% 45% at 0% 100%, rgba(14,116,144,0.08), transparent 65%),
          radial-gradient(ellipse 60% 45% at 100% 80%, rgba(59,130,246,0.06), transparent 65%),
          linear-gradient(180deg, #020617 0%, #0F172A 50%, #0B1220 100%)
        `,
      }}
    >
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/50">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/manager"
              className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cockpit</span>
            </Link>
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: `${color}20`,
                  border: `1px solid ${color}50`,
                  boxShadow: `0 0 16px ${color}20`,
                }}
              >
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight">{title}</h1>
                {subtitle && (
                  <p className="text-[11px] text-slate-500">{subtitle}</p>
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
