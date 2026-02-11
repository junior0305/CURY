import { useEffect, useRef, useState } from 'react';

// Nomes dos arquivos que devem estar na pasta /public
const SOUND_FILES = {
  SALE: '/sale.mp3',      // Caixa registradora
  OVERTAKE: '/overtake.mp3', // Carro de corrida
  NOTIFICATION: '/notification.mp3',
};

export function useAudioArena() {
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    console.log("[AudioArena] Inicializando com arquivos locais da pasta /public...");
    
    const loadSounds = () => {
      Object.entries(SOUND_FILES).forEach(([key, url]) => {
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.load();
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