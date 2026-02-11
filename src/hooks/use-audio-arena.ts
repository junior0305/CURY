import { useEffect, useRef, useState } from 'react';

// URLs de sons (usando arquivos diretos e estáveis)
const SOUNDS = {
  SALE: 'https://www.soundjay.com/misc/sounds/cash-register-05.mp3', 
  OVERTAKE: 'https://www.soundjay.com/transportation/sounds/race-car-drive-by-1.mp3', 
  NOTIFICATION: 'https://www.soundjay.com/buttons/sounds/button-20.mp3', 
};

export function useAudioArena() {
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    console.log("[AudioArena] Inicializando e pré-carregando sons...");
    
    const loadSounds = () => {
      Object.entries(SOUNDS).forEach(([key, url]) => {
        const audio = new Audio(url);
        audio.preload = 'auto';
        // Forçar carregamento
        audio.load();
        audioRefs.current[key] = audio;
      });
      setIsLoaded(true);
      console.log("[AudioArena] Sons pré-carregados");
    };

    loadSounds();

    return () => {
      audioRefs.current = {};
    };
  }, []);

  const playSound = (soundKey: keyof typeof SOUNDS) => {
    const isMuted = localStorage.getItem('crm_audio_muted') === 'true';
    console.log(`[AudioArena] Solicitação para tocar: ${soundKey} | Mudo: ${isMuted} | Carregado: ${isLoaded}`);
    
    if (isMuted) return;

    const audio = audioRefs.current[soundKey];
    if (audio) {
      // Resetar para o início caso já esteja tocando
      audio.currentTime = 0;
      audio.volume = 0.8; 
      
      const playPromise = audio.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log(`[AudioArena] EXECUTANDO AGORA: ${soundKey}`);
          })
          .catch(error => {
            console.error(`[AudioArena] BLOQUEIO DO NAVEGADOR:`, error.message);
            console.warn("[AudioArena] IMPORTANTE: Você precisa clicar uma vez na página para o som funcionar.");
            
            // Tentativa de tocar ao primeiro clique do usuário se falhar por falta de interação
            const retryOnInteraction = () => {
              audio.play().then(() => {
                console.log(`[AudioArena] Reproduzido após interação: ${soundKey}`);
                window.removeEventListener('click', retryOnInteraction);
              });
            };
            window.addEventListener('click', retryOnInteraction, { once: true });
          });
      }
    } else {
      console.error(`[AudioArena] Erro: Áudio '${soundKey}' não encontrado no cache.`);
    }
  };

  return { playSound, isLoaded };
}