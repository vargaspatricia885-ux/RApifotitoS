import React, { useState, useEffect } from 'react';
import { Key } from 'lucide-react';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function RequireApiKey({ children }: { children: React.ReactNode }) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        const keySelected = await window.aistudio.hasSelectedApiKey();
        setHasKey(keySelected);
      } else {
        // Fallback if not in AI Studio environment
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio && window.aistudio.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success to mitigate race condition
      setHasKey(true);
    }
  };

  if (hasKey === null) return null; // Loading

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-panel p-8 rounded-2xl shadow-xl max-w-md w-full text-center flex flex-col items-center gap-4 border border-border">
          <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center mb-2">
            <Key size={32} />
          </div>
          <h2 className="text-2xl font-bold text-text">Se requiere API Key</h2>
          <p className="text-text/70 mb-4">
            Para utilizar las funciones avanzadas de mejora de calidad (Super Resolución 2K), necesitas seleccionar tu propia API Key de Gemini.
          </p>
          <button 
            onClick={handleSelectKey}
            className="w-full py-3 px-4 bg-accent hover:bg-accent/80 text-white font-bold rounded-xl transition-colors"
          >
            Seleccionar API Key
          </button>
          <p className="text-xs text-text/50 mt-2">
            Asegúrate de seleccionar una API Key de un proyecto de Google Cloud con facturación habilitada. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-accent hover:underline">Más información</a>.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
