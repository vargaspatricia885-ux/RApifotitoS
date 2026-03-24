import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const RapifotitoSVG = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 200" className={className} xmlns="http://www.w3.org/2000/svg">
    {/* Straps */}
    <path d="M 45 90 C -10 130, 20 200, 70 160" fill="none" stroke="#4a154b" strokeWidth="14" strokeLinecap="round" />
    <path d="M 155 90 C 210 130, 180 200, 130 160" fill="none" stroke="#4a154b" strokeWidth="14" strokeLinecap="round" />
    
    {/* Buckles */}
    <rect x="25" y="110" width="16" height="20" rx="3" fill="none" stroke="#f59e0b" strokeWidth="4" transform="rotate(-20 33 120)" />
    <rect x="159" y="110" width="16" height="20" rx="3" fill="none" stroke="#f59e0b" strokeWidth="4" transform="rotate(20 167 120)" />

    {/* Legs */}
    <path d="M 85 150 L 80 180" fill="none" stroke="#3b9b9b" strokeWidth="12" strokeLinecap="round" />
    <path d="M 115 150 L 120 180" fill="none" stroke="#3b9b9b" strokeWidth="12" strokeLinecap="round" />
    <rect x="60" y="175" width="30" height="12" rx="6" fill="#3b9b9b" />
    <rect x="110" y="175" width="30" height="12" rx="6" fill="#3b9b9b" />
    
    {/* Arms */}
    <path d="M 45 120 C 20 120, 10 140, 20 160" fill="none" stroke="#3b9b9b" strokeWidth="10" strokeLinecap="round" />
    <path d="M 155 120 C 180 120, 190 140, 180 160" fill="none" stroke="#3b9b9b" strokeWidth="10" strokeLinecap="round" />
    
    {/* Hands */}
    <path d="M 20 160 C 10 165, 5 175, 15 180 C 25 185, 30 170, 20 160" fill="#3b9b9b" />
    <path d="M 180 160 C 190 165, 195 175, 185 180 C 175 185, 170 170, 180 160" fill="#3b9b9b" />

    {/* Body Base */}
    <rect x="45" y="70" width="110" height="80" rx="15" fill="#9d1757" />
    
    {/* White Top Part */}
    <path d="M 45 85 C 45 75, 55 70, 65 70 L 135 70 C 145 70, 155 75, 155 85 L 155 100 C 130 90, 70 90, 45 100 Z" fill="#f8fafc" />
    
    {/* Flash */}
    <rect x="75" y="35" width="50" height="35" rx="8" fill="#9d1757" />
    <rect x="82" y="42" width="36" height="18" rx="4" fill="#e2e8f0" />
    <rect x="82" y="42" width="36" height="18" rx="4" fill="#ffffff" opacity="0.8" />
    
    {/* Face */}
    <circle cx="92" cy="78" r="4" fill="#0f172a" />
    <circle cx="108" cy="78" r="4" fill="#0f172a" />
    <path d="M 90 85 Q 100 95 110 85" fill="none" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
    <path d="M 92 86 Q 100 98 108 86 Z" fill="#0f172a" />
    <path d="M 95 88 Q 100 92 105 88 Z" fill="#ef4444" />
    
    {/* Buttons */}
    <circle cx="65" cy="85" r="8" fill="#facc15" />
    <circle cx="65" cy="85" r="5" fill="#fef08a" />
    <rect x="135" y="80" width="12" height="8" rx="3" fill="#facc15" />
    
    {/* Lens */}
    <circle cx="100" cy="120" r="40" fill="#9d1757" />
    <circle cx="100" cy="120" r="32" fill="#facc15" />
    <circle cx="100" cy="120" r="24" fill="#4a154b" />
    
    {/* Aperture blades */}
    <path d="M 100 96 L 115 108 L 100 120 Z" fill="#f59e0b" />
    <path d="M 124 120 L 112 135 L 100 120 Z" fill="#f59e0b" />
    <path d="M 100 144 L 85 132 L 100 120 Z" fill="#f59e0b" />
    <path d="M 76 120 L 88 105 L 100 120 Z" fill="#f59e0b" />
    <path d="M 115 108 L 124 120 L 100 120 Z" fill="#d97706" />
    <path d="M 112 135 L 100 144 L 100 120 Z" fill="#d97706" />
    <path d="M 85 132 L 76 120 L 100 120 Z" fill="#d97706" />
    <path d="M 88 105 L 100 96 L 100 120 Z" fill="#d97706" />
    
    {/* Flash Sparkles (Yellow star on top right) */}
    <path d="M 130 20 L 135 35 L 150 35 L 138 45 L 142 60 L 130 50 L 118 60 L 122 45 L 110 35 L 125 35 Z" fill="#facc15" />
  </svg>
);

