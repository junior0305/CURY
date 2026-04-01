import { useCallback, useRef } from 'react';

type SoundKey = 'SALE' | 'OVERTAKE' | 'NEW_LEAD' | 'NOTIFICATION';

// Sintetiza sons via Web Audio API — sem dependência de arquivos externos
function createAudioContext(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  fadeOut = true
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(volume, startTime);
  if (fadeOut) gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function synthesize(ctx: AudioContext, key: SoundKey) {
  const t = ctx.currentTime;
  const vol = 0.35;

  switch (key) {
    case 'NEW_LEAD': {
      // Três pings ascendentes — atenção imediata
      playTone(ctx, 880, t,       0.12, vol, 'sine');
      playTone(ctx, 1100, t + 0.13, 0.12, vol, 'sine');
      playTone(ctx, 1320, t + 0.26, 0.18, vol, 'sine');
      break;
    }
    case 'SALE': {
      // Fanfarra triunfal — arpegio maior + sustain
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        playTone(ctx, freq, t + i * 0.1, 0.25, vol * 0.9, 'triangle');
      });
      // Acorde final
      [523, 784, 1047].forEach(freq => {
        playTone(ctx, freq, t + 0.45, 0.55, vol * 0.6, 'sine');
      });
      break;
    }
    case 'OVERTAKE': {
      // Impacto dramático — descida + punch
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.3);
      gain.gain.setValueAtTime(vol * 0.8, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
      // Punch
      playTone(ctx, 200, t + 0.05, 0.2, vol * 0.5, 'square');
      // Brilho no topo
      playTone(ctx, 880, t, 0.15, vol * 0.3, 'sine');
      break;
    }
    case 'NOTIFICATION': {
      // Sino suave — simples e não intrusivo
      playTone(ctx, 660, t, 0.08, vol * 0.7, 'sine');
      playTone(ctx, 880, t + 0.09, 0.2, vol * 0.5, 'sine');
      break;
    }
  }
}

// Custom MP3 URLs são salvas no localStorage após carregamento do DB
export const CUSTOM_SOUND_KEY = (key: SoundKey) => `crm_sound_${key}_url`;

const ALL_SOUND_KEYS: SoundKey[] = ['SALE', 'OVERTAKE', 'NEW_LEAD', 'NOTIFICATION'];
const SETTING_PREFIX = 'custom_sound_';
const SESSION_SYNC_KEY = 'crm_audio_synced_v2';

/**
 * Sincroniza URLs de sons customizados do banco → localStorage.
 * Executa uma vez por sessão (flag em sessionStorage).
 * Garante que todos os usuários (corretores, gestores) toquem o som correto
 * mesmo sem abrir as configurações de áudio.
 */
export async function syncAudioSettings(supabase: any): Promise<void> {
  if (sessionStorage.getItem(SESSION_SYNC_KEY)) return;
  try {
    const keys = ALL_SOUND_KEYS.map((k) => `${SETTING_PREFIX}${k}`);
    const { data } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', keys);

    // Limpa entradas antigas antes de repopular
    ALL_SOUND_KEYS.forEach((k) => localStorage.removeItem(CUSTOM_SOUND_KEY(k)));

    (data ?? []).forEach((row: any) => {
      const soundKey = row.key.replace(SETTING_PREFIX, '') as SoundKey;
      if (row.value) localStorage.setItem(CUSTOM_SOUND_KEY(soundKey), row.value);
    });

    sessionStorage.setItem(SESSION_SYNC_KEY, '1');
  } catch {
    // Falha silenciosa — usa localStorage existente ou sons sintetizados
  }
}

function playCustomMp3(url: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = () => resolve(); // fallback silencioso
    audio.play().catch(() => resolve());
  });
}

export function useAudioArena() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback((): AudioContext | null => {
    if (!ctxRef.current) ctxRef.current = createAudioContext();
    if (ctxRef.current?.state === 'suspended') {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  const playSound = useCallback((soundKey: SoundKey) => {
    const isMuted = localStorage.getItem('crm_audio_muted') === 'true';
    if (isMuted) return;

    // Verificar se há MP3 customizado
    const customUrl = localStorage.getItem(CUSTOM_SOUND_KEY(soundKey));
    if (customUrl) {
      playCustomMp3(customUrl).catch(() => {});
      return;
    }

    const ctx = getCtx();
    if (!ctx) return;

    // Se bloqueado por política de autoplay, agenda para o próximo clique
    if (ctx.state === 'suspended') {
      const unlock = () => {
        ctx.resume().then(() => synthesize(ctx, soundKey)).catch(() => {});
        window.removeEventListener('click', unlock);
      };
      window.addEventListener('click', unlock, { once: true });
      return;
    }

    try {
      synthesize(ctx, soundKey);
    } catch (e) {
      console.warn('[AudioArena] Erro ao sintetizar som:', e);
    }
  }, [getCtx]);

  return { playSound, isLoaded: true };
}
