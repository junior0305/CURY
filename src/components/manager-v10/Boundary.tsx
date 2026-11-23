// Guarda de render: se algo dentro estourar, mostra o motivo em vez de deixar a
// tela branca. Serve pra não perder o painel inteiro por um erro de um pedaço.
import { Component, type ReactNode } from "react";

export class Boundary extends Component<
  { children: ReactNode },
  { erro: Error | null; onde: string }
> {
  state = { erro: null as Error | null, onde: "" };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error, info: { componentStack?: string }) {
    // onde = pilha de componentes (nomes) + 1ª linha do stack técnico
    const comp = (info?.componentStack || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6).join("\n");
    const tec = String((erro as any)?.stack || "").split("\n").slice(1, 4).map((s) => s.trim()).join("\n");
    this.setState({ onde: [comp, tec].filter(Boolean).join("\n— stack —\n") });
    try { console.error("[Boundary]", erro, info?.componentStack); } catch { /* ok */ }
  }

  render() {
    if (this.state.erro) {
      const box = {
        fontSize: 12, whiteSpace: "pre-wrap" as const, background: "var(--sunk,#f1f5f9)",
        border: "1px solid var(--line,#e2e8f0)", borderRadius: 8, padding: 12, overflowX: "auto" as const,
      };
      return (
        <div style={{ padding: 24, color: "var(--ink,#111)" }}>
          <h2 style={{ font: "800 18px Archivo,sans-serif", margin: "0 0 8px" }}>
            Algo quebrou ao montar esta tela
          </h2>
          <p style={{ fontSize: 13, color: "var(--ink-3,#667)", margin: "0 0 10px" }}>
            Tire um print desta mensagem (com o quadro de baixo) e me mande — é o que preciso pra consertar.
          </p>
          <pre style={box}>{String(this.state.erro?.message ?? this.state.erro)}</pre>
          {this.state.onde ? <pre style={{ ...box, marginTop: 10, fontSize: 11 }}>{this.state.onde}</pre> : null}
        </div>
      );
    }
    return this.props.children;
  }
}
