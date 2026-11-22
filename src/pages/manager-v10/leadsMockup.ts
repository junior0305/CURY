// AUTO-GERADO por scratchpad/montar_lc.py — mockup final (v5) do Leads.
// Nao edite a mao: contem CSS/HTML/JS do mockup escopados em .mlr. A logica de dados
// mora em LeadsCentral.tsx. Regerar: python3 montar_lc.py.
/* eslint-disable */
export const CSS = `
    .mlr {
      --bg: #090D16;
      --surface: #111827;
      --surface-card: #151F32;
      --surface-subtle: #1C283F;
      --border: #24324D;
      --border-subtle: #1B263B;
      --text-main: #F8FAFC;
      --text-muted: #94A3B8;
      --text-dim: #64748B;
      
      --brand: #0EA5E9;
      --brand-light: rgba(14, 165, 233, 0.15);
      --brand-hover: #38BDF8;

      --green: #10B981;
      --green-light: rgba(16, 185, 129, 0.15);
      --green-border: rgba(16, 185, 129, 0.35);

      --rose: #F43F5E;
      --rose-light: rgba(244, 63, 94, 0.15);
      --rose-border: rgba(244, 63, 94, 0.35);

      --amber: #F59E0B;
      --amber-light: rgba(245, 158, 11, 0.15);
      --amber-border: rgba(245, 158, 11, 0.35);

      --purple: #A855F7;
      --purple-light: rgba(168, 85, 247, 0.15);
      --purple-border: rgba(168, 85, 247, 0.35);

      --blue: #3B82F6;
      --blue-light: rgba(59, 130, 246, 0.15);
      --blue-border: rgba(59, 130, 246, 0.35);

      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 16px;
      --radius-full: 9999px;

      --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
      --shadow-lg: 0 12px 32px rgba(0,0,0,0.55);
    }

    .mlr[data-theme="light"] {
      --bg: #F1F5F9;
      --surface: #FFFFFF;
      --surface-card: #FFFFFF;
      --surface-subtle: #F8FAFC;
      --border: #CBD5E1;
      --border-subtle: #E2E8F0;
      --text-main: #0F172A;
      --text-muted: #475569;
      --text-dim: #94A3B8;

      --brand: #0284C7;
      --brand-light: rgba(2, 132, 199, 0.12);
      --brand-hover: #0369A1;

      --shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
      --shadow-lg: 0 12px 28px rgba(0,0,0,0.12);
    }

    .mlr * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .mlr {
      font-family: 'Archivo', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text-main);
      -webkit-font-smoothing: antialiased;
      line-height: 1.45;
      transition: background 0.2s, color 0.2s;
    }

    .mlr .mono { font-family: 'JetBrains Mono', monospace; }

    .mlr /* CONTROLE FLUTUANTE DE TEMA */
    .top-toolbar-proto {
      position: fixed;
      top: 14px;
      right: 18px;
      z-index: 1100;
      display: flex;
      gap: 8px;
      background: rgba(17, 24, 39, 0.85);
      backdrop-filter: blur(12px);
      padding: 6px 14px;
      border-radius: var(--radius-full);
      border: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: var(--shadow-lg);
    }
    .mlr .p-btn {
      background: transparent;
      border: none;
      color: #94A3B8;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: var(--radius-full);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
    }
    .mlr .p-btn:hover { color: #fff; }
    .mlr .p-btn.active {
      background: var(--brand);
      color: #fff;
    }

    .mlr /* LAYOUT GERAL COM MENU PRETO À ESQUERDA */
    .app-layout {
      display: grid;
      grid-template-columns: 240px 1fr;
      min-height: 100vh;
      max-width: 1740px;
      margin: 0 auto;
    }

    .mlr /* MENU LATERAL PRETO OFICIAL (RAIL V10) */
    .rail-sidebar {
      background: #0B0F19;
      border-right: 1px solid #1E293B;
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      gap: 28px;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      z-index: 950;
    }
    .mlr .rail-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 8px;
    }
    .mlr .brand-mark {
      width: 38px;
      height: 38px;
      background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 20px;
      color: #FFFFFF;
      box-shadow: 0 4px 14px rgba(14, 165, 233, 0.4);
    }
    .mlr .brand-title {
      font-weight: 800;
      font-size: 17px;
      letter-spacing: -0.02em;
      color: #F8FAFC;
      display: block;
    }
    .mlr .brand-sub {
      font-size: 11px;
      font-weight: 600;
      color: #64748B;
      display: block;
      margin-top: -2px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .mlr .rail-nav {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .mlr .nav-section-title {
      font-size: 10.5px;
      font-weight: 800;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 8px 10px 4px;
    }
    .mlr .rail-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      color: #94A3B8;
      font-size: 13.5px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.15s ease;
      cursor: pointer;
    }
    .mlr .rail-item:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #F1F5F9;
    }
    .mlr .rail-item.active {
      background: rgba(14, 165, 233, 0.12);
      color: #38BDF8;
      border-left: 3px solid #38BDF8;
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      padding-left: 9px;
    }
    .mlr .rail-item-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .mlr .rail-pip {
      font-size: 11px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: var(--radius-full);
      background: rgba(244, 63, 94, 0.2);
      color: #FB7185;
    }

    .mlr .rail-user {
      margin-top: auto;
      padding: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid #1E293B;
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .mlr .avatar-clean {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: #1E293B;
      border: 1.5px solid #38BDF8;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 12px;
      color: #F8FAFC;
    }

    .mlr /* ÁREA PRINCIPAL COM SCROLL */
    .main-content {
      padding: 0 36px 90px;
      overflow-y: auto;
    }

    .mlr /* ══════════════════════════════════════════════════════════════════════
       📌 BARRA DE CABEÇALHO & SELETOR DE DATA FIXA (STICKY NO TOPO)
       Fica permanentemente visível mesmo ao descer a tela inteira!
       ══════════════════════════════════════════════════════════════════════ */
    .sticky-header-bar {
      position: sticky;
      top: 0;
      z-index: 800;
      background: rgba(9, 13, 22, 0.94);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      padding: 20px 0 16px 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      margin-bottom: 24px;
    }
    .mlr[data-theme="light"] .sticky-header-bar {
      background: rgba(241, 245, 249, 0.94);
    }

    .mlr .leads-title h1 {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.02em;
    }
    .mlr .leads-title p {
      font-size: 12.5px;
      color: var(--text-muted);
    }

    .mlr /* SELETOR DE PERÍODO FIXADO */
    .periodo-pills {
      display: inline-flex;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 3px;
      gap: 2px;
      box-shadow: var(--shadow-sm);
    }
    .mlr .per-chip {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .mlr .per-chip:hover {
      color: var(--text-main);
      background: var(--surface-subtle);
    }
    .mlr .per-chip.active {
      background: var(--surface-card);
      color: var(--brand);
      box-shadow: var(--shadow-sm);
      border: 1px solid var(--border);
    }

    .mlr /* ══════════════════════════════════════════════════════════════════════
       🎙️ O SUSSURRO DA COMANDRA (RADAR EXECUTIVO COM ALERTA >30 DIAS)
       ══════════════════════════════════════════════════════════════════════ */
    .sussurro-card {
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.1) 0%, rgba(168, 85, 247, 0.08) 50%, rgba(16, 185, 129, 0.08) 100%);
      border: 1px solid rgba(14, 165, 233, 0.35);
      border-radius: var(--radius-lg);
      padding: 20px 24px;
      margin-bottom: 24px;
      box-shadow: 0 8px 24px rgba(14, 165, 233, 0.12);
    }
    .mlr .sussurro-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
    .mlr .sussurro-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(14, 165, 233, 0.2);
      border: 1px solid rgba(14, 165, 233, 0.4);
      padding: 4px 12px;
      border-radius: var(--radius-full);
      font-size: 12px;
      font-weight: 800;
      color: #38BDF8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .mlr .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #38BDF8;
      box-shadow: 0 0 10px #38BDF8;
      animation: pulseAnim 1.8s infinite;
    }
    @keyframes pulseAnim {
      0% { transform: scale(0.9); opacity: 0.8; }
      50% { transform: scale(1.4); opacity: 1; }
      100% { transform: scale(0.9); opacity: 0.8; }
    }
    .mlr .sussurro-channels {
      display: flex;
      gap: 6px;
    }
    .mlr .suss-chan-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 11.5px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: all 0.15s;
    }
    .mlr .suss-chan-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.12); }
    .mlr .suss-chan-btn.active {
      background: var(--surface-card);
      color: var(--text-main);
      border-color: var(--brand);
    }
    .mlr .sussurro-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
    .mlr .sussurro-item {
      background: var(--surface-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
      transition: all 0.2s;
    }
    .mlr .sussurro-item:hover {
      border-color: var(--brand);
      transform: translateY(-2px);
    }
    .mlr .sussurro-item.urgencia { border-left: 4px solid var(--rose); }
    .mlr .sussurro-item.oportunidade { border-left: 4px solid var(--green); }
    .mlr .sussurro-item.trafego { border-left: 4px solid var(--amber); }

    .mlr .sussurro-tag {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .mlr .sussurro-text {
      font-size: 12.5px;
      line-height: 1.45;
      color: var(--text-main);
    }
    .mlr .sussurro-impact {
      font-size: 11px;
      font-weight: 800;
      color: var(--text-muted);
    }
    .mlr .sussurro-actions {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }

    .mlr /* ══════════════════════════════════════════════════════════════════════
       ABAS DE NAVEGAÇÃO PRINCIPAL (4 ABAS)
       ══════════════════════════════════════════════════════════════════════ */
    .leads-nav-tabs {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 14px;
      margin-bottom: 22px;
    }
    .mlr .lead-tab-btn {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-muted);
      padding: 10px 18px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .mlr .lead-tab-btn:hover {
      background: var(--surface-subtle);
      color: var(--text-main);
      border-color: var(--text-dim);
    }
    .mlr .lead-tab-btn.active {
      background: var(--brand);
      color: #FFFFFF;
      border-color: var(--brand);
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.35);
    }
    .mlr .tab-badge {
      font-size: 11px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: var(--radius-full);
      background: rgba(255, 255, 255, 0.2);
      color: inherit;
    }
    .mlr .lead-tab-btn:not(.active) .tab-badge {
      background: var(--surface-subtle);
      color: var(--text-muted);
    }

    .mlr /* ══════════════════════════════════════════════════════════════════════
       BOTÕES DE AÇÃO LADO A LADO EM TODAS AS TABELAS (REPASSAR, COBRAR, VER)
       ══════════════════════════════════════════════════════════════════════ */
    .action-btn-group {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .mlr .act-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .mlr .act-btn.repassar {
      background: rgba(14, 165, 233, 0.12);
      color: #38BDF8;
      border-color: rgba(14, 165, 233, 0.3);
    }
    .mlr .act-btn.repassar:hover {
      background: #0EA5E9;
      color: #FFFFFF;
      border-color: #0EA5E9;
      box-shadow: 0 2px 8px rgba(14, 165, 233, 0.4);
    }
    .mlr .act-btn.cobrar {
      background: rgba(16, 185, 129, 0.12);
      color: #10B981;
      border-color: rgba(16, 185, 129, 0.3);
    }
    .mlr .act-btn.cobrar:hover {
      background: #10B981;
      color: #FFFFFF;
      border-color: #10B981;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
    }
    .mlr .act-btn.ver {
      background: rgba(148, 163, 184, 0.12);
      color: var(--text-muted);
      border-color: var(--border);
    }
    .mlr .act-btn.ver:hover {
      background: var(--surface-subtle);
      color: var(--text-main);
      border-color: var(--text-dim);
    }

    .mlr /* ══════════════════════════════════════════════════════════════════════
       ABA 1: FUNIL COMERCIAL DE 5 ETAPAS
       ══════════════════════════════════════════════════════════════════════ */
    .funnel-pipeline-v4 {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .mlr .funnel-stage-card {
      background: var(--surface-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }
    .mlr .funnel-stage-card:hover {
      transform: translateY(-2px);
      border-color: var(--brand);
      box-shadow: var(--shadow-md);
    }
    .mlr .funnel-stage-card.active {
      border-color: var(--brand);
      background: var(--surface-subtle);
      box-shadow: 0 0 0 1.5px var(--brand), var(--shadow-md);
    }
    .mlr .funnel-stage-card.bottleneck {
      border-color: var(--rose-border);
      background: linear-gradient(180deg, var(--surface-card) 0%, rgba(244, 63, 94, 0.05) 100%);
    }
    .mlr .funnel-stage-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .mlr .stage-idx {
      font-size: 11px;
      font-weight: 800;
      color: var(--text-dim);
      text-transform: uppercase;
    }
    .mlr .stage-conv-rate {
      font-size: 11px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: var(--radius-full);
      background: rgba(255, 255, 255, 0.06);
    }
    .mlr .stage-name {
      font-size: 13.5px;
      font-weight: 800;
      margin-bottom: 6px;
      color: var(--text-main);
    }
    .mlr .stage-count {
      font-size: 26px;
      font-weight: 900;
      line-height: 1.1;
      margin-bottom: 6px;
    }
    .mlr .stage-sub {
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .mlr .funnel-split-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 20px;
    }
    .mlr .panel-box {
      background: var(--surface-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }
    .mlr .panel-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .mlr .panel-header h3 {
      font-size: 14.5px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mlr /* ══════════════════════════════════════════════════════════════════════
       ABA 2: CAMPANHAS & MÍDIA (ALERTAS COMPLETOS + AÇÕES RÁPIDAS)
       ══════════════════════════════════════════════════════════════════════ */
    .media-alerts-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 24px;
    }
    .mlr .alert-decision-card {
      background: var(--surface-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
      transition: all 0.2s;
    }
    .mlr .alert-decision-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
    .mlr .alert-decision-card.lead-caro { border-left: 4px solid var(--rose); }
    .mlr .alert-decision-card.trocar-criativo { border-left: 4px solid var(--amber); }
    .mlr .alert-decision-card.aumentar-verba { border-left: 4px solid var(--green); }
    .mlr .alert-decision-card.leads-queimados { border-left: 4px solid var(--purple); }

    .mlr .alert-badge {
      font-size: 11px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: var(--radius-full);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      display: inline-block;
      width: fit-content;
    }
    .mlr .alert-decision-card h4 {
      font-size: 14px;
      font-weight: 800;
      color: var(--text-main);
    }
    .mlr .alert-decision-card p {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.4;
    }

    .mlr /* ══════════════════════════════════════════════════════════════════════
       ABA 3: FILAS & ROLETAS DE ANÚNCIOS
       ══════════════════════════════════════════════════════════════════════ */
    .queues-hero-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--surface-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px 20px;
      margin-bottom: 20px;
    }
    .mlr .queues-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .mlr .queue-form-card {
      background: var(--surface-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      transition: all 0.2s;
    }
    .mlr .queue-form-card:hover {
      border-color: var(--brand);
      box-shadow: var(--shadow-sm);
    }
    .mlr .queue-form-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }
    .mlr .queue-form-title {
      font-size: 14.5px;
      font-weight: 800;
      color: var(--text-main);
      display: block;
    }
    .mlr .queue-form-sub {
      font-size: 11.5px;
      color: var(--text-muted);
      display: block;
      margin-top: 2px;
    }
    .mlr .queue-brokers-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      padding: 8px 10px;
      background: var(--surface-subtle);
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);
    }
    .mlr .broker-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--surface-card);
      border: 1px solid var(--border);
      padding: 3px 8px;
      border-radius: var(--radius-full);
      font-size: 11.5px;
      font-weight: 700;
      color: var(--text-main);
    }
    .mlr .broker-chip .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .mlr /* ══════════════════════════════════════════════════════════════════════
       ABA 4: TODOS OS LEADS
       ══════════════════════════════════════════════════════════════════════ */
    .filter-pills-row {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .mlr .pill-health {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.15s ease;
    }
    .mlr .pill-health:hover {
      background: var(--surface-subtle);
      color: var(--text-main);
    }
    .mlr .pill-health.active {
      background: var(--surface-card);
      border-color: var(--brand);
      color: var(--text-main);
      box-shadow: 0 0 0 1px var(--brand);
    }
    .mlr .dot-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .mlr .dot-red { background: var(--rose); box-shadow: 0 0 6px var(--rose); }
    .mlr .dot-amber { background: var(--amber); box-shadow: 0 0 6px var(--amber); }
    .mlr .dot-green { background: var(--green); box-shadow: 0 0 6px var(--green); }
    .mlr .dot-purple { background: var(--purple); box-shadow: 0 0 6px var(--purple); }

    .mlr .leads-search-bar {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .mlr .search-input-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 9px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .mlr .search-input-box input {
      background: transparent;
      border: none;
      color: var(--text-main);
      font-size: 13.5px;
      width: 100%;
      outline: none;
    }
    .mlr .filter-select {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text-main);
      padding: 9px 12px;
      font-size: 13px;
      outline: none;
      cursor: pointer;
    }

    .mlr .leads-table-wrap {
      background: var(--surface-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow-x: auto;
      box-shadow: var(--shadow-sm);
    }
    .mlr .leads-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    .mlr .leads-table th {
      background: var(--surface-subtle);
      border-bottom: 1px solid var(--border);
      padding: 12px 14px;
      font-size: 11.5px;
      font-weight: 800;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .mlr .leads-table td {
      padding: 13px 14px;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 13px;
      vertical-align: middle;
    }
    .mlr .leads-table tr:hover {
      background: var(--surface-subtle);
    }

    .mlr /* SITUAÇÃO BADGES */
    .sit-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: var(--radius-full);
      font-size: 11px;
      font-weight: 800;
    }
    .mlr .sit-badge.fantasma {
      background: var(--rose-light);
      color: var(--rose);
      border: 1px solid var(--rose-border);
    }
    .mlr .sit-badge.vacuo {
      background: var(--amber-light);
      color: var(--amber);
      border: 1px solid var(--amber-border);
    }
    .mlr .sit-badge.avanco {
      background: var(--purple-light);
      color: var(--purple);
      border: 1px solid var(--purple-border);
    }
    .mlr .sit-badge.retorno {
      background: var(--green-light);
      color: var(--green);
      border: 1px solid var(--green-border);
    }

    .mlr /* BARRA FLUTUANTE DE AÇÕES EM LOTE */
    .sticky-batch-bar {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #0B0F19;
      border: 1px solid #38BDF8;
      border-radius: var(--radius-full);
      padding: 10px 22px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
      z-index: 1000;
      animation: slideUp 0.25s ease-out;
    }
    @keyframes slideUp {
      from { transform: translate(-50%, 40px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
    .mlr .batch-btn {
      padding: 8px 16px;
      border-radius: var(--radius-full);
      font-size: 12.5px;
      font-weight: 800;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .mlr .batch-btn.primary {
      background: var(--brand);
      color: #fff;
    }
    .mlr .batch-btn.ghost {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .mlr .batch-btn.ghost:hover {
      background: rgba(255, 255, 255, 0.18);
    }

    .mlr /* MODAIS */
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }
    .mlr .modal-container {
      background: #111827;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      width: 90%;
      max-width: 620px;
      box-shadow: var(--shadow-lg);
      overflow: hidden;
      animation: modalScale 0.2s ease-out;
    }
    @keyframes modalScale {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .mlr .modal-head {
      padding: 18px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .mlr .modal-head h3 {
      font-size: 16px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mlr .modal-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
    }
    .mlr .modal-close:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
    .mlr .modal-body {
      padding: 22px 24px;
      max-height: 70vh;
      overflow-y: auto;
    }
    .mlr .modal-foot {
      padding: 16px 24px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      background: #0B0F19;
    }

    .mlr /* TOAST */
    .toast-box {
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #10B981;
      color: #FFFFFF;
      padding: 10px 20px;
      border-radius: var(--radius-full);
      font-size: 13px;
      font-weight: 800;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      z-index: 3000;
      display: none;
      align-items: center;
      gap: 8px;
      animation: toastIn 0.25s ease-out;
    }
    @keyframes toastIn {
      from { transform: translate(-50%, -20px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
    .mlr /* ---- v5: entrada & distribuicao ---- */
    .prev-band {display:flex;gap:20px;flex-wrap:wrap;align-items:center;justify-content:space-between;
      background:linear-gradient(90deg,var(--surface-card),var(--surface));border:1px solid var(--border);
      border-radius:16px;padding:18px 22px;margin-bottom:18px}
    .mlr .prev-band .prev-lead {flex:1;min-width:260px}
    .mlr .prev-tiles {display:flex;gap:12px;flex-wrap:wrap}
    .mlr .ptile {background:var(--surface-subtle);border:1px solid var(--border);border-radius:12px;padding:10px 16px;min-width:120px}
    .mlr .ptile span {display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)}
    .mlr .ptile b {font-family:"JetBrains Mono",monospace;font-size:22px;font-weight:800;color:#fff;margin-top:2px;display:block}
    .mlr .ptile b i {font-style:normal;font-size:14px;color:var(--text-dim);font-weight:600}
    .mlr .ptile.good b {color:var(--green)}
    .mlr .v5grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
    .mlr .entrada-split {display:grid;grid-template-columns:1.2fr 1fr;gap:22px}
    @media(max-width:620px){.mlr .entrada-split {grid-template-columns:1fr}}
    .mlr .mini-lbl {font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;display:block}
    .mlr .bar-row {display:flex;align-items:center;gap:10px;margin-bottom:9px;font-size:13px}
    .mlr .bar-row .nm {width:118px;color:var(--text-muted);flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mlr .bar-track {flex:1;height:9px;background:var(--surface-subtle);border-radius:6px;overflow:hidden;min-width:0}
    .mlr .bar-fill {height:100%;background:var(--brand);border-radius:6px}
    .mlr .bar-row .vl {width:34px;text-align:right;font-family:"JetBrains Mono",monospace;font-weight:700;color:#fff;flex-shrink:0}
    .mlr .dist-chips {display:flex;flex-direction:column;gap:12px}
    .mlr .dchip {display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--surface-subtle);
      border:1px solid var(--border);border-radius:10px;padding:11px 14px}
    .mlr .dchip .k {font-size:13px;color:var(--text-muted)}
    .mlr .dchip .v {font-family:"JetBrains Mono",monospace;font-weight:800;font-size:16px;color:#fff}
    .mlr .dchip.auto {border-left:3px solid var(--green)} .mlr .dchip.excl {border-left:3px solid var(--purple)} .mlr .dchip.mao {border-left:3px solid var(--amber)}
    .mlr .jst {font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}
    .mlr .jst.ok {background:var(--green-light);color:var(--green)} .mlr .jst.afog {background:var(--rose-light);color:var(--rose)}
    .mlr .jst.pul {background:var(--amber-light);color:var(--amber)} .mlr .jst.chip {background:rgba(148,163,184,.15);color:var(--text-muted)}
    .mlr .sig-true {display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--green);font-weight:700}
    .mlr .sig-false {display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--rose);font-weight:700}
    .mlr .link-btn {background:none;border:1px solid var(--border);border-radius:8px;padding:5px 11px;font-size:12px;
      color:var(--brand);cursor:pointer;font-family:inherit;white-space:nowrap}
    .mlr .link-btn:hover {border-color:var(--brand);background:var(--brand-light)}
    .mlr .rep-row {display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
      background:var(--surface-subtle);border:1px solid var(--border);border-radius:10px;padding:12px 15px;margin-bottom:10px}
    .mlr .mkfila {display:grid;grid-template-columns:1fr 1fr;gap:14px}
    @media(max-width:620px){.mlr .mkfila {grid-template-columns:1fr}}
    .mlr .fld label {display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px}
    .mlr .fld select, .mlr .fld input {width:100%;background:var(--surface-subtle);border:1px solid var(--border);border-radius:10px;
      padding:11px 12px;color:#fff;font-size:13.5px;font-family:inherit;outline:none}
    .mlr .seg2 {display:flex;gap:8px}
    .mlr .seg2 button {flex:1;background:var(--surface-subtle);border:1px solid var(--border);border-radius:10px;padding:11px;
      color:var(--text-muted);font-size:13px;cursor:pointer;font-family:inherit}
    .mlr .seg2 button.on {background:var(--brand-light);border-color:var(--brand);color:var(--brand);font-weight:700}
    .mlr /* conversa espelhada */
    .conv-wrap {display:grid;grid-template-columns:1.3fr 1fr;gap:0}
    @media(max-width:700px){.mlr .conv-wrap {grid-template-columns:1fr}}
    .mlr .conv-chat {background:var(--bg);border-right:1px solid var(--border);padding:16px;max-height:62vh;overflow-y:auto}
    @media(max-width:700px){.mlr .conv-chat {border-right:0;border-bottom:1px solid var(--border)}}
    .mlr .bub {max-width:78%;padding:9px 13px;border-radius:14px;font-size:13.5px;line-height:1.45;margin-bottom:9px}
    .mlr .bub.cli {background:var(--surface-card);border:1px solid var(--border);color:var(--text-main)}
    .mlr .bub.cor {background:#124A36;border:1px solid var(--green-border);color:#E7FBF1;margin-left:auto}
    .mlr .bub .t {display:block;font-size:10px;color:var(--text-dim);margin-top:4px}
    .mlr .conv-side {padding:18px;max-height:62vh;overflow-y:auto}
    .mlr .sline {display:flex;gap:11px;margin-bottom:14px}
    .mlr .sline .dot {width:11px;height:11px;border-radius:50%;margin-top:4px;flex-shrink:0}
    .mlr .sline .dot.g {background:var(--green)} .mlr .sline .dot.b {background:var(--brand)} .mlr .sline .dot.a {background:var(--amber)} .mlr .sline .dot.d {background:var(--text-dim)}
    .mlr .sline b {color:#fff;font-size:13px} .mlr .sline p {color:var(--text-muted);font-size:12px;margin-top:1px}
    .mlr .sel-bar {display:none;align-items:center;gap:12px;background:var(--brand-light);border:1px solid var(--brand);
      border-radius:12px;padding:10px 16px;margin-bottom:14px}

    .mlr /* ---- v6 ---- */
    .jbar {display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:4px 14px 10px}
    .mlr .autorule {display:flex;gap:9px;align-items:flex-start;margin:0 14px 14px;background:var(--surface-subtle);border:1px dashed var(--border);border-radius:10px;padding:10px 13px;font-size:12.5px;color:var(--text-muted);cursor:pointer}
    .mlr .autorule input {margin-top:2px}
    .mlr .jacts {display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
    .mlr .wa-toggle {display:flex;gap:7px;align-items:center;font-size:12px;color:var(--text-muted);cursor:pointer}
    .mlr .rep-card {background:var(--surface-subtle);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px}
    .mlr .rep-top {display:flex;align-items:center;justify-content:space-between;gap:10px}
    .mlr .rep-top b {color:#fff;font-size:15px}
    .mlr .rep-why {color:var(--text-muted);font-size:12.5px;margin-top:6px;line-height:1.5}
    .mlr .rep-rule {margin-top:8px;font-size:11.5px;color:var(--text-main);background:var(--bg);border-radius:8px;padding:7px 10px;border:1px solid var(--border)}
    .mlr .rep-prev {margin-top:10px}
    .mlr .prev-l {display:flex;justify-content:space-between;font-size:13px;color:var(--text-muted);padding:3px 0}
    .mlr .prev-l b {color:#fff;font-family:"JetBrains Mono",monospace}
    .mlr .rep-acts {display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
    .mlr .rep-note {font-size:11px;color:var(--text-dim)}
    .mlr .per-note {background:var(--brand-light);border:1px solid rgba(14,165,233,.35);border-radius:10px;padding:10px 14px;font-size:12.5px;color:var(--text-main);margin-bottom:16px;line-height:1.5}
    .mlr .prev-line {background:var(--surface-card);border:1px solid var(--border);border-left:3px solid var(--amber);
      border-radius:10px;padding:11px 15px;font-size:13.5px;color:var(--text-main);margin-bottom:18px;line-height:1.5}    .mlr .repopt {display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;cursor:pointer;font-size:13.5px;color:var(--text-main)}
    .mlr .repopt:hover {background:var(--surface-subtle)}
    .mlr .repopt b {color:#fff;font-weight:600}
    .mlr .repav {width:26px;height:26px;border-radius:50%;background:var(--surface-subtle);border:1px solid var(--border);display:grid;place-items:center;font-size:10px;font-weight:800;color:var(--text-muted)}
    .mlr .repbadge {font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:999px}
    .mlr .repbadge.on {background:var(--green-light);color:var(--green)} .mlr .repbadge.pl {background:var(--brand-light);color:var(--brand)} .mlr .repbadge.off {background:rgba(148,163,184,.15);color:var(--text-dim)}    .mlr .pulso {display:flex;flex-wrap:wrap;background:var(--surface-card);border:1px solid var(--border);border-radius:14px;padding:4px;margin-bottom:18px}
    .mlr .pz {flex:1;min-width:130px;padding:10px 16px;border-right:1px solid var(--border)}
    .mlr .pz:last-child {border-right:0}
    .mlr .pz span {display:block;font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em}
    .mlr .pz b {display:block;font-family:"JetBrains Mono",monospace;font-size:21px;font-weight:800;color:#fff;margin-top:3px}
    .mlr .pz.warn b {color:var(--amber)}    .mlr .funsteps {display:flex;align-items:stretch;gap:8px;flex-wrap:wrap;padding:14px 16px}
    .mlr .fstep {flex:1;min-width:110px;background:var(--surface-subtle);border:1px solid var(--border);border-radius:11px;padding:11px 13px}
    .mlr .fstep span {display:block;font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em}
    .mlr .fstep b {display:block;font-family:"JetBrains Mono",monospace;font-size:20px;font-weight:800;color:#fff;margin-top:3px}
    .mlr .fstep b i {font-style:normal;font-size:12px;color:var(--text-muted);font-weight:600}
    .mlr .fstep.good {border-color:var(--green-border)} .mlr .fstep.good b {color:var(--green)}
    .mlr .farrow {display:flex;align-items:center;color:var(--text-dim);font-size:18px}
    @media(max-width:620px){.mlr .farrow {display:none}}    .mlr .trend-row {display:flex;align-items:center;gap:12px}
    .mlr .trend-row>span:first-child {flex:1;color:var(--text-muted);font-size:13.5px}
    .mlr .trend-row b {font-family:"JetBrains Mono",monospace;font-size:18px;color:#fff;min-width:60px;text-align:right}
    .mlr .tr {font-size:12px;font-weight:800;padding:2px 8px;border-radius:999px;min-width:58px;text-align:center}
    .mlr .tr.up {background:var(--green-light);color:var(--green)} .mlr .tr.down {background:var(--rose-light);color:var(--rose)}    .mlr .copilot-bar {display:flex;align-items:center;gap:10px;background:var(--surface-card);border:1px solid var(--border);border-left:3px solid var(--amber);border-radius:10px;padding:9px 13px;margin-bottom:16px;font-size:12.5px;color:var(--text-muted)}
    .mlr .copilot-bar .cb-tx {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mlr .copilot-bar b {color:#fff}
    .mlr .cb-toggle {background:none;border:1px solid var(--border);border-radius:7px;padding:4px 11px;color:var(--brand);font-size:12px;cursor:pointer;font-family:inherit;flex-shrink:0}
    .mlr .recebeu {background:var(--bg);border:1px dashed var(--border);border-radius:9px;padding:11px 13px;margin:-2px 0 10px}    .mlr .sec-h {font-size:13px;font-weight:800;letter-spacing:.04em;color:var(--text-main);margin:8px 0 12px;display:flex;align-items:center;gap:8px;text-transform:uppercase}
    .mlr .sec-h::after {content:"";flex:1;height:1px;background:var(--border)}    .mlr .midia-sub {display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
    .mlr .msub {background:var(--surface-card);border:1px solid var(--border);border-radius:10px;padding:9px 16px;color:var(--text-muted);font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}
    .mlr .msub.on {background:var(--brand-light);border-color:var(--brand);color:var(--brand)}    .mlr .chip-x {display:none;margin-left:6px;background:none;border:0;color:var(--rose);cursor:pointer;font-size:14px;line-height:1;font-family:inherit}
    .mlr .queue-brokers-chips.editing .chip-x {display:inline}
    .mlr .queue-brokers-chips.editing .broker-chip {border-color:var(--rose-border)}
    .mlr .fila-edit {background:var(--surface-subtle);border:1px solid var(--border);border-radius:10px;padding:13px;margin:10px 0}
    .mlr .fe-row {margin-bottom:12px}
    .mlr .fe-row:last-child {margin-bottom:0}
    .mlr .fe-row label {display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px}
    .mlr .fe-row select {width:100%;background:var(--surface-card);border:1px solid var(--border);border-radius:9px;padding:9px 11px;color:#fff;font-size:13px;font-family:inherit;outline:none}
  
    .mlr{height:100%;min-height:0;overflow-y:auto;overflow-x:hidden}
    .mlr .app-shell,.mlr .main-content{height:auto !important;min-height:0 !important;overflow:visible !important}
    .mlr .main-content{margin-left:0 !important;width:auto !important;max-width:none !important}
    .mlr .rail,.mlr .rail-v10,.mlr .theme-bar,.mlr #theme-bar{display:none !important}
`;
export const HTML = `<main class="main-content">
      
      <!-- ══════════════════════════════════════════════════════════════════════
           📌 CABEÇALHO FIXO COM SELETOR DE DATA STICKY (NUNCA SOME AO ROLAR)
           ══════════════════════════════════════════════════════════════════════ -->
      <header class="sticky-header-bar">
        <div class="leads-title">
          <h1>Central de Leads & Performance</h1>
          <p id="periodo-descricao-txt">Período Selecionado: <b>Esta Semana</b> (Seg 00:00 → Dom 23:59)</p>
        </div>

        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <!-- SELETOR DE PERÍODO FIXO -->
          <div class="periodo-pills">
            <button class="per-chip active" onclick="selecionarPeriodo('Hoje', this)">Hoje</button>
            <button class="per-chip" onclick="selecionarPeriodo('Ontem', this)">Ontem</button>
            <button class="per-chip" onclick="selecionarPeriodo('Esta Semana', this)">Esta Semana</button>
            <button class="per-chip" onclick="selecionarPeriodo('Este Mês', this)">Este Mês</button>
            <input type="date" id="per-data" title="Escolher uma data" onchange="if(this.value){document.querySelectorAll('.per-chip').forEach(function(c){c.classList.remove('active')});selecionarPeriodo('Dia:'+this.value, null)}" style="border:1px solid var(--border);background:var(--surface-subtle);color:var(--text-main);border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:700;cursor:pointer" />
          </div>

          <button class="act-btn repassar" style="padding: 8px 14px;" onclick="switchTab('filas')">
            ⚙️ Gerenciar Filas
          </button>
        </div>
      </header>

      <!-- ══════════════════════════════════════════════════════════════════════
           🎙️ O SUSSURRO DA COMANDRA (RADAR EXECUTIVO DO GESTOR & SUPER)
           ══════════════════════════════════════════════════════════════════════ -->


      <!-- ══════════════════════════════════════════════════════════════════════
           BARRA DE NAVEGAÇÃO ENTRE AS 4 ABAS MODERNAS
           ══════════════════════════════════════════════════════════════════════ -->
      <div class="leads-nav-tabs">
        <button class="lead-tab-btn active" id="tab-hoje-btn" onclick="switchTab('hoje')">
          <span>⏰</span> Hoje
          <span class="tab-badge" style="background: var(--rose-light); color: var(--rose);">3 p/ resolver</span>
        </button>
        <button class="lead-tab-btn" id="tab-negocios-btn" onclick="switchTab('negocios')">
          <span>📋</span> Todos os leads
          <span class="tab-badge">1.250</span>
        </button>
        <button class="lead-tab-btn" id="tab-midia-btn" onclick="switchTab('midia')">
          <span>📡</span> Mídia &amp; Filas
          <span class="tab-badge" style="background: var(--amber); color:#000;">4 alertas</span>
        </button>
        <button class="lead-tab-btn" id="tab-result-btn" onclick="switchTab('resultados')">
          <span>📊</span> Resultados
        </button>
      </div>

      <!-- ══════════════════════════════════════════════════════════════════════
           ABA 1: FUNIL COMERCIAL INTERATIVO
           ══════════════════════════════════════════════════════════════════════ -->
      <div id="view-funil" class="tab-view" style="display: none;">
        <div class="copilot-bar">
          <span>💡</span>
          <span class="cb-tx"><b>Copiloto</b> — Rios com 71 sem toque · Itaquera CPL alto · Barra Funda convertendo · 8 represados</span>
          <button class="cb-toggle" onclick="toggleCopilot()">ver as 4</button>
        </div>
        <div id="copilot-panel" class="panel-box" style="display:none;margin-bottom:16px">
          <div class="ra-list">
            <div class="ra-row rose"><div class="ra-ic">🔴</div><div class="ra-tx"><b>Rios</b> 71 sem toque + 342 parados &gt;30d — R$ 9.570 na gaveta.</div><div class="ra-ac"><button class="act-btn repassar" onclick="openModalRepassar('Lote Rios','71 sem toque','Rios')">Repassar</button></div></div>
            <div class="ra-row amber"><div class="ra-ic">🎯</div><div class="ra-tx"><b>Itaquera CPL R$ 37</b> (+22%) — fala com o tráfego.</div><div class="ra-ac"><button class="act-btn cobrar" onclick="showToast('✓ Mensagem enviada pelo chip do gerente (Evolution) — sem abrir nada')">Cobrar</button></div></div>
            <div class="ra-row green"><div class="ra-ic">💰</div><div class="ra-tx"><b>Barra Funda</b> 18 visitas, CPL R$ 24 — põe titulares pro sábado.</div><div class="ra-ac"><button class="act-btn repassar" onclick="openModalConfigFila('camp')">Ajustar fila</button></div></div>
            <div class="ra-row"><div class="ra-ic">⏳</div><div class="ra-tx"><b>8 represados</b> esperando soltar no Hoje.</div><div class="ra-ac"><button class="act-btn ver" onclick="switchTab('hoje')">Ir ao Hoje</button></div></div>
          </div>
        </div>
        <div class="per-note" style="border-color:rgba(168,85,247,.35);background:var(--purple-light)">📍 <b>Funil + Leads numa tela só.</b> Clique numa etapa pra ver e trabalhar os leads dela na tabela abaixo. Seleção em lote e ações logo em seguida.<br><b>1ª resposta (meta):</b> 🟢 até 15 min · 🟡 até 1h · 🔴 +1h = perdendo o lead.</div>
        
        <!-- O PIPELINE VISUAL DE 5 ETAPAS -->
        <div class="funnel-pipeline-v4">
          <!-- ETAPA 1 -->
          <div class="funnel-stage-card active" onclick="selectFunnelStage(1, this)">
            <div class="funnel-stage-top">
              <span class="stage-idx">Etapa 1</span>
              <span class="stage-conv-rate mono">Base 100%</span>
            </div>
            <div class="stage-name">Leads Recebidos</div>
            <div class="stage-count mono" style="color: var(--brand);">554</div>
            <div class="stage-sub">
              <span>CPL médio: <b class="mono">R$ 28,10</b></span>
            </div>
          </div>

          <!-- ETAPA 2 -->
          <div class="funnel-stage-card bottleneck" onclick="selectFunnelStage(2, this)">
            <div class="funnel-stage-top">
              <span class="stage-idx">Etapa 2</span>
              <span class="stage-conv-rate mono" style="color: var(--rose);">68% conv.</span>
            </div>
            <div class="stage-name">1ª resposta</div>
            <div class="stage-count mono">380</div>
            <div class="stage-sub">
              <span style="color: var(--rose); font-weight: 700;">⚠️ 174 sem toque (&gt;2h)</span>
            </div>
          </div>

          <!-- ETAPA 3 -->
          <div class="funnel-stage-card" onclick="selectFunnelStage(3, this)">
            <div class="funnel-stage-top">
              <span class="stage-idx">Etapa 3</span>
              <span class="stage-conv-rate mono">22% conv.</span>
            </div>
            <div class="stage-name">Visita no Stand</div>
            <div class="stage-count mono" style="color: var(--blue);">85</div>
            <div class="stage-sub">
              <span>42 agendadas p/ fim de semana</span>
            </div>
          </div>

          <!-- ETAPA 4 -->
          <div class="funnel-stage-card" onclick="selectFunnelStage(4, this)">
            <div class="funnel-stage-top">
              <span class="stage-idx">Etapa 4</span>
              <span class="stage-conv-rate mono">37% conv.</span>
            </div>
            <div class="stage-name">Pastas Caixa</div>
            <div class="stage-count mono">32</div>
            <div class="stage-sub">
              <span>Previsão: <b class="mono">R$ 9.4M</b></span>
            </div>
          </div>

          <!-- ETAPA 5 -->
          <div class="funnel-stage-card" style="border-color: var(--green-border);" onclick="selectFunnelStage(5, this)">
            <div class="funnel-stage-top">
              <span class="stage-idx">Etapa 5</span>
              <span class="stage-conv-rate mono" style="color: var(--green);">37% conv.</span>
            </div>
            <div class="stage-name">Vendas Fechadas</div>
            <div class="stage-count mono" style="color: var(--green);">12</div>
            <div class="stage-sub">
              <span>VGV Junix: <b class="mono">R$ 3.54M</b></span>
            </div>
          </div>
        </div>

      </div>

      <!-- ══════════════════════════════════════════════════════════════════════
           ABA 2: CAMPANHAS & MÍDIA
           ══════════════════════════════════════════════════════════════════════ -->
      <div id="view-campanhas" class="tab-view" style="display: none;">
        <div class="midia-sub">
          <button class="msub on" id="msub-filas" onclick="midiaSub('filas')">🔄 Filas</button>
          <button class="msub" id="msub-anuncios" onclick="midiaSub('anuncios')">📣 Anúncios (Meta)</button>
        </div>
        <div id="sub-anuncios" style="display:none">
          <div class="per-note">📅 Números no período selecionado — <b>Esta Semana</b>. Gasto e investimento vêm da Meta; trocar o período recalcula tudo.</div>
        <div class="media-alerts-grid">
          
          <!-- LEAD CARO -->
          <div class="alert-decision-card lead-caro">
            <div>
              <span class="alert-badge" style="background: var(--rose-light); color: var(--rose);">🔴 Lead Caro (CPL Alto)</span>
              <h4 style="margin-top: 8px;">Itaquera Fase 2 — CPL R$ 37,50</h4>
              <p>O custo por lead está <strong>+22% acima da média da diretoria (R$ 22,00)</strong>. Gasto de R$ 1.950 na semana gerou apenas 52 leads e 2 visitas.</p>
            </div>
            <div style="display: flex; gap: 6px; flex-direction: column;">
              <button class="act-btn cobrar" style="width: 100%; justify-content: center;" onclick="showToast('✓ Mensagem enviada pelo chip do gerente (Evolution) — sem abrir nada')">
                📲 Cobrar Tráfego (WhatsApp)
              </button>
              <div style="display: flex; gap: 6px;">
                <button class="act-btn repassar" style="flex: 1; justify-content: center;" onclick="showToast('Solicitação de pausa enviada ao gestor de tráfego!')">⏸️ Pausar Anúncio</button>
                <button class="act-btn ver" style="flex: 1; justify-content: center;" onclick="openModalConfigFila('camp')">👥 Editar fila aqui</button>
              </div>
            </div>
          </div>

          <!-- TROCAR CRIATIVO -->
          <div class="alert-decision-card trocar-criativo">
            <div>
              <span class="alert-badge" style="background: var(--amber-light); color: var(--amber);">🟡 Fadiga / Trocar Criativo</span>
              <h4 style="margin-top: 8px;">Parque dos Sonhos — Freq 4.1x</h4>
              <p>O público já viu o anúncio mais de 4 vezes. A taxa de cliques (CTR) caiu <strong>38%</strong> e o custo por mil impressões subiu rápido.</p>
            </div>
            <div style="display: flex; gap: 6px; flex-direction: column;">
              <button class="act-btn cobrar" style="width: 100%; justify-content: center;" onclick="showToast('✓ Mensagem enviada pelo chip do gerente (Evolution) — sem abrir nada')">
                📲 Pedir Novos Criativos
              </button>
              <div style="display: flex; gap: 6px;">
                <button class="act-btn repassar" style="flex: 1; justify-content: center;" onclick="showToast('Alerta de novos criativos agendado!')">📸 Gravar no Stand</button>
                <button class="act-btn ver" style="flex: 1; justify-content: center;">👁️ Ver Ativos</button>
              </div>
            </div>
          </div>

          <!-- ESCALAR VERBA -->
          <div class="alert-decision-card aumentar-verba">
            <div>
              <span class="alert-badge" style="background: var(--green-light); color: var(--green);">🟢 Oportunidade / Escalar</span>
              <h4 style="margin-top: 8px;">Cury Mooca — CPL R$ 24,10</h4>
              <p>Campanha campeã com <strong>-31% de CPL vs média</strong>, gerando 18 visitas e 3 vendas Junix. O estande pode absorver mais volume.</p>
            </div>
            <div style="display: flex; gap: 6px; flex-direction: column;">
              <button class="act-btn cobrar" style="width: 100%; justify-content: center; background: rgba(16, 185, 129, 0.15); border-color: var(--green);" onclick="showToast('✓ Mensagem enviada pelo chip do gerente (Evolution) — sem abrir nada')">
                🚀 Recomendar +30% de Verba
              </button>
              <div style="display: flex; gap: 6px;">
                <button class="act-btn repassar" style="flex: 1; justify-content: center;" onclick="switchTab('filas')">👥 Reforçar Fila</button>
                <button class="act-btn ver" style="flex: 1; justify-content: center;">📊 Ver ROI</button>
              </div>
            </div>
          </div>

          <!-- LEADS QUEIMADOS -->
          <div class="alert-decision-card leads-queimados">
            <div>
              <span class="alert-badge" style="background: var(--purple-light); color: var(--purple);">🟣 Desperdício / Queimados</span>
              <h4 style="margin-top: 8px;">Mooca Express — 62% Sem Toque</h4>
              <p>Mídia entregou a R$ 19,00, mas os corretores demoraram <strong>3h40</strong> para chamar. R$ 850 queimados sem resposta.</p>
            </div>
            <div style="display: flex; gap: 6px; flex-direction: column;">
              <button class="act-btn repassar" style="width: 100%; justify-content: center;" onclick="openModalRepassar('Lote Mooca Express', '38 Leads sem toque da campanha', 'Corretores da Fila')">
                ⚡ Redistribuir Queimados
              </button>
              <div style="display: flex; gap: 6px;">
                <button class="act-btn cobrar" style="flex: 1; justify-content: center;" onclick="showToast('✓ Mensagem enviada pelo chip do gerente (Evolution) — sem abrir nada')">💬 Cobrar Equipe</button>
                <button class="act-btn ver" style="flex: 1; justify-content: center;" onclick="switchTab('filas')">🔄 Trocar Fila</button>
              </div>
            </div>
          </div>
        </div>

        <!-- TABELA DE CAMPANHAS -->
        <div class="panel-box">
          <div class="panel-header">
            <h3>📊 Painel completo das campanhas</h3><span style="color:var(--text-muted);font-size:12px">ordene por % resposta — o sinal limpo</span>
            <span style="font-size: 12px; color: var(--text-muted);">Sincronizado via Meta Marketing API</span>
          </div>

          <table class="leads-table">
            <thead>
              <tr>
                <th>Campanha & Plataforma</th>
                <th>Investimento</th>
                <th>CPL Médio</th>
                <th>Meta × CRM</th>
                <th>Visitas Stand</th>
                <th>Vendas Junix</th>
                <th style="text-align: right;">Ações de Decisão</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b style="font-size: 13.5px;">Cury Mooca — Apartamentos 2 Dorms</b>
                  <span style="display: block; font-size: 11px; color: var(--text-muted);">Meta Ads · Form Nativo</span>
                </td>
                <td class="mono">R$ 2.450</td>
                <td>
                  <b class="mono" style="color: var(--green);">R$ 24,10</b>
                  <span style="display: block; font-size: 10.5px; color: var(--green); font-weight: 700;">-31% vs média</span>
                </td>
                <td>
                  <span class="mono">102 × 102</span>
                  <span class="sit-badge retorno" style="font-size: 10px; margin-left: 4px;">100% OK</span>
                </td>
                <td class="mono" style="font-weight: 800; color: var(--blue);">18 visitas</td>
                <td class="mono" style="font-weight: 900; color: var(--green);">3 un (R$ 885k)</td>
                <td style="text-align: right;">
                  <div class="action-btn-group">
                    <button class="act-btn repassar" onclick="switchTab('filas'); openModalConfigFila('form-mooca')">👥 Fila (4)</button>
                    <button class="act-btn cobrar" onclick="showToast('✓ Mensagem enviada pelo chip do gerente (Evolution) — sem abrir nada')">📲 Cobrar</button>
                    <button class="act-btn ver" onclick="showToast('Abrindo relatório de criativos...')">👁️ Ver</button>
                  </div>
                </td>
              </tr>

              <tr>
                <td>
                  <b style="font-size: 13.5px;">Cury Itaquera — Fase 2</b>
                  <span style="display: block; font-size: 11px; color: var(--text-muted);">Meta Ads · Stories</span>
                </td>
                <td class="mono">R$ 1.950</td>
                <td>
                  <b class="mono" style="color: var(--rose);">R$ 37,50</b>
                  <span style="display: block; font-size: 10.5px; color: var(--rose); font-weight: 700;">+22% vs média</span>
                </td>
                <td>
                  <span class="mono">52 × 52</span>
                  <span class="sit-badge retorno" style="font-size: 10px; margin-left: 4px;">100% OK</span>
                </td>
                <td class="mono" style="font-weight: 800; color: var(--rose);">2 visitas</td>
                <td class="mono" style="color: var(--text-muted);">0 un</td>
                <td style="text-align: right;">
                  <div class="action-btn-group">
                    <button class="act-btn repassar" onclick="switchTab('filas'); openModalConfigFila('form-itaquera')">👥 Fila (Sem Fila!)</button>
                    <button class="act-btn cobrar" onclick="showToast('✓ Mensagem enviada pelo chip do gerente (Evolution) — sem abrir nada')">📲 Cobrar</button>
                    <button class="act-btn ver">👁️ Ver</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        </div><!-- /sub-anuncios -->

      </div><!-- /view-campanhas -->

      <div id="view-filas" class="tab-view" style="display: none;">
        <div class="sec-h">🔄 Filas de distribuição — criar &amp; manter</div>
        <p style="color:var(--text-muted);font-size:12.5px;margin:-6px 0 16px;line-height:1.5">A fila diz <b style="color:var(--text-main)">pra quem vai cada lead</b> por origem (formulário, página, região). Crie novas e mantenha as que já rodam — quem está dentro, status e rodízio.</p>
        <div class="panel-box" style="margin-bottom:16px">
          <div class="panel-header"><h3>➕ Criar fila de distribuição</h3><span style="color:var(--text-muted);font-size:12px">respeita o isolamento da página/empresa</span></div>
          <div class="mkfila" style="padding:16px">
            <div class="fld"><label>Origem (gatilho)</label><select><option value="">Escolha o formulário…</option></select></div>
            <div class="fld"><label>Vai para</label><div class="seg2"><button class="on">🔄 Roleta da equipe</button><button>🎯 Corretores específicos</button></div></div>
          </div>
          <div style="padding:0 16px 16px"><button class="act-btn repassar" style="justify-content:center">Criar fila</button></div>
        </div>
        <div class="queues-hero-bar">
          <div>
            <h3 style="font-size: 16px; font-weight: 800;">🔄 Distribuição de Leads por Formulário Meta Ads</h3>
            <p style="font-size: 12.5px; color: var(--text-muted); margin-top: 2px;">
              A fila do formulário <strong>MANDA</strong>: corretores escolhidos recebem em rodízio exclusivo mesmo fora do estande.
            </p>
          </div>
          <button class="act-btn repassar" style="padding: 10px 18px;" onclick="window.__filaCriar&&window.__filaCriar()">
            ➕ Criar Nova Fila de Formulário
          </button>
        </div>

        <div class="queues-grid"><div style="padding:16px;color:var(--text-dim)">Carregando filas…</div></div>
      </div>

      <!-- ══════════════════════════════════════════════════════════════════════
           ABA 4: TODOS OS LEADS (TABELA LIMPA E AÇÕES LADO A LADO)
           ══════════════════════════════════════════════════════════════════════ -->
      <div id="view-leads" class="tab-view" style="display: none;">
        
        <!-- PÍLULAS DE SAÚDE -->
        <div class="filter-pills-row">
          <div class="pill-health active" onclick="filterPill('todos', this)">
            <span>Todos da Carteira</span>
            <span class="tab-badge">1.250</span>
          </div>
          <div class="pill-health" onclick="filterPill('fantasma', this)">
            <span class="dot-indicator dot-red"></span>
            <span>Sem contato</span>
            <span class="tab-badge" style="background: var(--rose-light); color: var(--rose);">554</span>
          </div>
          <div class="pill-health" onclick="filterPill('vacuo', this)">
            <span class="dot-indicator dot-amber"></span>
            <span>Cliente no Vácuo (&gt;2h)</span>
            <span class="tab-badge" style="background: var(--amber-light); color: var(--amber);">76</span>
          </div>
          <div class="pill-health" onclick="filterPill('avanco', this)">
            <span class="dot-indicator dot-purple"></span>
            <span>Avanço Sem Anotação</span>
            <span class="tab-badge" style="background: var(--purple-light); color: var(--purple);">68</span>
          </div>
          <div class="pill-health" onclick="filterPill('retorno', this)">
            <span class="dot-indicator dot-green"></span>
            <span>Com Retorno Agendado</span>
            <span class="tab-badge" style="background: var(--green-light); color: var(--green);">30</span>
          </div>
        </div>

        <!-- BARRA DE BUSCA -->
        <div class="leads-search-bar">
          <div class="search-input-box">
            <span>🔍</span>
            <input type="text" placeholder="Buscar por cliente, telefone, produto ou campanha..." id="search-leads-input" onkeyup="handleSearch(this.value)" />
          </div>

          <select class="filter-select" id="select-corretor" onchange="handleCorretorChange(this.value)">
            <option value="todos">Todos os Corretores</option>
            <option value="rios">Rios (71 parados) 🔴</option>
            <option value="lisandra">Lisandra (24 parados) 🟡</option>
            <option value="carol">Carol (18 parados) 🔴</option>
            <option value="diego">Diego (2 parados) 🟢</option>
          </select>

          <select class="filter-select" id="select-origem">
            <option value="todas">Todas as origens</option>
              <option value="meta">Anúncio (Meta Ads)</option>
              <option value="disparo">Disparo WhatsApp</option>
              <option value="discador">Discador (ligações)</option>
              <option value="pescaria">Pescaria (repesca)</option>
              <option value="plantao">Plantão (C2S estande)</option>
              <option value="indicacao">Indicação</option>
          </select>
        </div>

        <!-- TABELA LIMPA COM AS AÇÕES LADO A LADO -->
        <div class="leads-table-wrap">
          <table class="leads-table" id="table-main-leads">
            <thead>
              <tr>
                <th style="width: 38px;">
                  <input type="checkbox" id="chk-select-all" onclick="toggleSelectAll(this.checked)" />
                </th>
                <th>Cliente</th>
                <th>Produto / Origem</th>
                <th>Corretor Atual</th>
                <th>Trabalho (sinal real)</th>
                <th>Tempo</th>
                <th style="text-align: right;">Ações de Decisão (Lado a Lado)</th>
              </tr>
            </thead>
            <tbody id="leads-tbody">
              <!-- LINHA 1 -->
              <tr data-type="fantasma" data-corretor="rios">
                <td><input type="checkbox" class="lead-chk" onclick="updateBatchBar()" /></td>
                <td>
                  <b style="font-size: 13.5px;">Rodrigo Albuquerque</b>
                  <span class="mono" style="display:block; font-size: 11.5px; color: var(--text-muted);">(11) 98711-2041</span>
                </td>
                <td>
                  <span style="font-size: 12px; color: var(--brand); font-weight: 700;">Meta Ads · Cury Mooca</span>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="avatar-clean" style="width: 26px; height: 26px; font-size: 10px;">RI</div>
                    <b>Rios</b>
                  </div>
                </td>
                <td>
                  <span class="sit-badge fantasma">🔴 Sem contato</span>
                </td>
                <td class="mono" style="color: var(--rose); font-weight: 700;">3 dias sem contato</td>
                <td style="text-align: right;">
                  <div class="action-btn-group">
                    <button class="act-btn repassar" onclick="openModalRepassar('Rodrigo Albuquerque', 'Cury Mooca', 'Rios')">⚡ Repassar</button>
                    <button class="act-btn cobrar" onclick="showToast('✓ Mensagem enviada pelo chip do gerente (Evolution) — sem abrir nada')">💬 Cobrar</button>
                    <button class="act-btn ver" onclick="openModalVer('rodrigo', 'Rodrigo Albuquerque', '(11) 98711-2041', 'Cury Mooca', 'Rios', 'Sem contato', '3 dias', 'Meta Ads')">👁️ Ver</button>
                  </div>
                </td>
              </tr>

              <!-- LINHA 2 -->
              <tr data-type="vacuo" data-corretor="lisandra">
                <td><input type="checkbox" class="lead-chk" onclick="updateBatchBar()" /></td>
                <td>
                  <b style="font-size: 13.5px;">Mariana Fernandes</b>
                  <span class="mono" style="display:block; font-size: 11.5px; color: var(--text-muted);">(11) 97402-9981</span>
                </td>
                <td>
                  <span style="font-size: 12px; color: var(--brand); font-weight: 700;">Meta Ads · Itaquera</span>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="avatar-clean" style="width: 26px; height: 26px; font-size: 10px;">LI</div>
                    <b>Lisandra</b>
                  </div>
                </td>
                <td>
                  <span class="sit-badge vacuo">🟡 Cliente no vácuo</span>
                </td>
                <td class="mono" style="color: var(--amber); font-weight: 700;">5h no vácuo</td>
                <td style="text-align: right;">
                  <div class="action-btn-group">
                    <button class="act-btn repassar" onclick="openModalRepassar('Mariana Fernandes', 'Itaquera', 'Lisandra')">⚡ Repassar</button>
                    <button class="act-btn cobrar" onclick="showToast('✓ Mensagem enviada pelo chip do gerente (Evolution) — sem abrir nada')">💬 Cobrar</button>
                    <button class="act-btn ver" onclick="openModalVer('mariana', 'Mariana Fernandes', '(11) 97402-9981', 'Itaquera', 'Lisandra', 'Cliente no vácuo', '5h', 'Meta Ads')">👁️ Ver</button>
                  </div>
                </td>
              </tr>

              <!-- LINHA 3 -->
              <tr data-type="avanco" data-corretor="rios">
                <td><input type="checkbox" class="lead-chk" onclick="updateBatchBar()" /></td>
                <td>
                  <b style="font-size: 13.5px;">Felipe Barreto</b>
                  <span class="mono" style="display:block; font-size: 11.5px; color: var(--text-muted);">(11) 99120-4433</span>
                </td>
                <td>
                  <span style="font-size: 12px; color: var(--brand); font-weight: 700;">Disparo WhatsApp</span>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="avatar-clean" style="width: 26px; height: 26px; font-size: 10px;">RI</div>
                    <b>Rios</b>
                  </div>
                </td>
                <td>
                  <span class="sit-badge avanco">🟣 Avanço sem Registro</span>
                </td>
                <td class="mono">Avançou de etapa</td>
                <td style="text-align: right;">
                  <div class="action-btn-group">
                    <button class="act-btn repassar" onclick="openModalRepassar('Felipe Barreto', 'Disparo Whats', 'Rios')">⚡ Repassar</button>
                    <button class="act-btn cobrar" onclick="showToast('✓ Mensagem enviada pelo chip do gerente (Evolution) — sem abrir nada')">💬 Cobrar</button>
                    <button class="act-btn ver" onclick="openModalVer('felipe', 'Felipe Barreto', '(11) 99120-4433', 'Disparo Whats', 'Rios', 'Avanço sem Registro', 'Ontem', 'WhatsApp')">👁️ Ver</button>
                  </div>
                </td>
              </tr>

              <!-- LINHA 4 -->
              <tr data-type="retorno" data-corretor="diego">
                <td><input type="checkbox" class="lead-chk" onclick="updateBatchBar()" /></td>
                <td>
                  <b style="font-size: 13.5px;">Camila Prado</b>
                  <span class="mono" style="display:block; font-size: 11.5px; color: var(--text-muted);">(11) 98214-0019</span>
                </td>
                <td>
                  <span style="font-size: 12px; color: var(--brand); font-weight: 700;">Meta Ads · Cury Mooca</span>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="avatar-clean" style="width: 26px; height: 26px; font-size: 10px;">DI</div>
                    <b>Diego</b>
                  </div>
                </td>
                <td>
                  <span class="sit-badge retorno">🟢 Visita Marcada Sáb 14h</span>
                </td>
                <td class="mono" style="color: var(--green); font-weight: 700;">No prazo</td>
                <td style="text-align: right;">
                  <div class="action-btn-group">
                    <button class="act-btn repassar" onclick="openModalRepassar('Camila Prado', 'Cury Mooca', 'Diego')">⚡ Repassar</button>
                    <button class="act-btn cobrar" onclick="showToast('✓ Mensagem enviada pelo chip do gerente (Evolution) — sem abrir nada')">💬 Cobrar</button>
                    <button class="act-btn ver" onclick="openModalVer('camila', 'Camila Prado', '(11) 98214-0019', 'Cury Mooca', 'Diego', 'Visita Marcada', 'Amanhã 14h', 'Meta Ads')">👁️ Ver</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- PAGINAÇÃO -->
          <div style="padding: 12px 18px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--text-muted);">
            <span>Mostrando <b>1 a 4 de 1.250 leads</b></span>
            <div style="display: flex; gap: 6px;">
              <button class="act-btn ver" disabled>Anterior</button>
              <button class="act-btn repassar" style="font-weight: 800;">1</button>
              <button class="act-btn ver">2</button>
              <button class="act-btn ver">3</button>
              <button class="act-btn ver">Próximo</button>
            </div>
          </div>
        </div>

      </div>

      <!-- ══════════════════════════════════════════════════════════════════════
           ABA NOVA: ENTRADA & DISTRIBUIÇÃO (justiça da roleta)
           ══════════════════════════════════════════════════════════════════════ -->
      <div id="view-distrib" class="tab-view">
        <!-- PULSO -->
        <div class="pulso">
          <div class="pz"><span>Entraram hoje</span><b>187</b></div>
          <div class="pz"><span>Distribuídos</span><b>182</b></div>
          <div class="pz warn"><span>⏳ Represados</span><b>8</b></div>
          <div class="pz"><span>🟡 No vácuo</span><b>76</b></div>
          <div class="pz"><span>Previsão do mês</span><b style="color:var(--amber);font-size:15px">faltam 9 visitas</b></div>
        </div>

        <!-- 1) LEADS ESPERANDO SOLTAR -->
        <div class="panel-box" style="margin-bottom:16px">
          <div class="panel-header"><h3>⏳ Leads esperando soltar</h3><label class="wa-toggle"><input type="checkbox" checked/> avisar no WhatsApp</label></div>
          <div style="padding:14px">
            <div class="rep-row" onclick="toggleRecebeu('r1')" style="cursor:pointer">
              <div><b style="color:var(--text-main);font-size:14px">8 segurados</b><p style="color:var(--text-muted);font-size:12px;margin-top:2px">ninguém logou às 09:30 · regra: <b>manual · sorteio</b> <span style="color:var(--brand)">· ver quem recebe ▾</span></p></div>
              <button class="act-btn repassar" onclick="event.stopPropagation();showToast('8 soltos por sorteio — corretores avisados')">Soltar (8)</button>
            </div>
            <div id="rec-r1" class="recebeu" style="display:none">
              <span class="mini-lbl" style="margin-bottom:8px">Se soltar agora (ordem sorteada do dia):</span>
              <div class="prev-l"><span>1º Caick · Jaguar</span><b>3</b></div>
              <div class="prev-l"><span>2º Ully · Dudu</span><b>3</b></div>
              <div class="prev-l"><span>3º Claudete · Gouveia</span><b>2</b></div>
            </div>
            <div class="rep-row" onclick="toggleRecebeu('r2')" style="cursor:pointer">
              <div><b style="color:var(--text-main);font-size:14px">4 sem dono</b><p style="color:var(--text-muted);font-size:12px;margin-top:2px">fila exclusiva de líder sem corretor <span style="color:var(--brand)">· ver quem recebe ▾</span></p></div>
              <button class="act-btn cobrar" onclick="event.stopPropagation();showToast('Direcionar os 4')">Direcionar (4)</button>
            </div>
            <div id="rec-r2" class="recebeu" style="display:none">
              <span class="mini-lbl" style="margin-bottom:8px">Vão pros corretores da fila exclusiva:</span>
              <div class="prev-l"><span>Amanda · Antonia</span><b>2</b></div>
              <div class="prev-l"><span>Donna · Antonia</span><b>2</b></div>
            </div>
            <p style="color:var(--text-dim);font-size:11px;margin-top:4px;line-height:1.5">O soltar segue a config: some no <b>automático</b>; o quadro some se a represa estiver <b>desligada</b>.</p>
          </div>
        </div>

        <!-- 2) A DISTRIBUIÇÃO ESTÁ JUSTA? -->
        <div class="panel-box" style="margin-bottom:16px">
          <div class="panel-header"><h3>⚖️ A distribuição está justa?</h3><button class="act-btn repassar" onclick="showToast('Roleta reequilibrada')">⚖️ Equilibrar agora</button></div>
          <div style="padding-bottom:6px">
            <div style="overflow-x:auto">
            <table class="leads-table">
              <thead><tr><th>Corretor</th><th>Recebeu</th><th>Respondeu de verdade</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                <tr style="background:var(--rose-light)"><td><b>Rios</b> <span style="color:var(--text-dim)">· Vini</span></td><td class="mono" style="color:var(--rose)">19</td><td><span class="sig-false">● 4</span></td><td><span class="jst afog">afogado</span></td><td><div class="jacts"><button class="link-btn" onclick="showToast('Roleta vai pular Rios até responder')">Pular</button><button class="link-btn" onclick="showToast('Leads sem 1º toque devolvidos à roleta')">Puxar parados</button></div></td></tr>
                <tr style="background:var(--amber-light)"><td><b>Montenegro</b> <span style="color:var(--text-dim)">· Monalisa</span></td><td class="mono" style="color:var(--amber)">3</td><td><span class="sig-true">● 3</span></td><td><span class="jst pul">sendo pulado</span></td><td><div class="jacts"><button class="link-btn">ver motivo</button></div></td></tr>
                <tr><td><b>Caick</b> <span style="color:var(--text-dim)">· Jaguar</span></td><td class="mono">12</td><td><span class="sig-true">● 10</span></td><td><span class="jst ok">equilibrado</span></td><td><div class="jacts"><button class="link-btn">ver leads dele</button></div></td></tr>
                <tr><td><b>Ully</b> <span style="color:var(--text-dim)">· Dudu</span></td><td class="mono">11</td><td><span class="sig-true">● 9</span></td><td><span class="jst ok">equilibrado</span></td><td><div class="jacts"><button class="link-btn">ver leads dele</button></div></td></tr>
              </tbody>
            </table>
            </div>
            <p style="color:var(--text-dim);font-size:11.5px;padding:10px 16px 2px;line-height:1.5">Mostrando os <b>2 pontos de atenção</b> (de 11 presentes). <b>Rios</b> afogado; <b>Montenegro</b> sendo pulado. Clicar num corretor abre os leads dele.</p>
          </div>
        </div>

        <!-- 3) ENTRADA DE HOJE -->
        <div class="panel-box">
          <div class="panel-header"><h3>📥 Entrada de hoje</h3><span style="color:var(--text-muted);font-size:12px">164 roleta · 18 exclusiva · 5 direcionados</span></div>
          <div style="padding:14px">
            <div class="bar-row"><span class="nm">Barra Funda</span><div class="bar-track"><div class="bar-fill" style="width:100%"></div></div><span class="vl">44</span></div>
            <div class="bar-row"><span class="nm">Zona Leste</span><div class="bar-track"><div class="bar-fill" style="width:93%"></div></div><span class="vl">41</span></div>
            <div class="bar-row"><span class="nm">Penha</span><div class="bar-track"><div class="bar-fill" style="width:86%"></div></div><span class="vl">38</span></div>
            <div class="bar-row"><span class="nm">Santo Amaro</span><div class="bar-track"><div class="bar-fill" style="width:75%"></div></div><span class="vl">33</span></div>
          </div>
        </div>
      </div>

      <!-- ABA RESULTADOS -->
      <div id="view-resultados" class="tab-view" style="display: none;">
        <div class="per-note">📊 O que está dando resultado — período <b>Esta Semana</b>. Troque o período lá em cima pra recalcular.</div>

        <div class="v5grid" style="margin-bottom:16px">
          <div class="panel-box">
            <div class="panel-header"><h3>Tendência — esta semana × passada</h3><span style="color:var(--text-muted);font-size:12px">melhorando ou piorando?</span></div>
            <div style="padding:14px;display:flex;flex-direction:column;gap:12px">
              <div class="trend-row"><span>Leads que entraram</span><b>1.250</b><span class="tr up">↑ 8%</span></div>
              <div class="trend-row"><span>% que respondeu</span><b>23%</b><span class="tr down">↓ 3pp</span></div>
              <div class="trend-row"><span>Visitas</span><b>81</b><span class="tr up">↑ 12%</span></div>
              <div class="trend-row"><span>Vendas assinadas</span><b>19</b><span class="tr up">↑ 2</span></div>
            </div>
            <p style="color:var(--text-dim);font-size:11.5px;padding:0 16px 14px">Entrou mais lead, mas <b style="color:var(--rose)">a resposta caiu</b> — time atendendo pior, não lead pior.</p>
          </div>
          <div class="panel-box">
            <div class="panel-header"><h3>Meta de novembro</h3></div>
            <div style="padding:16px">
              <div style="font-family:'JetBrains Mono',monospace;font-size:34px;font-weight:800;color:var(--text-main)">30 <span style="font-size:16px;color:var(--text-muted);font-weight:600">projetado / 33 meta</span></div>
              <div style="height:12px;background:var(--surface-subtle);border-radius:6px;overflow:hidden;margin:14px 0 8px"><div style="width:91%;height:100%;background:var(--amber)"></div></div>
              <p style="color:var(--text-muted);font-size:12.5px">No ritmo de hoje fecha <b style="color:var(--text-main)">30</b>. Pra garantir a meta, <b style="color:var(--amber)">faltam 9 visitas e 4 pastas</b> — e tem 11 negócios a um passo.</p>
            </div>
          </div>
        </div>

        <div class="panel-box" style="margin-bottom:16px">
          <div class="panel-header"><h3>💸 Custo por resultado</h3><span style="color:var(--text-muted);font-size:12px">une o gasto de mídia com o que fecha</span></div>
          <div style="padding:14px;display:flex;gap:12px;flex-wrap:wrap">
            <div class="ptile"><span>Custo por lead</span><b>R$ 22</b></div>
            <div class="ptile"><span>Custo por visita</span><b>R$ 340</b></div>
            <div class="ptile good"><span>Custo por venda</span><b>R$ 1.450</b></div>
            <div class="ptile"><span>Ciclo médio lead→venda</span><b>18 <i>dias</i></b></div>
          </div>
          <p style="color:var(--text-dim);font-size:11.5px;padding:0 16px 14px">Custo por venda caiu com o discador entrando.<br><span style="opacity:.85">⚠️ custo por venda e ciclo usam <b>gasto da Meta</b> + <b>datas do Junix</b> — ilustrativo no mockup, falta ligar o dado real.</span></p>
        </div>

        <div class="panel-box" style="margin-bottom:16px">
          <div class="panel-header"><h3>Do lead até a venda — onde cai</h3><span style="color:var(--text-muted);font-size:12px">quanto some em cada passo</span></div>
          <div class="funsteps">
            <div class="fstep"><span>Leads</span><b>1.250</b></div>
            <div class="farrow">→</div>
            <div class="fstep"><span>Responderam</span><b>288 <i>23%</i></b></div>
            <div class="farrow">→</div>
            <div class="fstep"><span>Visita</span><b>81 <i>6,5%</i></b></div>
            <div class="farrow">→</div>
            <div class="fstep"><span>Pasta Caixa</span><b>35 <i>2,8%</i></b></div>
            <div class="farrow">→</div>
            <div class="fstep good"><span>Venda assinada</span><b>19 <i>1,5%</i></b></div>
          </div>
          <p style="color:var(--text-dim);font-size:11.5px;padding:0 16px 14px">O maior tombo é de <b>lead → resposta</b> (77% não respondem). É onde o SLA de 1ª resposta mais pesa.</p>
        </div>

        <div class="panel-box" style="margin-bottom:16px">
          <div class="panel-header"><h3>📊 Conversão por canal</h3><span style="color:var(--text-muted);font-size:12px">não é volume — é o que vira visita e venda</span></div>
          <div style="overflow-x:auto">
          <table class="leads-table">
            <thead><tr><th>Canal</th><th>Leads</th><th>Responderam</th><th>Visita</th><th>Venda</th><th>Veredito</th></tr></thead>
            <tbody>
              <tr><td><b>📞 Discador (ligações)</b></td><td class="mono">180</td><td class="mono" style="color:var(--green)">31%</td><td class="mono" style="color:var(--green)">9%</td><td class="mono" style="color:var(--green)">2,1%</td><td><span class="jst ok">melhor retorno</span></td></tr>
              <tr><td><b>🏪 Plantão (estande)</b></td><td class="mono">90</td><td class="mono">—</td><td class="mono" style="color:var(--green)">40%</td><td class="mono" style="color:var(--green)">9%</td><td><span class="jst ok">ouro (já veio quente)</span></td></tr>
              <tr><td><b>🎯 Anúncio (Meta)</b></td><td class="mono">820</td><td class="mono">22%</td><td class="mono">6%</td><td class="mono">1,4%</td><td><span class="jst pul">volume, qualidade média</span></td></tr>
              <tr><td><b>🎣 Pescaria (repesca)</b></td><td class="mono">240</td><td class="mono">18%</td><td class="mono">5%</td><td class="mono">1,1%</td><td><span class="jst pul">vale o esforço</span></td></tr>
              <tr><td><b>📢 Disparo WhatsApp</b></td><td class="mono">310</td><td class="mono" style="color:var(--rose)">14%</td><td class="mono" style="color:var(--rose)">3%</td><td class="mono" style="color:var(--rose)">0,8%</td><td><span class="jst afog">o que menos converte</span></td></tr>
            </tbody>
          </table>
          </div>
          <p style="color:var(--text-dim);font-size:11.5px;padding:12px 16px 2px;line-height:1.5">Leitura: o <b>discador</b> converte melhor que o disparo — vale puxar mais lista pra ele.</p>
        </div>

        <div class="v5grid">
          <div class="panel-box">
            <div class="panel-header"><h3>🏆 Quem mais transforma</h3><span style="color:var(--text-muted);font-size:12px">por taxa, não por volume</span></div>
            <div style="padding:8px 4px">
              <table class="leads-table"><tbody>
                <tr><td><b>Caick</b> <span style="color:var(--text-dim)">· Jaguar</span></td><td class="mono">48 leads</td><td><span class="jst ok">14% viram visita</span></td></tr>
                <tr><td><b>Claudete</b> <span style="color:var(--text-dim)">· Gouveia</span></td><td class="mono">39 leads</td><td><span class="jst ok">12% viram visita</span></td></tr>
                <tr><td><b>Ully</b> <span style="color:var(--text-dim)">· Dudu</span></td><td class="mono">41 leads</td><td><span class="jst ok">11% viram visita</span></td></tr>
                <tr style="opacity:.8"><td><b>Rios</b> <span style="color:var(--text-dim)">· Vini</span></td><td class="mono">71 leads</td><td><span class="jst afog">2% viram visita</span></td></tr>
              </tbody></table>
              <p style="color:var(--text-dim);font-size:11.5px;padding:8px 12px 2px">Rios recebe muito e transforma pouco — volume não é resultado.</p>
            </div>
          </div>
          <div class="panel-box">
            <div class="panel-header"><h3>⏱️ 1ª resposta — velocidade</h3></div>
            <div style="padding:16px">
              <div style="font-family:'JetBrains Mono',monospace;font-size:34px;font-weight:800;color:var(--amber)">38 min</div>
              <p style="color:var(--text-muted);font-size:12.5px;margin-top:4px">tempo médio até o 1º contato (meta: <b style="color:var(--green)">até 15 min</b>)</p>
              <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px;font-size:13px">
                <div class="dchip auto"><span class="k">🟢 Até 15 min</span><span class="v">41%</span></div>
                <div class="dchip mao"><span class="k">🟡 15 min a 1h</span><span class="v">33%</span></div>
                <div class="dchip" style="border-left:3px solid var(--rose)"><span class="k">🔴 +1h (perdendo)</span><span class="v">26%</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </main>
  

  <!-- ── BARRA FLUTUANTE DE AÇÕES EM LOTE (STICKY BOTTOM BAR) ── -->
  <div id="sticky-batch-bar" class="sticky-batch-bar" style="display: none;">
    <span style="color:var(--text-main); font-size: 13.5px; font-weight: 700;">
      <span id="batch-count" style="color: #38BDF8;">0</span> leads selecionados <span style="color:var(--text-dim);font-size:12px;font-weight:400">&middot; toda a&ccedil;&atilde;o pede confirma&ccedil;&atilde;o e avisa o corretor</span>
    </span>
    
    <div style="display: flex; gap: 8px;">
      <button class="batch-btn primary" onclick="openModalRepassar('Lote Selecionado', document.getElementById('batch-count').innerText + ' Leads Selecionados', 'Vários')">
        ⚡ Repassar para o Plantão
      </button>
      <button class="batch-btn ghost" onclick="showToast('✓ Mensagem enviada pelo chip do gerente (Evolution) — sem abrir nada')">
        💬 Cobrar Corretores
      </button>
      <button class="batch-btn ghost" style="color: var(--rose);" onclick="showToast('Confirme: 23 leads ser&atilde;o descartados — corretores avisados — desfazer em 10s')">
        🗑️ Descartar
      </button>
      <button class="batch-btn ghost" onclick="clearSelection()" style="padding: 7px 10px;">
        ✕
      </button>
    </div>
  </div>

  <!-- MODAIS INTERATIVOS -->
  <div class="toast-box" id="app-toast">
    <span id="toast-icon">✓</span>
    <span id="toast-text">Ação executada com sucesso!</span>
  </div>`;
