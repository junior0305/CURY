/**
 * use-audio-arena.ts
 *
 * Sons do sistema CRM — Web Audio API + MP3 customizados.
 *
 * Problema anterior: cada componente criava seu próprio AudioContext, cada um
 * precisando de desbloqueio individual. Com o singleton abaixo, um único
 * contexto é desbloqueado na primeira interação do usuário e todos os sons
 * do sistema passam a funcionar imediatamente a partir daí.
 */

import { useCallback } from 'react';

export type SoundKey = 'SALE' | 'OVERTAKE' | 'NEW_LEAD' | 'NOTIFICATION';

// ── Singleton AudioContext ─────────────────────────────────────────────────────

let _ctx: AudioContext | null = null;
let _unlocked = false;
let _pendingSounds: Array<() => void> = [];
let _listenersRegistered = false;

function getCtx(): AudioContext | null {
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return _ctx;
}

function drainPending() {
  if (!_unlocked) return;
  const pending = _pendingSounds.splice(0);
  for (const fn of pending) {
    try { fn(); } catch {}
  }
}

async function tryUnlock(): Promise<void> {
  if (_unlocked) return;
  const ctx = getCtx();
  if (!ctx) return;

  // Escuta statechange como backup — útil quando resume() não resolve imediatamente
  if (!ctx.onstatechange) {
    ctx.onstatechange = () => {
      if (ctx.state === 'running' && !_unlocked) {
        _unlocked = true;
        drainPending();
      }
    };
  }

  try {
    await ctx.resume();
  } catch {}
  if (ctx.state === 'running') {
    _unlocked = true;
    drainPending();
  }
}

/**
 * Registra listeners de interação uma única vez.
 * Chamado automaticamente quando o módulo carrega.
 * Qualquer click, toque ou tecla desbloqueia o AudioContext para sempre.
 */
function registerUnlockListeners() {
  if (_listenersRegistered || typeof window === 'undefined') return;
  _listenersRegistered = true;

  const handler = () => {
    tryUnlock().then(() => {
      if (_unlocked) {
        // Remove os listeners assim que desbloqueado — não precisa mais ouvir
        ['click', 'touchstart', 'keydown', 'pointerdown'].forEach(ev =>
          window.removeEventListener(ev, handler)
        );
      }
    });
  };

  ['click', 'touchstart', 'keydown', 'pointerdown'].forEach(ev =>
    window.addEventListener(ev, handler, { passive: true })
  );
}

// Registra imediatamente ao importar o módulo
registerUnlockListeners();

// ── Síntese de sons via Web Audio API ─────────────────────────────────────────

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  fadeOut = true
) {
  const osc  = ctx.createOscillator();
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
  const t   = ctx.currentTime;
  const vol = 0.35;

  switch (key) {
    case 'NEW_LEAD': {
      // Três pings ascendentes — atenção imediata
      playTone(ctx, 880,  t,        0.12, vol, 'sine');
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
      [523, 784, 1047].forEach(freq => {
        playTone(ctx, freq, t + 0.45, 0.55, vol * 0.6, 'sine');
      });
      break;
    }
    case 'OVERTAKE': {
      // Impacto dramático — descida + punch
      const osc  = ctx.createOscillator();
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
      playTone(ctx, 200, t + 0.05, 0.2,  vol * 0.5, 'square');
      playTone(ctx, 880, t,        0.15,  vol * 0.3, 'sine');
      break;
    }
    case 'NOTIFICATION': {
      // Sino suave
      playTone(ctx, 660, t,        0.08, vol * 0.7, 'sine');
      playTone(ctx, 880, t + 0.09, 0.20, vol * 0.5, 'sine');
      break;
    }
  }
}

// ── MP3 customizado ───────────────────────────────────────────────────────────

export const CUSTOM_SOUND_KEY = (key: SoundKey) => `crm_sound_${key}_url`;

async function playCustomMp3(url: string): Promise<void> {
  const audio = new Audio(url);
  audio.volume = 1;
  try {
    await audio.play();
    return new Promise(resolve => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      // Timeout de segurança: resolve após 10s caso onended não dispare
      setTimeout(resolve, 10000);
    });
  } catch (e: any) {
    // NotAllowedError = autoplay blocked (não deveria acontecer após unlock)
    console.warn('[AudioArena] MP3 play falhou:', e?.name, e?.message);
  }
}

// ── Execução do som (interna) ─────────────────────────────────────────────────

function doPlay(soundKey: SoundKey) {
  const customUrl = localStorage.getItem(CUSTOM_SOUND_KEY(soundKey));
  if (customUrl) {
    // Tenta MP3 customizado; se falhar, cai na síntese nativa
    playCustomMp3(customUrl).catch(() => {
      const ctx = getCtx();
      if (ctx) try { synthesize(ctx, soundKey); } catch {}
    });
    return;
  }
  const ctx = getCtx();
  if (!ctx) return;
  try {
    synthesize(ctx, soundKey);
  } catch (e) {
    console.warn('[AudioArena] Erro ao sintetizar:', e);
  }
}

// ── Sincronização de URLs customizadas ────────────────────────────────────────

const ALL_SOUND_KEYS: SoundKey[] = ['SALE', 'OVERTAKE', 'NEW_LEAD', 'NOTIFICATION'];
const SETTING_PREFIX = 'custom_sound_';
const SESSION_SYNC_KEY = 'crm_audio_synced_v3';

/**
 * Sincroniza URLs de sons customizados do banco → localStorage.
 * Roda uma vez por sessão. Exportada para ser chamada no App.tsx.
 */
export async function syncAudioSettings(supabase: any): Promise<void> {
  if (sessionStorage.getItem(SESSION_SYNC_KEY)) return;
  try {
    const keys = ALL_SOUND_KEYS.map(k => `${SETTING_PREFIX}${k}`);
    const { data } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', keys);

    ALL_SOUND_KEYS.forEach(k => localStorage.removeItem(CUSTOM_SOUND_KEY(k)));
    (data ?? []).forEach((row: any) => {
      const soundKey = row.key.replace(SETTING_PREFIX, '') as SoundKey;
      if (row.value) localStorage.setItem(CUSTOM_SOUND_KEY(soundKey), row.value);
    });
    sessionStorage.setItem(SESSION_SYNC_KEY, '1');
  } catch {
    // Falha silenciosa — usa localStorage existente ou sons sintetizados
  }
}

// ── Hook público ──────────────────────────────────────────────────────────────

/**
 * Hook de som do CRM. Todos os componentes compartilham o mesmo AudioContext
 * (singleton de módulo), portanto basta UMA interação do usuário em qualquer
 * lugar da página para desbloquear o áudio de todo o sistema.
 */
export function useAudioArena() {
  const playSound = useCallback((soundKey: SoundKey) => {
    const isMuted = localStorage.getItem('crm_audio_muted') === 'true';
    if (isMuted) return;

    if (_unlocked) {
      doPlay(soundKey);
    } else {
      // Enfileira para tocar na próxima interação do usuário
      _pendingSounds.push(() => doPlay(soundKey));
    }
  }, []); // sem deps — não depende de estado local, só do singleton de módulo

  return { playSound, isLoaded: true };
}

// ── Status público (para UI de diagnóstico) ───────────────────────────────────

export function isAudioUnlocked() { return _unlocked; }
