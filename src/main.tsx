import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";
import { carregarEmpresa } from "@/lib/empresa";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  // os dados da empresa (nome, diretoria no C2S, apelidos) vêm do banco antes de abrir; se falhar, abre igual
  carregarEmpresa().finally(() => root.render(<App />));
}