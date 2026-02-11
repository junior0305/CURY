import { useEffect, useRef } from 'react';

// URLs de sons (usando assets públicos estáveis ou placeholders)
const SOUNDS = {
  SALE: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3', // Ka-ching
  OVERTAKE: 'https://assets.mixkit.co/active_storage/sfx/2836/2836-preview.mp3', // F1/Whoosh
  NOTIFICATION: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3', // Pop/Bubble
};

export function useAudioArena() {
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

  useEffect(() => {
    // Pré-carregar os sons
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audioRefs.current[key] = audio;
    });

    return () => {
      // Limpar refs se necessário
      audioRefs.current = {};
    };
  }, []);

  const playSound = (soundKey: keyof typeof SOUNDS) => {
    const isMuted = localStorage.getItem('crm_audio_muted') === 'true';
    console.log(`[AudioArena] Tentando tocar: ${soundKey} (Mudo: ${isMuted})`);
    
    if (isMuted) return;

    const audio = audioRefs.current[soundKey];
    if (audio) {
      audio.currentTime = 0;
      audio.volume = 0.5; // Garantir volume audível
      audio.play()
        .then(() => console.log(`[AudioArena] Reproduzindo ${soundKey} com sucesso`))
        .catch(err => {
          console.warn('[AudioArena] Erro ao reproduzir som:', err);
          console.warn('[AudioArena] Dica: O navegador pode bloquear som sem interação prévia.');
        });
    } else {
      console.error(`[AudioArena] Objeto de áudio não encontrado para: ${soundKey}`);
    }
  };

  return { playSound };
}