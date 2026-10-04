/**
 * Utilitário de cruzamento de check-ins do Contact2Sale (C2S) com corretores do Comandra.
 *
 * Aplica matching em múltiplos níveis para evitar colisão entre homônimos de outras equipes:
 * 1. Nome completo normalizado (sem acentos, minúsculo)
 * 2. Nome de guerra / primeiro nome / último nome ou login (@comandra)
 * 3. Substring de nome completo (mínimo 4 caracteres) ou interseção de tokens
 * 4. Validação de gerência:
 *    - Se o C2S registrar a Superintendência ou Diretoria (ex: "Superintendencia LilianeViana"),
 *      não bloqueia o corretor da equipe, pois é o nível guarda-chuva da operação.
 *    - Se registrar gerente específico conflitante, protege contra homônimos de outras equipes.
 */

export interface BrokerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
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
  const full = normalizarTexto(`${mgr.first_name || ""} ${mgr.last_name || ""}`);
  const tokens = full.split(/\s+/).filter((t) => t.length >= 3);
  // Variações conhecidas de apelidos
  if (tokens.some((t) => t.includes("eduardo") || t.includes("dudu"))) {
    tokens.push("eduardo", "dudu");
  }
  return [...new Set(tokens)];
}

export interface CheckinSemCadastro {
  checkin: C2SCheckinRow;
  corretorNome: string;
  gerenteNome: string | null;
}

export interface ClassificacaoCheckins {
  casados: Array<{ checkin: C2SCheckinRow; brokerId: string }>;
  semCadastro: CheckinSemCadastro[];
}

export function classificarCheckinsEquipe(
  checkins: C2SCheckinRow[],
  corretores: BrokerProfile[],
  gerente?: ManagerProfile | null
): ClassificacaoCheckins {
  const norm = normalizarTexto;
  const mgrTokens = extrairTokensGerente(gerente);

  const porNomeCompleto = new Map<string, string>();
  const porPrimeiroNome = new Map<string, string[]>();
  const porUltimoNome = new Map<string, string[]>();
  const porHandleEmail = new Map<string, string>();
  const tokensPorBroker = new Map<string, string[]>();

  for (const b of corretores) {
    const fn = norm(b.first_name);
    const ln = norm(b.last_name);
    const full = norm(`${b.first_name || ""} ${b.last_name || ""}`);
    const emailHandle = b.email ? norm(b.email.split("@")[0]) : "";

    if (full) porNomeCompleto.set(full, b.id);
    if (fn) {
      const arr = porPrimeiroNome.get(fn) ?? [];
      arr.push(b.id);
      porPrimeiroNome.set(fn, arr);
    }
    if (ln) {
      const arr = porUltimoNome.get(ln) ?? [];
      arr.push(b.id);
      porUltimoNome.set(ln, arr);
    }
    if (emailHandle) {
      porHandleEmail.set(emailHandle, b.id);
    }

    const tks = full.split(/\s+/).filter((t) => t.length >= 3);
    if (emailHandle && emailHandle.length >= 3) tks.push(emailHandle);
    tokensPorBroker.set(b.id, tks);
  }

  const casados: Array<{ checkin: C2SCheckinRow; brokerId: string }> = [];
  const semCadastro: CheckinSemCadastro[] = [];

  for (const ck of checkins) {
    const ckNome = norm(ck.corretor);
    if (!ckNome) continue;

    const ckTokens = ckNome.split(/\s+/).filter((t) => t.length >= 3);
    const ckPrim = ckTokens[0] || ckNome;
    const ckGer = norm(ck.gerente);

    // Se o C2S registrou superintendência/diretoria, não bloqueia o corretor da equipe
    const isSuperOuDiretoria =
      ckGer.includes("super") ||
      ckGer.includes("diretor") ||
      ckGer.includes("diretoria") ||
      ckGer.includes("geral") ||
      ckGer.includes("vendas");

    const gerenteBate =
      !ckGer ||
      isSuperOuDiretoria ||
      mgrTokens.length === 0 ||
      mgrTokens.some((tok) => ckGer.includes(tok));

    let pid: string | null = null;

    // 1. Nome completo exato ou handle do email
    if (porNomeCompleto.has(ckNome)) {
      pid = porNomeCompleto.get(ckNome)!;
    } else if (porHandleEmail.has(ckNome)) {
      pid = porHandleEmail.get(ckNome)!;
    }

    // 2. Substring de nome completo (>= 4 caracteres)
    if (!pid) {
      for (const [full, id] of porNomeCompleto.entries()) {
        if (full.length >= 4 && (ckNome.includes(full) || full.includes(ckNome))) {
          pid = id;
          break;
        }
      }
    }

    // 3. Primeiro nome ou nome de guerra
    if (!pid && ckPrim) {
      const candidatosPrim = porPrimeiroNome.get(ckPrim) ?? [];
      if (candidatosPrim.length === 1 && gerenteBate) {
        pid = candidatosPrim[0];
      } else if (candidatosPrim.length > 1) {
        // Desempata pelo sobrenome
        for (const cid of candidatosPrim) {
          const b = corretores.find((x) => x.id === cid);
          const bLast = norm(b?.last_name);
          if (bLast && ckNome.includes(bLast)) {
            pid = cid;
            break;
          }
        }
      }
    }

    // 4. Último nome como nome de guerra (ex: LEITÃO)
    if (!pid && ckTokens.length > 0) {
      for (const tk of ckTokens) {
        const candidatosUlt = porUltimoNome.get(tk) ?? [];
        if (candidatosUlt.length === 1 && gerenteBate) {
          pid = candidatosUlt[0];
          break;
        }
      }
    }

    // 5. Interseção de tokens de nome (ex: GALILEIA BN com GALILEIA)
    if (!pid && gerenteBate) {
      for (const [bid, bTks] of tokensPorBroker.entries()) {
        if (ckTokens.some((ct) => bTks.includes(ct))) {
          pid = bid;
          break;
        }
      }
    }

    if (pid) {
      casados.push({ checkin: ck, brokerId: pid });
    } else if (gerenteBate) {
      // Corretor registrou check-in para a equipe/superintendência mas ainda não tem perfil no Comandra
      semCadastro.push({
        checkin: ck,
        corretorNome: ck.corretor.trim(),
        gerenteNome: ck.gerente ?? null,
      });
    }
  }

  return { casados, semCadastro };
}

export function casarCheckinsComEquipe(
  checkins: C2SCheckinRow[],
  corretores: BrokerProfile[],
  gerente?: ManagerProfile | null
): Array<{ checkin: C2SCheckinRow; brokerId: string }> {
  return classificarCheckinsEquipe(checkins, corretores, gerente).casados;
}
