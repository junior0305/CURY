// A Estratégia do super é a mesma tela do diretor, um nível abaixo: onde o diretor lê "superintendências",
// o super lê "gerentes"; onde está "diretoria", é a "superintendência" dele. As telas da sessão Estratégia
// têm esses textos escritos direto (centenas), então em vez de duplicar 3 mil linhas a troca é feita no texto
// já desenhado, só dentro deste bloco. React reescreve o texto quando re-renderiza; o observador troca de novo.
import { useLayoutEffect, useRef, type ReactNode } from "react";

const TROCA: Record<string, string> = {
  superintendências: "equipes", superintendência: "equipe", superintendentes: "gerentes", superintendente: "gerente",
  Superintendências: "Equipes", Superintendência: "Equipe", Superintendentes: "Gerentes", Superintendente: "Gerente",
  SUPERINTENDÊNCIAS: "EQUIPES", SUPERINTENDÊNCIA: "EQUIPE", SUPERINTENDENTES: "GERENTES", SUPERINTENDENTE: "GERENTE",
  supers: "gerentes", Supers: "Gerentes", super: "gerente", Super: "Gerente",
  diretoria: "superintendência", Diretoria: "Superintendência", DIRETORIA: "SUPERINTENDÊNCIA",
  diretores: "superintendentes", diretor: "superintendente", Diretor: "Superintendente", DIRETOR: "SUPERINTENDENTE",
};
// uma passada só (a saída "superintendência" não volta a ser trocada)
const RE = new RegExp(`(?<![\\p{L}])(${Object.keys(TROCA).sort((a, b) => b.length - a.length).join("|")})(?![\\p{L}])`, "gu");
const ATRIBUTOS = ["placeholder", "title", "aria-label"];

export default function Vocabulario({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const raiz = ref.current;
    if (!raiz) return;
    const feito = new WeakMap<Node, string>();   // texto que nós mesmos escrevemos: não trocar de novo
    const texto = (n: Node) => {
      const v = n.nodeValue ?? "";
      if (feito.get(n) === v) return;
      const novo = v.replace(RE, (m) => TROCA[m] ?? m);
      feito.set(n, novo);
      if (novo !== v) n.nodeValue = novo;
    };
    const elemento = (el: Element) => {
      for (const a of ATRIBUTOS) {
        const v = el.getAttribute(a);
        if (v && RE.test(v)) { RE.lastIndex = 0; const novo = v.replace(RE, (m) => TROCA[m] ?? m); if (novo !== v) el.setAttribute(a, novo); }
        RE.lastIndex = 0;
      }
    };
    const varrer = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) { texto(n); return; }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const tag = (n as Element).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SCRIPT" || tag === "STYLE") { elemento(n as Element); return; }
      elemento(n as Element);
      n.childNodes.forEach(varrer);
    };
    varrer(raiz);
    const obs = new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === "characterData") texto(m.target);
        else if (m.type === "attributes") elemento(m.target as Element);
        else m.addedNodes.forEach(varrer);
      }
    });
    obs.observe(raiz, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
    return () => obs.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}