export default function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'runningIn' | 'flashing' | 'runningOut'>('idle');
  const [showFlash, setShowFlash] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const hasSeen = localStorage.getItem('hasSeenWelcome');
    if (hasSeen) {
      setIsVisible(false);
      onComplete();
      return;
    }

    let isMounted = true;

    const runAnimation = async () => {
      if (!isMounted) return;
      setPhase('runningIn');
      await new Promise(r => setTimeout(r, 1200));
      if (!isMounted) return;
      
      setPhase('flashing');
      
      // Play sound
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);

        const utterance = new SpeechSynthesisUtterance("¡Soy Rapifotito, yujúuu!");
        utterance.lang = 'es-ES';
        utterance.pitch = 1.4;
        utterance.rate = 1.1;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error("Audio error:", e);
      }

      setShowFlash(true);
      setTimeout(() => { if (isMounted) setShowFlash(false); }, 150);
      setTimeout(() => { if (isMounted) setShowFlash(true); }, 300);
      setTimeout(() => { if (isMounted) setShowFlash(false); }, 450);

      await new Promise(r => setTimeout(r, 2500));
      if (!isMounted) return;
      
      setPhase('runningOut');
      await new Promise(r => setTimeout(r, 1000));
      if (!isMounted) return;
      
      localStorage.setItem('hasSeenWelcome', 'true');
      setIsVisible(false);
      onComplete();
    };

    runAnimation();

    return () => {
      isMounted = false;
    };
  }, [onComplete]);

  const handleSkip = () => {
    localStorage.setItem('hasSeenWelcome', 'true');
    setIsVisible(false);
    onComplete();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center overflow-hidden">
      {/* Skip button */}
      <button 
        onClick={handleSkip}
        className="absolute top-6 right-6 text-white/80 hover:text-white bg-black/20 hover:bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm transition-all font-bold z-50"
      >
        Omitir
      </button>

      {/* Flash overlay */}
      <AnimatePresence>
        {showFlash && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="absolute inset-0 bg-white z-40"
          />
        )}
      </AnimatePresence>

      {/* Character */}
      <motion.div
        initial={{ x: '-150vw', rotate: -15 }}
        animate={{ 
          x: phase === 'runningIn' ? 0 : phase === 'runningOut' ? '150vw' : 0,
          rotate: phase === 'runningIn' ? [0, -15, 15, -15, 0] : phase === 'runningOut' ? [0, 15, -15, 15, 0] : 0,
          y: phase === 'runningIn' || phase === 'runningOut' ? [0, -40, 0, -40, 0] : 0
        }}
        transition={{ 
          x: { duration: 1.2, type: 'spring', bounce: 0.4 },
          rotate: { duration: 0.3, repeat: phase === 'flashing' ? 0 : Infinity },
          y: { duration: 0.3, repeat: Infinity }
        }}
        className="relative z-30 flex flex-col items-center"
      >
        <RapifotitoSVG className="w-64 h-64 md:w-80 md:h-80 drop-shadow-2xl" />
        
        <AnimatePresence>
          {phase === 'flashing' && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.8 }}
              className="absolute -bottom-16 bg-white text-purple-600 font-black text-2xl md:text-4xl px-8 py-4 rounded-full shadow-2xl border-4 border-purple-200 whitespace-nowrap"
            >
              ¡Soy Rapifotito, yujúuu!
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Particles */}
      <AnimatePresence>
        {phase === 'flashing' && (
          <>
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
                animate={{ 
                  opacity: 0, 
                  scale: Math.random() * 3 + 1,
                  x: (Math.random() - 0.5) * 800,
                  y: (Math.random() - 0.5) * 800
                }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="absolute top-1/2 left-1/2 w-4 h-4 rounded-full bg-yellow-300 z-20"
                style={{
                  boxShadow: '0 0 20px 10px rgba(253, 224, 71, 0.8)'
                }}
              />
            ))}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
