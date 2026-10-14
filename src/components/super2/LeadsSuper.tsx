// Leads do superintendente com a Mídia dentro (como no painel do gerente): abas internas Leads | Mídia.
import { useState } from "react";
import TelaSuper, { AbasInternas } from "./Tela";
import Leads from "./Leads";
import Midia from "./Midia";

export default function LeadsSuper({ superId, inicial }: { superId: string; inicial?: "leads" | "midia" }) {
  const [sub, setSub] = useState<"leads" | "midia">(inicial ?? "leads");
  return (
    <TelaSuper>
      <AbasInternas<"leads" | "midia"> abas={[["leads", "Leads"], ["midia", "Mídia"]]} atual={sub} onTroca={(k) => setSub(k)} />
      {sub === "leads" ? <Leads superId={superId} /> : <Midia superId={superId} />}
    </TelaSuper>
  );
}
