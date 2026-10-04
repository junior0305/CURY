/**
 * Utilitário de cruzamento de check-ins do Contact2Sale (C2S) com corretores do Comandra.
 *
 * Aplica matching em múltiplos níveis para evitar colisão entre homônimos de outras equipes:
 * 1. Nome completo normalizado (sem acentos, minúsculo)
 * 2. Substring de nome completo (mínimo 5 caracteres)
 * 3. Primeiro nome:
 *    - Se houver apenas 1 corretor com esse primeiro nome na equipe e o gerente no C2S
 *      bater com o gerente da equipe (ou gerente C2S estiver vazio), atribui a ele.
 *    - Se houver mais de 1 corretor com o mesmo primeiro nome na equipe, desempata
 *      pelo sobrenome.
 */

export interface BrokerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface ManagerProfile {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
}

export interface C2SCheckinRow {
  corretor: string;
  gerente?: string | null;
  diretor?: string | null;
  created_at: string;
  tipos?: string | null;
}

export function normalizarTexto(s?: string | null): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function extrairTokensGerente(mgr?: ManagerProfile | null): string[] {
  if (!mgr) return [];
  return normalizarTexto(`${mgr.first_name || ""} ${mgr.last_name || ""}`)
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

export function casarCheckinsComEquipe(
  checkins: C2SCheckinRow[],
  corretores: BrokerProfile[],
  gerente?: ManagerProfile | null
): Array<{ checkin: C2SCheckinRow; brokerId: string }> {
  const norm = normalizarTexto;
  const mgrTokens = extrairTokensGerente(gerente);

  const porNomeCompleto = new Map<string, string>();
  const porPrimeiroNome = new Map<string, string[]>();

  for (const b of corretores) {
    const full = norm(`${b.first_name || ""} ${b.last_name || ""}`);
    const first = norm(b.first_name);
    if (full) porNomeCompleto.set(full, b.id);
    if (first) {
      const arr = porPrimeiroNome.get(first) ?? [];
      arr.push(b.id);
      porPrimeiroNome.set(first, arr);
    }
  }

  const matches: Array<{ checkin: C2SCheckinRow; brokerId: string }> = [];

  for (const ck of checkins) {
    const ckNome = norm(ck.corretor);
    const ckPrim = ckNome.split(/\s+/)[0];
    const ckGer = norm(ck.gerente);

    const gerenteBate =
      !ckGer || mgrTokens.length === 0 || mgrTokens.some((tok) => ckGer.includes(tok));

    let pid: string | null = null;
    if (porNomeCompleto.has(ckNome)) {
      pid = porNomeCompleto.get(ckNome)!;
    } else {
      for (const [full, id] of porNomeCompleto.entries()) {
        if (full.length >= 5 && (ckNome.includes(full) || full.includes(ckNome))) {
          pid = id;
          break;
        }
      }
    }

    if (!pid && ckPrim) {
      const candidatos = porPrimeiroNome.get(ckPrim) ?? [];
      if (candidatos.length === 1 && gerenteBate) {
        pid = candidatos[0];
      } else if (candidatos.length > 1) {
        for (const cid of candidatos) {
          const b = corretores.find((x) => x.id === cid);
          const bLast = norm(b?.last_name);
          if (bLast && ckNome.includes(bLast)) {
            pid = cid;
            break;
          }
        }
      }
    }

    if (pid) {
      matches.push({ checkin: ck, brokerId: pid });
    }
  }

  return matches;
}
