/**
 * NVoipEngine — Implementação real da interface DialerEngine para o Comandra.
 * Conecta diretamente à API da NVoip via OAuth 2.0 e Click-to-Call.
 */
import { CallStatus, CallTarget, DialerEngine } from "./DiscadorWidget";

export interface NVoipEngineConfig {
  userToken: string;
  numberSip: string;
  sipPassword?: string;
  baseUrl?: string;
}

export class NVoipEngine implements DialerEngine {
  private userToken: string;
  private numberSip: string;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private activeCallId: string | null = null;
  private pollInterval: number | null = null;

  constructor(config: NVoipEngineConfig) {
    this.userToken = config.userToken;
    this.numberSip = config.numberSip;
    this.baseUrl = config.baseUrl || "https://api.nvoip.com.br/v2";
  }

  /**
   * Obtém ou renova o token OAuth Bearer junto à NVoip.
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    const tokenUrl = `${this.baseUrl}/oauth/token`;
    const body = new URLSearchParams({
      username: this.numberSip,
      password: this.userToken,
      grant_type: "password",
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: "Basic TnZvaXBBcGlWMjpUblp2YVhCQmNHbFdNakl3TWpFPQ==",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Falha na autenticação NVoip (${res.status}): ${err}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in || 86400) * 1000;
    return this.accessToken!;
  }

  /**
   * Normaliza o número de telefone (remove caracteres especiais e adiciona DDD se necessário).
   */
  private sanitizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    // Se tiver 55 no início e mais de 11 dígitos, remove o 55 para o formato DDD + Número
    if (digits.startsWith("55") && digits.length >= 12) {
      return digits.substring(2);
    }
    return digits;
  }

  async call(
    target: CallTarget,
    cb: {
      onStatus: (s: CallStatus) => void;
      onRecordingUrl?: (url: string) => void;
    }
  ): Promise<void> {
    this.stopPolling();
    cb.onStatus("dialing");

    try {
      const token = await this.getAccessToken();
      const called = this.sanitizePhone(target.telefone);

      cb.onStatus("ringing");

      // Dispara chamada Click2Call
      const res = await fetch(`${this.baseUrl}/calls/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caller: this.numberSip,
          called: called,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("Erro ao iniciar chamada NVoip:", err);
        cb.onStatus("failed");
        return;
      }

      const data = await res.json();
      this.activeCallId = data.callId || null;

      if (!this.activeCallId) {
        cb.onStatus("connected");
        return;
      }

      // Inicia monitoramento do status da chamada
      let attempts = 0;
      this.pollInterval = window.setInterval(async () => {
        attempts++;
        if (!this.activeCallId) {
          this.stopPolling();
          return;
        }

        try {
          const checkRes = await fetch(
            `${this.baseUrl}/calls?callId=${encodeURIComponent(this.activeCallId)}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const state = checkData.state?.toLowerCase();

            if (state === "talking" || state === "in_call" || checkData.talkingDurationSeconds > 0) {
              cb.onStatus("connected");
            } else if (state === "completed" || state === "finished") {
              this.stopPolling();
              cb.onStatus("ended");
              if (checkData.linkAudio) {
                cb.onRecordingUrl?.(checkData.linkAudio);
              }
            } else if (state === "failed" || state === "busy" || state === "noanswer") {
              this.stopPolling();
              cb.onStatus("failed");
            }
          }
        } catch (e) {
          console.warn("Erro ao checar status da chamada NVoip:", e);
        }

        // Timeout de monitoramento após 15 minutos
        if (attempts > 300) {
          this.stopPolling();
        }
      }, 3000);
    } catch (err) {
      console.error("Exceção ao chamar via NVoip:", err);
      cb.onStatus("failed");
    }
  }

  async hangup(): Promise<void> {
    const callId = this.activeCallId;
    this.stopPolling();

    if (callId && this.accessToken) {
      try {
        await fetch(`${this.baseUrl}/endcall?callId=${encodeURIComponent(callId)}`, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        });
      } catch (e) {
        console.warn("Erro ao encerrar chamada NVoip:", e);
      }
    }
    this.activeCallId = null;
  }

  setMuted(_muted: boolean): void {
    // Para mute via Webphone SDK, integra com o audio stream
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
