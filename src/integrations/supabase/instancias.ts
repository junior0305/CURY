// Cada empresa tem o seu Comandra: site e banco separados. O comandra.com.br é a porta de entrada:
// pelo domínio do login (joao@planoeplanogo) a tela leva a pessoa para o site da empresa dela,
// ANTES da senha — a senha é digitada só no site certo. Sem seletor de empresa.
// Domínio do login → endereço do site daquela empresa. Domínio que não está aqui fica neste site.
export const INSTANCIAS: Record<string, string> = {
  comandra: "https://comandra.com.br",
  planoego: "https://planoego.comandra.com.br",
};

/** Endereço do site da empresa deste e-mail, se for OUTRO site; senão null. */
export function outraInstancia(email: string): string | null {
  const dominio = (email.split("@")[1] || "").trim().toLowerCase();
  const destino = dominio ? INSTANCIAS[dominio] : undefined;
  if (!destino) return null;
  try { return new URL(destino).origin === window.location.origin ? null : destino; } catch { return null; }
}
