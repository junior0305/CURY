/**
 * WebRTCDialerEngine — motor REAL de ligação do discador, via SIP.js (WebRTC).
 *
 * Provado no POC: registra em wss://app.nvoip.com.br:7443 com ramal + Senha SIP e
 * ORIGINA a ligação pro lead (2-vias, o corretor fala pelo navegador). É o que substitui
 * o MockEngine no <DiscadorProvider engine={...}>.
 *
 * SEGURANÇA: a Senha SIP NÃO fica no código. O engine recebe `getConfig()`, que deve
 * buscar a credencial do NOSSO backend (edge que devolve o ramal + uma senha SIP curta
 * do corretor logado). Nunca embute a senha no front.
 *
 * SIP.js é carregado sob demanda do CDN (ESM) — não precisa adicionar dependência agora.
 */
import type { DialerEngine, CallTarget, CallStatus } from "./DiscadorWidget";

export interface SipConfig {
  server: string;   // ex.: "wss://app.nvoip.com.br:7443"
  domain: string;   // ex.: "app.nvoip.com.br"
  user: string;     // ramal SIP, ex.: "144933001"
  password: string; // Senha SIP (vem do backend, curta/rotativa de preferência)
}

const SIPJS_URL = "https://cdn.jsdelivr.net/npm/sip.js@0.21.2/+esm";

// cache do módulo SIP.js (carrega uma vez)
let sipModPromise: Promise<any> | null = null;
function carregarSip(): Promise<any> {
  if (!sipModPromise) sipModPromise = import(/* @vite-ignore */ SIPJS_URL);
  return sipModPromise;
}

export class WebRTCDialerEngine implements DialerEngine {
  private simple: any = null;
  private cfg: SipConfig | null = null;
  private remoteAudio: HTMLAudioElement;
  private registrado = false;

  constructor(
    /** busca a config SIP no backend (nunca hardcode a senha no front) */
    private getConfig: () => Promise<SipConfig>,
    opts?: { remoteAudioEl?: HTMLAudioElement },
  ) {
    // elemento de áudio pro som remoto (a voz do lead)
    if (opts?.remoteAudioEl) {
      this.remoteAudio = opts.remoteAudioEl;
    } else {
      this.remoteAudio = document.createElement("audio");
      this.remoteAudio.autoplay = true;
      (this.remoteAudio as any).playsInline = true;
      this.remoteAudio.setAttribute("playsinline", "");
      this.remoteAudio.style.display = "none";
      document.body.appendChild(this.remoteAudio);
    }
  }

  /** força o som remoto a tocar (contorna o bloqueio de autoplay do navegador) */
  private forcarAudio() {
    try {
      this.remoteAudio.muted = false;
      this.remoteAudio.volume = 1;
      const p = this.remoteAudio.play();
      if (p && typeof (p as any).catch === "function") (p as Promise<void>).catch(() => {});
    } catch { /* ignore */ }
  }

  /** Conecta e registra o ramal. Pode ser chamado 1x ao abrir a sessão de ligação. */
  async registrar(onStatus?: (s: CallStatus) => void): Promise<void> {
    if (this.registrado && this.simple) return;
    const SIP = await carregarSip();
    this.cfg = await this.getConfig();
    const { server, domain, user, password } = this.cfg;

    this.simple = new SIP.Web.SimpleUser(server, {
      aor: `sip:${user}@${domain}`,
      media: { remote: { audio: this.remoteAudio } },
      userAgentOptions: {
        authorizationUsername: user,
        authorizationPassword: password,
        logLevel: "error",
      },
    });

    this.simple.delegate = {
      onCallHangup: () => onStatus?.("ended"),
      onCallAnswered: () => { this.forcarAudio(); onStatus?.("connected"); },
      onServerDisconnect: () => { this.registrado = false; },
    };

    await this.simple.connect();
    await this.simple.register();
    this.registrado = true;
  }

  // ---- interface DialerEngine ----
  async call(target: CallTarget, cb: { onStatus: (s: CallStatus) => void; onRecordingUrl?: (u: string) => void }) {
    try {
      cb.onStatus("dialing");
      if (!this.registrado) await this.registrar(cb.onStatus);
      const numero = (target.telefone || "").replace(/\D/g, "");
      const alvo = `sip:${numero}@${this.cfg!.domain}`;

      // liga os callbacks de status desta chamada
      this.simple.delegate = {
        onCallAnswered: () => { this.forcarAudio(); cb.onStatus("connected"); },
        onCallHangup: () => cb.onStatus("ended"),
        onServerDisconnect: () => cb.onStatus("failed"),
      };

      cb.onStatus("ringing");
      await this.simple.call(alvo, {
        // peça áudio apenas (sem vídeo)
        constraints: { audio: true, video: false },
      });
      // garante o play logo após estabelecer a mídia (autoplay costuma bloquear)
      this.forcarAudio();
      setTimeout(() => this.forcarAudio(), 800);
      // gravação: a Nvoip grava do lado dela; a URL é buscada depois pelo callId/relatório.
    } catch (e) {
      console.error("[WebRTCDialerEngine] erro na chamada:", e);
      cb.onStatus("failed");
    }
  }

  async hangup() {
    try { await this.simple?.hangup(); } catch (e) { /* ignore */ }
  }

  setMuted(muted: boolean) {
    try { muted ? this.simple?.mute() : this.simple?.unmute(); } catch (e) { /* ignore */ }
  }

  /** encerra a sessão e desregistra (ao sair da tela de ligação) */
  async destruir() {
    try { await this.simple?.unregister(); } catch (e) { /* */ }
    try { await this.simple?.disconnect(); } catch (e) { /* */ }
    this.registrado = false; this.simple = null;
  }
}