export const JS = `
    function setTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      document.getElementById('btn-theme-dark').classList.toggle('active', t === 'dark');
      document.getElementById('btn-theme-light').classList.toggle('active', t === 'light');
    }

    function selecionarPeriodo(nome, btn) {
      document.querySelectorAll('.per-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('periodo-descricao-txt').innerHTML = 'Período Selecionado: <b>' + nome + '</b>';
      showToast('📅 Dados atualizados para: ' + nome);
    }

    function switchTab(tab) {
      document.querySelectorAll('.tab-view').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.lead-tab-btn').forEach(el => el.classList.remove('active'));
      if (tab === 'hoje' || tab === 'distrib') {
        document.getElementById('view-distrib').style.display = 'block';
        document.getElementById('tab-hoje-btn').classList.add('active');
      } else if (tab === 'negocios' || tab === 'funil' || tab === 'leads') {
        document.getElementById('view-funil').style.display = 'block';
        document.getElementById('view-leads').style.display = 'block';
        document.getElementById('tab-negocios-btn').classList.add('active');
      } else if (tab === 'midia' || tab === 'campanhas' || tab === 'filas') {
        document.getElementById('view-campanhas').style.display = 'block';
        document.getElementById('tab-midia-btn').classList.add('active');
        midiaSub(tab === 'campanhas' ? 'anuncios' : 'filas');
      } else if (tab === 'resultados') {
        document.getElementById('view-resultados').style.display = 'block';
        document.getElementById('tab-result-btn').classList.add('active');
      }
    }

    function filterSussurro(canal, btn) {
      document.querySelectorAll('.suss-chan-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.sussurro-item').forEach(item => {
        if (canal === 'todos' || item.getAttribute('data-suss') === canal) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      });
    }

    function selectFunnelStage(stageNum, el) {
      document.querySelectorAll('.funnel-stage-card').forEach(c => c.classList.remove('active'));
      el.classList.add('active');

      const titulos = [
        "",
        "Leads na Etapa 1: Recebidos na Semana (554)",
        "Leads na Etapa 2: Esperando 1ª resposta (174 parados)",
        "Leads na Etapa 3: Visita no Stand (85)",
        "Leads na Etapa 4: Pastas Caixa em Análise (32)",
        "Leads na Etapa 5: Vendas Confirmadas Junix (12)"
      ];
      var t=document.getElementById('funnel-stage-title'); if(t) t.innerText = titulos[stageNum] || "Leads da Etapa";
      var tb=document.getElementById('table-main-leads'); if(tb) tb.scrollIntoView({behavior:'smooth',block:'start'});
      showToast('Mostrando os leads de: ' + (titulos[stageNum]||'etapa'));
    }

    function filterPill(type, el) {
      if (el) {
        document.querySelectorAll('.pill-health').forEach(p => p.classList.remove('active'));
        el.classList.add('active');
      }

      const rows = document.querySelectorAll('#leads-tbody tr');
      rows.forEach(r => {
        if (type === 'todos') {
          r.style.display = '';
        } else {
          r.style.display = r.getAttribute('data-type') === type ? '' : 'none';
        }
      });
    }

    function handleCorretorChange(corretor) {
      const rows = document.querySelectorAll('#leads-tbody tr');
      rows.forEach(r => {
        if (corretor === 'todos') {
          r.style.display = '';
        } else {
          r.style.display = r.getAttribute('data-corretor') === corretor ? '' : 'none';
        }
      });
    }

    function handleSearch(q) {
      const term = q.toLowerCase();
      const rows = document.querySelectorAll('#leads-tbody tr');
      rows.forEach(r => {
        const text = r.innerText.toLowerCase();
        r.style.display = text.includes(term) ? '' : 'none';
      });
    }

    function toggleSelectAll(checked) {
      document.querySelectorAll('.lead-chk').forEach(c => c.checked = checked);
      updateBatchBar();
    }

    function updateBatchBar() {
      const checkedCount = document.querySelectorAll('.lead-chk:checked').length;
      const bar = document.getElementById('sticky-batch-bar');
      const countEl = document.getElementById('batch-count');
      
      if (checkedCount > 0) {
        bar.style.display = 'flex';
        countEl.innerText = checkedCount;
      } else {
        bar.style.display = 'none';
      }
    }

    function clearSelection() {
      document.querySelectorAll('.lead-chk').forEach(c => c.checked = false);
      const allChk = document.getElementById('chk-select-all');
      if (allChk) allChk.checked = false;
      updateBatchBar();
    }

    /* MODAIS */
    function toggleRecebeu(id){var e=document.getElementById('rec-'+id); if(e) e.style.display=(e.style.display==='none')?'block':'none';}
    function toggleCopilot(){var e=document.getElementById('copilot-panel'); if(e) e.style.display=(e.style.display==='none')?'block':'none';}
    function editarFila(id,offlabel){
      var e=document.getElementById('edit-'+id); if(!e) return;
      var on=(e.style.display==='none'); e.style.display=on?'block':'none';
      var c=document.getElementById('chips-'+id); if(c) c.classList.toggle('editing',on);
      var b=document.getElementById('btn-ed-'+id); if(b) b.innerHTML=on?'✓ Salvar fila':(offlabel||'⚙️ Editar aqui');
      if(!on) showToast('Fila salva — corretores atualizados');
    }
    function midiaSub(w){
      var map={filas:'view-filas',anuncios:'sub-anuncios'};
      for(var k in map){var el=document.getElementById(map[k]); if(el)el.style.display=(k===w)?'block':'none'; var b=document.getElementById('msub-'+k); if(b)b.classList.toggle('on',k===w);}
    }
    function openModal(id) {
      document.getElementById(id).style.display = 'flex';
    }
    function closeModal(id) {
      document.getElementById(id).style.display = 'none';
    }
    function repDestino(v){ var p=document.getElementById('rep-picker'); if(p) p.style.display = (v==='escolher')?'block':'none'; }
    function repCount(){ var n=document.querySelectorAll('.rep-chk:checked').length; var e=document.getElementById('rep-sel'); if(e) e.innerText=n; }
    function repFiltro(f,btn){ document.querySelectorAll('#rep-lista .repopt').forEach(function(o){ var st=o.getAttribute('data-st')||''; o.style.display=(f==='todos'||st.indexOf(f)>=0)?'flex':'none'; }); }

    function openModalRepassar(nome, detalhe, corretor) {
      document.getElementById('rep-lead-nome').innerText = nome;
      document.getElementById('rep-lead-detalhe').innerText = detalhe + (corretor ? ' · Atual: ' + corretor : '');
      openModal('modal-repassar');
    }

    function confirmarRepasse() {
      closeModal('modal-repassar');
      showToast('⚡ Lead(s) redistribuído(s) com sucesso!');
      clearSelection();
    }

    function openModalCobrar(lead, corretor, telefone, msgPadrao) {
      document.getElementById('cob-destinatario').innerText = corretor + (telefone ? ' · ' + telefone : '');
      document.getElementById('cob-msg').value = msgPadrao || ('Oi ' + corretor + ', preciso de retorno imediato sobre o atendimento do lead ' + lead + '.');
      openModal('modal-cobrar');
    }

    function dispararCobranca() {
      closeModal('modal-cobrar');
      showToast('💬 Cobrança disparada com sucesso no WhatsApp do corretor!');
    }

    function openModalVer(id, nome, fone, prod, corretor, status, tempo, canal) {
      document.getElementById('ver-nome').innerText = nome;
      document.getElementById('ver-fone').innerText = fone;
      document.getElementById('ver-produto').innerText = prod + ' · ' + canal;
      document.getElementById('ver-corretor').innerText = corretor;
      document.getElementById('ver-badge').innerText = status;
      openModal('modal-ver');
    }

    function openModalConfigFila(formId) {
      openModal('modal-config-fila');
    }

    function showToast(txt) {
      const t = document.getElementById('app-toast');
      document.getElementById('toast-text').innerText = txt;
      t.style.display = 'flex';
      setTimeout(() => {
        t.style.display = 'none';
      }, 3500);
    }
  `;
