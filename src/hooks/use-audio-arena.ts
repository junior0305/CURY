import { useEffect, useRef, useState } from 'react';

// Nomes dos arquivos que devem estar na pasta /public
const SOUND_FILES = {
  SALE: 'sale.mp3',
  OVERTAKE: 'overtake.mp3',
};

export function useAudioArena() {
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadSounds = () => {
      Object.entries(SOUND_FILES).forEach(([key, filename]) => {
        // Agora busca da URL pública do Supabase Storage
        const url = `https://jcmovytbcghvvukaszyb.supabase.co/storage/v1/object/public/audio-arena/${filename}`;
        const audio = new Audio(url);
        audio.preload = 'auto';
        audioRefs.current[key] = audio;
      });
      setIsLoaded(true);
    };

    loadSounds();

    return () => {
      audioRefs.current = {};
    };
  }, []);

  const playSound = (soundKey: keyof typeof SOUND_FILES) => {
    const isMuted = localStorage.getItem('crm_audio_muted') === 'true';
    if (isMuted) return;

    const audio = audioRefs.current[soundKey];
    if (audio) {
      audio.currentTime = 0;
      audio.volume = 0.9; 
      
      audio.play().catch(error => {
        console.warn(`[AudioArena] Bloqueio de interação: o som tocará no próximo clique.`, error.message);
        
        const retryOnInteraction = () => {
          audio.play().then(() => {
            window.removeEventListener('click', retryOnInteraction);
          }).catch(() => {});
        };
        window.addEventListener('click', retryOnInteraction, { once: true });
      });
    }
  };

  return { playSound, isLoaded };
}