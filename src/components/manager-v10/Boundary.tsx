// Guarda de render: se algo dentro estourar, mostra o motivo em vez de deixar a
// tela branca. Serve pra não perder o painel inteiro por um erro de um pedaço.
import { Component, type ReactNode } from "react";

export class Boundary extends Component<
  { children: ReactNode },
  { erro: Error | null }
> {
  state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  render() {
    if (this.state.erro) {
      return (
        <div style={{ padding: 24, color: "var(--ink,#111)" }}>
          <h2 style={{ font: "800 18px Archivo,sans-serif", margin: "0 0 8px" }}>
            Algo quebrou ao montar esta tela
          </h2>
          <p style={{ fontSize: 13, color: "var(--ink-3,#667)", margin: "0 0 10px" }}>
            Tire um print desta mensagem e me mande — é o que preciso pra consertar.
          </p>
          <pre style={{
            fontSize: 12, whiteSpace: "pre-wrap", background: "var(--sunk,#f1f5f9)",
            border: "1px solid var(--line,#e2e8f0)", borderRadius: 8, padding: 12, overflowX: "auto",
          }}>
            {String(this.state.erro?.message ?? this.state.erro)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
