import htmlContent from "../../public/mockup-gerente.html?raw";

export default function MockupGerente() {
  return (
    <iframe
      srcDoc={htmlContent}
      style={{
        width: "100vw",
        height: "100vh",
        border: "none",
        position: "fixed",
        inset: 0,
        zIndex: 999999,
      }}
      title="Mockup Cockpit Gerente"
    />
  );
}
