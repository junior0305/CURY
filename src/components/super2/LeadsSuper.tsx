// Leads do superintendente com a Mídia dentro — 100% no Design System do Cockpit do Gerente
import { useState } from "react";
import { AbasInternas } from "./Tela";
import Leads from "./Leads";
import Midia from "./Midia";
import LeadsOrigem from "@/components/leads/LeadsOrigem";
import "@/styles/cockpit-gerente.css";

export default function LeadsSuper({ superId, inicial }: { superId: string; inicial?: "leads" | "midia" }) {
  const [sub, setSub] = useState<"leads" | "midia">(inicial ?? "leads");

  return (
    <div className="cockpit-v3">
      <header className="cockpit-v3-header" style={{ marginBottom: 0 }}>
        <div className="cockpit-v3-title">
          <h1>Central de Leads & Mídia da Superintendência</h1>
          <p>Superintendência · Gestão de tráfego, canais de aquisição e saúde dos anúncios das equipes</p>
        </div>
      </header>

      <AbasInternas<"leads" | "midia">
        abas={[
          ["leads", "De onde vieram e para onde foram"],
          ["midia", "Saúde dos Anúncios Meta Ads"],
        ]}
        atual={sub}
        onTroca={(k) => setSub(k)}
      />

      {sub === "leads" ? <LeadsOrigem como={superId} /> : <Midia superId={superId} />}
    </div>
  );
}
