// Pastas do superintendente: o mesmo painel de Pastas da diretoria, só com as pastas das equipes dele
// (ligadas pelo corretor no Comandra — ver escopo.ts). A cobrança vai para o gerente.
import PastasPainel from "@/components/diretoria/PastasPainel";
import { useEscopoSuper } from "./escopo";
import "@/styles/diretoria.css";

export default function PastasDoSuper({ superId }: { superId: string }) {
  const { diretorId, supers, pastas, carregando } = useEscopoSuper(superId);
  return (
    <div className="dir s2-dir">
      <style>{`.mgr10 .s2-dir{min-height:0;background:transparent;display:flex;flex-direction:column;gap:20px;padding:0}`}</style>
      <header className="s2-top">
        <h1 style={{ fontSize: 28 }}>Pastas</h1>
        <p style={{ color: "var(--ink-2)", marginTop: 4, fontSize: 14 }}>
          As pastas do Junix dos corretores das suas equipes · ligadas pelo nome do corretor, porque no Junix a árvore das equipes é outra.
        </p>
      </header>
      {carregando || !diretorId ? <div className="dir-card dir-vazio">Lendo as pastas do Junix…</div>
        : !pastas.length ? (
          <div className="dir-card dir-vazio">
            Nenhuma pasta no Junix é de corretor das suas equipes. Se algum corretor tem pasta e não aparece aqui,
            o nome dele no Junix está diferente do cadastro no Comandra.
          </div>
        ) : <PastasPainel diretorId={diretorId} supers={supers} pastas={pastas} modoSuper />}
    </div>
  );
}
