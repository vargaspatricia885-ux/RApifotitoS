import React, { useState, useRef, useEffect } from 'react';
import { Upload, Link as LinkIcon, Image as ImageIcon, Sparkles, Wand2, Scissors, Search, Download, Loader2, SlidersHorizontal, Check, Undo2, Trash2, ChevronDown, ChevronUp, Maximize, MoveDiagonal, Aperture, ZoomIn, ZoomOut, Move, RotateCcw, Crop as CropIcon, Camera, Palette, Filter as FilterIcon, Rocket, Smile, Wind, QrCode, Smartphone, X, Zap, Gem, Sun, GripHorizontal, Lock, Unlock, ImagePlus, Save, Eraser, UserCircle, Settings } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { GoogleGenAI } from '@google/genai';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
// @ts-ignore
import ImageTracer from 'imagetracerjs';
import { jsPDF } from 'jspdf';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });

interface HistoryItem {
  id: string;
  image: string;
  action: string;
}

function DraggableToolbar({ children, isLocked, onToggleLock }: { children: React.ReactNode, isLocked: boolean, onToggleLock: () => void }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isVertical, setIsVertical] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isLocked) return;
    // Prevent dragging if clicking on an interactive element like a button
    if ((e.target as HTMLElement).closest('button, input, [role="button"]')) return;
    
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y
    };
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || isLocked) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPosition({
      x: dragRef.current.initialX + dx,
      y: dragRef.current.initialY + dy
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      containerRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`fixed flex flex-col gap-1 bg-btn-bg/90 backdrop-blur rounded-xl shadow-lg border-2 border-btn-border p-1 z-[100] transition-shadow ${isVertical ? 'w-14' : 'max-w-[90%]'}`}
      style={{ 
        top: '80px', right: '20px', 
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isLocked ? 'auto' : (isDragging ? 'grabbing' : 'grab'),
        boxShadow: isDragging ? '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' : '',
        touchAction: 'none'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className={`flex ${isVertical ? 'flex-col' : 'justify-between items-center'} px-1 py-1 border-${isVertical ? 'b' : 'b'}-2 border-border mb-1 gap-1`}>
         <div className={`flex-1 flex justify-center py-1`} title={isLocked ? "Desbloquear para mover" : "Arrastrar para mover"}>
           <Move size={16} className={`text-text/40 ${isLocked ? 'opacity-50' : 'hover:text-text/60'}`} />
         </div>
         <div className={`flex ${isVertical ? 'flex-col' : 'items-center'} gap-1`}>
           <button onClick={() => setIsVertical(!isVertical)} className="text-text/40 hover:text-accent p-1" title={isVertical ? "Horizontal" : "Vertical"}>
             <GripHorizontal size={14} className={isVertical ? 'rotate-90' : ''} />
           </button>
           <button onClick={onToggleLock} className="text-text/40 hover:text-accent p-1" title={isLocked ? "Desbloquear" : "Bloquear posición"}>
             {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
           </button>
           <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-text/40 hover:text-accent p-1" title={isCollapsed ? "Expandir" : "Contraer"}>
             {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
           </button>
         </div>
      </div>
      {!isCollapsed && (
        <div className={`flex ${isVertical ? 'flex-col' : 'flex-wrap justify-end'} gap-1`}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [previousImage, setPreviousImage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'history' | 'similar'>('history');
  
  const VISUAL_STYLES = [
    { id: 'black', name: 'Black', icon: <Gem size={16} /> },
    { id: 'vibrante', name: 'Vibrante', icon: <Zap size={16} /> },
    { id: 'minimalista', name: 'Minimalista', icon: <Gem size={16} /> }
  ];

  const DEFAULT_THEMES: Record<string, Record<string, string>> = {
    black: {
      '--theme-bg-top': '#000000',
      '--theme-bg-bottom': '#0a0a0a',
      '--theme-bg': '#050505',
      '--theme-panel': '#111111',
      '--theme-text': '#ffffff',
      '--theme-border': '#ffffff',
      '--theme-btn-bg': '#000000',
      '--theme-btn-text': '#ffffff',
      '--theme-btn-border': '#ffffff',
      '--theme-accent': '#ffffff',
    },
    vibrante: {
      '--theme-bg-top': '#0f0c29',
      '--theme-bg-bottom': '#24243e',
      '--theme-bg': '#1a1a2e',
      '--theme-panel': '#141428',
      '--theme-text': '#ffffff',
      '--theme-border': '#00f2fe',
      '--theme-btn-bg': '#000000',
      '--theme-btn-text': '#ffffff',
      '--theme-btn-border': '#ff0844',
      '--theme-accent': '#ff0844',
    },
    minimalista: {
      '--theme-bg-top': '#ffffff',
      '--theme-bg-bottom': '#f5f5f5',
      '--theme-bg': '#ffffff',
      '--theme-panel': '#ffffff',
      '--theme-text': '#000000',
      '--theme-border': '#000000',
      '--theme-btn-bg': '#ffffff',
      '--theme-btn-text': '#000000',
      '--theme-btn-border': '#000000',
      '--theme-accent': '#000000',
    }
  };

  const [theme, setTheme] = useState('black');
  const [isProcessing, setIsProcessing] = useState(false);
  const [customThemes, setCustomThemes] = useState<Record<string, Record<string, string>>>({});
  const [draftTheme, setDraftTheme] = useState<Record<string, string> | null>(null);
  const [isCustomizingTheme, setIsCustomizingTheme] = useState(false);
  const [hasKey, setHasKey] = useState(true);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasKey(has);
      }
    };
    checkKey();
  }, []);
  
  const getContrastColor = (hexColor: string) => {
    // Remove the hash if it exists
    const hex = hexColor.replace('#', '');
    
    // Convert hex to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return black for light backgrounds, white for dark backgrounds
    return luminance > 0.5 ? '#000000' : '#ffffff';
  };

  const handleThemeChange = (key: string, value: string) => {
    setDraftTheme(prev => {
      const currentThemeSettings = { ...(prev || customThemes[theme] || DEFAULT_THEMES[theme]) };
      currentThemeSettings[key] = value;
      
      // Automatically adjust related colors to maintain consistency
      if (key === '--theme-bg') {
        currentThemeSettings['--theme-bg-top'] = value;
        currentThemeSettings['--theme-bg-bottom'] = value;
        currentThemeSettings['--theme-text'] = getContrastColor(value);
      }
      
      if (key === '--theme-btn-bg') {
        currentThemeSettings['--theme-btn-text'] = getContrastColor(value);
      }

      return currentThemeSettings;
    });
  };

  const resetTheme = () => {
    setDraftTheme({ ...DEFAULT_THEMES[theme] });
  };
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [similarImages, setSimilarImages] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  
  const [isInteractiveMode, setIsInteractiveMode] = useState(false);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [isCropMode, setIsCropMode] = useState(false);
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const eraseCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isCameraRunning, setIsCameraRunning] = useState(false);
  const [isCanvasVisible, setIsCanvasVisible] = useState(false);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);
  const [cropWidthPercent, setCropWidthPercent] = useState(100);
  const [cropHeightPercent, setCropHeightPercent] = useState(100);
  const [keepAspectRatio, setKeepAspectRatio] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  
  const [naturalDims, setNaturalDims] = useState({ w: 0, h: 0 });
  const [visualDims, setVisualDims] = useState({ w: 0, h: 0 });
  const [initialVisualDims, setInitialVisualDims] = useState({ w: 0, h: 0 });
  
  const originalContainerRef = useRef<HTMLDivElement>(null);
  const modifiedContainerRef = useRef<HTMLDivElement>(null);
  
  const [isToolbarLocked, setIsToolbarLocked] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);
  const [isChangeBgMode, setIsChangeBgMode] = useState(false);
  const [bgPrompt, setBgPrompt] = useState('');
  const [matchColor, setMatchColor] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const similarFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setOriginalImage(result);
        setCurrentImage(result);
        setPreviousImage(null);
        setHistory([{ id: Date.now().toString(), image: result, action: 'Original' }]);
        setSimilarImages([]);
        setPendingAction(null);
        setIsCanvasVisible(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUrlUpload = () => {
    if (urlInput) {
      setOriginalImage(urlInput);
      setCurrentImage(urlInput);
      setPreviousImage(null);
      setHistory([{ id: Date.now().toString(), image: urlInput, action: 'Original' }]);
      setSimilarImages([]);
      setUrlInput('');
      setPendingAction(null);
      setIsCanvasVisible(true);
    }
  };

  const handleSimilarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          setSimilarImages(prev => [...prev, event.target?.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleDownloadPNG = () => {
    if (!currentImage) return;
    const a = document.createElement('a');
    a.href = currentImage;
    a.download = 'lumina-edit-image.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setShowDownloadMenu(false);
    setShowSaveMenu(false);
  };

  const handleDownloadJPG = () => {
    if (!currentImage) return;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'lumina-edit-image.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setShowDownloadMenu(false);
      setShowSaveMenu(false);
    };
    img.src = currentImage;
  };

  const handleDownloadWEBP = () => {
    if (!currentImage) return;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/webp', 0.9);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'lumina-edit-image.webp';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setShowDownloadMenu(false);
      setShowSaveMenu(false);
    };
    img.src = currentImage;
  };

  const handleDownloadPDF = () => {
    if (!currentImage) return;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const orientation = img.width > img.height ? 'l' : 'p';
      const pdf = new jsPDF({
        orientation: orientation,
        unit: 'px',
        format: [img.width, img.height]
      });
      pdf.addImage(currentImage, 'PNG', 0, 0, img.width, img.height);
      pdf.save('lumina-edit-image.pdf');
      setShowDownloadMenu(false);
      setShowSaveMenu(false);
    };
    img.src = currentImage;
  };

  const handleDownloadSVG = () => {
    if (!currentImage) return;
    
    setIsProcessing(true);
    setProcessingAction('Generando SVG');
    setShowDownloadMenu(false);
    setShowSaveMenu(false);
    
    try {
      ImageTracer.imageToSVG(
        currentImage,
        (svgString: string) => {
          const blob = new Blob([svgString], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'lumina-edit-vector.svg';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          setIsProcessing(false);
          setProcessingAction(null);
        },
        'default'
      );
    } catch (error) {
      console.error("Error generating SVG:", error);
      alert("Hubo un error al generar el SVG.");
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };


  const startInteractiveMode = (sourceImage?: string) => {
    const imgSource = sourceImage || currentImage;
    if (!imgSource) return;
    const img = new Image();
    img.onload = () => {
       setNaturalDims({ w: img.width, h: img.height });
       
       const maxW = 400;
       const maxH = 400;
       let vw = img.width;
       let vh = img.height;
       if (vw > maxW) {
          vh = vh * (maxW / vw);
          vw = maxW;
       }
       if (vh > maxH) {
          vw = vw * (maxH / vh);
          vh = maxH;
       }
       setVisualDims({ w: vw, h: vh });
       setInitialVisualDims({ w: vw, h: vh });
       
       // If we are starting interactive mode from the original image,
       // we should set the current image to the original image so that
       // the interactive mode works on the original image.
       if (sourceImage && sourceImage !== currentImage) {
         setPreviousImage(currentImage);
         setCurrentImage(sourceImage);
       }
       
       setIsInteractiveMode(true);
    };
    img.src = imgSource;
  };

  const startEraseMode = () => {
    if (!currentImage) return;
    setIsEraseMode(true);
  };

  const applyErase = async () => {
    if (!currentImage || !eraseCanvasRef.current || !imgRef.current) return;
    
    // Check if the mask is empty (user didn't draw anything)
    const ctx = eraseCanvasRef.current.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, eraseCanvasRef.current.width, eraseCanvasRef.current.height);
      const hasPixels = imageData.data.some((val, index) => index % 4 === 3 && val > 0);
      if (!hasPixels) {
        setIsEraseMode(false);
        return;
      }
    }

    // Combine original image and mask
    const combinedCanvas = document.createElement('canvas');
    combinedCanvas.width = eraseCanvasRef.current.width;
    combinedCanvas.height = eraseCanvasRef.current.height;
    const combinedCtx = combinedCanvas.getContext('2d');
    
    if (combinedCtx) {
      // Draw original image
      combinedCtx.drawImage(imgRef.current, 0, 0, combinedCanvas.width, combinedCanvas.height);
      // Draw mask over it
      combinedCtx.drawImage(eraseCanvasRef.current, 0, 0);
    }
    
    const combinedDataUrl = combinedCanvas.toDataURL('image/png');

    setIsEraseMode(false);
    
    // Send to Gemini
    await processImage(
      'Borrar', 
      'CRITICAL INSTRUCTION: Completely erase and remove any object, person, or element covered by the solid red mask. You MUST NOT leave any trace, shadow, visual residue, artifacts, or unwanted transparency. The removal must be absolute and precise. Perfectly reconstruct the background behind the masked area so it blends seamlessly with the surrounding environment, making it look as if the erased object never existed. The final output must be a clean, flawless image with no red mask and no remnants of the erased element.', 
      combinedDataUrl
    );
  };

  useEffect(() => {
    if (isEraseMode && imgRef.current && eraseCanvasRef.current) {
      const canvas = eraseCanvasRef.current;
      const img = imgRef.current;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [isEraseMode, currentImage]);

  const handleEraseMouseDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    drawErase(e);
  };

  const handleEraseMouseMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    drawErase(e);
  };

  const handleEraseMouseUp = () => {
    setIsDrawing(false);
    if (eraseCanvasRef.current) {
      const ctx = eraseCanvasRef.current.getContext('2d');
      if (ctx) ctx.beginPath(); // Reset path to avoid connecting lines
    }
  };

  const drawErase = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!eraseCanvasRef.current || !imgRef.current) return;
    const canvas = eraseCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 0, 0, 1)';

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const startCropMode = () => {
    if (!currentImage) return;
    setCrop({ unit: '%', width: 80, height: 80, x: 10, y: 10 });
    setCompletedCrop({ unit: '%', width: 80, height: 80, x: 10, y: 10 } as any);
    setCropWidthPercent(80);
    setCropHeightPercent(80);
    setIsCropMode(true);
  };

  const updateCropFromPercent = (widthPct: number, heightPct: number) => {
    setCrop({
      unit: '%',
      width: widthPct,
      height: heightPct,
      x: (100 - widthPct) / 2,
      y: (100 - heightPct) / 2
    });
  };

  const handleCropAction = (sourceImage: string) => {
    if (sourceImage !== currentImage) {
      setPreviousImage(currentImage);
      setCurrentImage(sourceImage);
    }
    startCropMode();
  };

  const applyCrop = () => {
    if (!currentImage || !completedCrop || !imgRef.current) return;
    
    const image = imgRef.current;
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(completedCrop.width * scaleX);
    canvas.height = Math.floor(completedCrop.height * scaleY);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY
    );

    const dataUrl = canvas.toDataURL('image/png');
    setHistory(prev => [...prev, { id: Date.now().toString(), image: currentImage, action: 'Recortar' }]);
    setCurrentImage(dataUrl);
    setPreviousImage(null);
    setPendingAction(null);
    setIsCropMode(false);
  };

  const applyInteractiveScale = () => {
    if (!currentImage) return;
    const scaleFactorW = visualDims.w / initialVisualDims.w;
    const scaleFactorH = visualDims.h / initialVisualDims.h;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const newWidth = Math.max(1, Math.round(naturalDims.w * scaleFactorW));
      const newHeight = Math.max(1, Math.round(naturalDims.h * scaleFactorH));
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        const dataUrl = canvas.toDataURL('image/png');
        setPreviousImage(currentImage);
        setCurrentImage(dataUrl);
        setPendingAction('Achicar y Agrandar');
      }
      setIsInteractiveMode(false);
    };
    img.src = currentImage;
  };

  const handleDragMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
     // Prevent default only for mouse events to avoid breaking touch scrolling if needed, 
     // but here we want to prevent scrolling while resizing.
     if ('preventDefault' in e && e.cancelable) {
       e.preventDefault();
     }
     
     const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
     const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
     
     const startX = clientX;
     const startY = clientY;
     const startW = visualDims.w;
     const startH = visualDims.h;
     const ratio = startW / startH;
     
     const onMove = (moveEvent: MouseEvent | TouchEvent) => {
        const currentClientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : (moveEvent as MouseEvent).clientX;
        const currentClientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : (moveEvent as MouseEvent).clientY;
        
        const deltaX = currentClientX - startX;
        const deltaY = currentClientY - startY;
        let newW = startW + deltaX;
        let newH = startH + deltaY;
        
        if (newW < 50) newW = 50;
        if (newH < 50) newH = 50;

        if (maintainAspectRatio) {
           newH = newW / ratio;
        }
        
        setVisualDims({ w: newW, h: newH });
     };
     
     const onEnd = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
     };
     
     document.addEventListener('mousemove', onMove);
     document.addEventListener('mouseup', onEnd);
     document.addEventListener('touchmove', onMove, { passive: false });
     document.addEventListener('touchend', onEnd);
  };

  const handleNewUpload = () => {
    setOriginalImage(null);
    setCurrentImage(null);
    setPreviousImage(null);
    setHistory([]);
    setSimilarImages([]);
    setUrlInput('');
    setPendingAction(null);
    setIsCropMode(false);
    setCrop(undefined);
    setCompletedCrop(null);
    setIsCanvasVisible(false);
  };

  const handleUndo = () => {
    if (previousImage) {
      setCurrentImage(previousImage);
      setPreviousImage(null);
      setPendingAction(null);
    } else if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop();
      setHistory(newHistory);
      setCurrentImage(newHistory[newHistory.length - 1].image);
    }
  };

  const rotateImageBase64 = async (base64: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.height;
        canvas.height = img.width;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get 2d context'));
          return;
        }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((90 * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
    });
  };

  const handleRotateOriginal = async () => {
    if (!originalImage) return;
    setIsProcessing(true);
    setProcessingAction('Rotando');
    try {
      const rotated = await rotateImageBase64(originalImage);
      setOriginalImage(rotated);
    } catch (error) {
      console.error('Error rotating image:', error);
    } finally {
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };

  const handleRotateCurrent = async () => {
    if (!currentImage) return;
    setIsProcessing(true);
    setProcessingAction('Rotando');
    try {
      const rotated = await rotateImageBase64(currentImage);
      setPreviousImage(currentImage);
      setCurrentImage(rotated);
      setHistory(prev => [...prev, { id: Date.now().toString(), action: 'Rotar 90°', image: rotated }]);
      setPendingAction(null);
    } catch (error) {
      console.error('Error rotating image:', error);
    } finally {
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };

  const revertToHistory = (index: number) => {
    if (previousImage) {
      setPreviousImage(null);
      setPendingAction(null);
    }
    const newHistory = history.slice(0, index + 1);
    setHistory(newHistory);
    setCurrentImage(newHistory[newHistory.length - 1].image);
  };

  const getBase64Data = async (imageUrl: string) => {
    let base64Data = imageUrl;
    let mimeType = 'image/jpeg';
    
    if (imageUrl.startsWith('data:')) {
      const matches = imageUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        base64Data = matches[2];
      }
    } else {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        mimeType = blob.type;
        base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }) as string;
      } catch (e) {
        throw new Error("No se pudo cargar la imagen desde la URL. Puede ser un problema de permisos (CORS). Intenta descargarla y subirla desde tu PC.");
      }
    }
    return { base64Data, mimeType };
  };

  const processImage = async (action: string, prompt: string, sourceImage: string = currentImage!, referenceImage?: string, options?: { model?: string, imageConfig?: any }) => {
    if (!sourceImage) return;
    
    setIsProcessing(true);
    setProcessingAction(action);
    
    try {
      const { base64Data, mimeType } = await getBase64Data(sourceImage);
      
      const parts: any[] = [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        {
          text: prompt,
        },
      ];

      if (referenceImage) {
        const refData = await getBase64Data(referenceImage);
        parts.unshift({
          inlineData: {
            data: refData.base64Data,
            mimeType: refData.mimeType,
          },
        });
      }

      // Re-initialize GoogleGenAI to ensure it uses the latest API key if selected
      const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });

      const response = await currentAi.models.generateContent({
        model: options?.model || 'gemini-2.5-flash-image',
        contents: {
          parts: parts,
        },
        config: options?.imageConfig ? { imageConfig: options.imageConfig } : undefined,
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const newImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          setPreviousImage(currentImage);
          setCurrentImage(newImageUrl);
          setPendingAction(action);
          break;
        }
      }
    } catch (error: any) {
      console.error("Error processing image:", error);
      if (error.message?.includes("Requested entity was not found") || error.message?.includes("PERMISSION_DENIED") || error.message?.includes("403")) {
        setHasKey(false);
      }
      alert(error.message || "Hubo un error al procesar la imagen. Por favor, intenta de nuevo.");
    } finally {
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };

  const findSimilarImages = async () => {
    if (!currentImage) return;
    
    setIsProcessing(true);
    setProcessingAction('Buscar Similares');
    
    try {
      const { base64Data, mimeType } = await getBase64Data(currentImage);

      const newSimilarImages: string[] = [];
      
      const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
      
      // Generate 2 variations in parallel
      const promises = Array(2).fill(0).map((_, i) => {
        return currentAi.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType,
                },
              },
              {
                text: `Generate a high quality variation of this image. Keep the same core subject and style but make it slightly different. Variation ${i+1}`,
              },
            ],
          },
        });
      });

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
         for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            newSimilarImages.push(`data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`);
            break;
          }
        }
      });
      
      setSimilarImages(newSimilarImages);

    } catch (error: any) {
      console.error("Error finding similar images:", error);
      if (error.message?.includes("Requested entity was not found") || error.message?.includes("PERMISSION_DENIED") || error.message?.includes("403")) {
        setHasKey(false);
      }
      alert(error.message || "Hubo un error al buscar imágenes similares.");
    } finally {
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4" data-theme={theme === 'slate' ? undefined : theme} style={(isCustomizingTheme && draftTheme ? draftTheme : customThemes[theme]) as React.CSSProperties}>
        <div className="bg-panel max-w-md w-full rounded-3xl p-8 shadow-xl border-2 border-border text-center flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center text-accent">
            <Lock size={32} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-text mb-2">Clave de API Requerida</h2>
            <p className="text-text/70 mb-4">
              Para usar las funciones avanzadas de procesamiento de imágenes, necesitas configurar tu propia clave de API de Gemini.
            </p>
            <p className="text-text/70 text-sm">
              Asegúrate de seleccionar una clave de un proyecto de Google Cloud con facturación habilitada. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-accent hover:underline font-bold">Más información</a>.
            </p>
          </div>
          <button 
            onClick={async () => {
              if (window.aistudio?.openSelectKey) {
                await window.aistudio.openSelectKey();
                setHasKey(true);
              }
            }}
            className="w-full py-4 bg-accent text-bg rounded-xl font-bold text-lg hover:bg-accent/90 transition-colors shadow-lg"
          >
            Seleccionar Clave de API
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-gradient-to-b from-bg-top to-bg-bottom relative overflow-x-hidden overflow-y-auto font-sans text-text flex" 
      data-theme={theme === 'slate' ? undefined : theme}
      style={(isCustomizingTheme && draftTheme ? draftTheme : customThemes[theme]) as React.CSSProperties}
    >
      {/* Background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] blob-1 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-blob"></div>
      <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] blob-2 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-[40%] h-[40%] blob-3 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-blob animation-delay-4000"></div>

      {/* Modals and Overlays */}
      {isChangeBgMode && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-panel rounded-3xl shadow-2xl border-2 border-border p-6 max-w-md w-full flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-text">Cambiar Fondo con IA</h3>
              <button onClick={() => setIsChangeBgMode(false)} className="text-text/40 hover:text-text">
                <X size={24} />
              </button>
            </div>
            <p className="text-sm text-text/60">
              Describe el nuevo fondo que deseas. La IA detectará el sujeto principal y lo integrará de forma realista.
            </p>
            <textarea
              value={bgPrompt}
              onChange={(e) => setBgPrompt(e.target.value)}
              placeholder="Ej: Una playa al atardecer con palmeras..."
              className="w-full bg-btn-bg/80 border-2 border-border rounded-xl px-4 py-3 text-base focus:outline-none focus:border-border focus:ring-1 focus:ring-accent transition-all min-h-[100px] resize-none"
            />
            <label className="flex items-center gap-2 cursor-pointer mt-1">
              <input 
                type="checkbox" 
                checked={matchColor} 
                onChange={(e) => setMatchColor(e.target.checked)}
                className="w-4 h-4 text-accent rounded border-border focus:ring-accent"
              />
              <span className="text-sm font-bold text-btn-text">Igualar color (Match Color)</span>
            </label>
            <div className="flex justify-end gap-3 mt-4">
              <button 
                onClick={() => setIsChangeBgMode(false)}
                className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold bg-btn-bg text-btn-text hover:bg-bg px-5 py-3 rounded-xl border-2 border-btn-border shadow-sm transition-all flex-1 sm:flex-none sm:w-[170px]"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  const matchColorPrompt = matchColor ? " CRITICAL: Automatically adjust the tones, lighting, and color balance between the new background and the foreground subject to achieve a coherent and natural visual integration without manual intervention." : "";
                  processImage('Cambiar Fondo', `Replace the background of this image with: ${bgPrompt}. Detect and respect the edges of the main subject perfectly. Adjust the lighting, color, and shadows of the main subject to integrate realistically with the new background.${matchColorPrompt} Ensure high photographic quality.`, currentImage!);
                  setIsChangeBgMode(false);
                  setBgPrompt('');
                }}
                disabled={!bgPrompt.trim() || isProcessing}
                className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold bg-btn-bg text-btn-text hover:bg-bg px-5 py-3 rounded-xl border-2 border-btn-border shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-1 sm:flex-none sm:w-[170px]"
              >
                <Sparkles size={20} />
                Generar Fondo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Theme Customization Modal */}
      {isCustomizingTheme && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-panel w-full max-w-md rounded-3xl p-6 shadow-xl border-2 border-border flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-text">Personalizar Estilo</h3>
              <button onClick={() => setIsCustomizingTheme(false)} className="p-2 text-text/60 hover:text-accent rounded-full hover:bg-bg transition-colors">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-text/70 mb-2">Ajusta los colores para el tema actual ({VISUAL_STYLES.find(s => s.id === theme)?.name}).</p>
            
            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {[
                { key: '--theme-bg', label: 'Fondo Principal' },
                { key: '--theme-panel', label: 'Fondo de Paneles' },
                { key: '--theme-text', label: 'Texto Principal' },
                { key: '--theme-accent', label: 'Color de Acento' },
                { key: '--theme-border', label: 'Bordes' },
                { key: '--theme-btn-bg', label: 'Fondo de Botones' },
                { key: '--theme-btn-text', label: 'Texto de Botones' },
              ].map(item => {
                const currentValue = draftTheme?.[item.key] || customThemes[theme]?.[item.key] || DEFAULT_THEMES[theme]?.[item.key] || '#000000';
                return (
                  <div key={item.key} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-text">{item.label}</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={currentValue} 
                        onChange={(e) => handleThemeChange(item.key, e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-4 border-t-2 border-border">
              <button 
                onClick={resetTheme}
                className="flex items-center justify-center gap-2 text-sm font-bold text-text hover:text-accent px-4 py-2 transition-colors"
              >
                Restaurar
              </button>
              <button 
                onClick={() => {
                  if (draftTheme) {
                    setCustomThemes(prev => ({
                      ...prev,
                      [theme]: draftTheme
                    }));
                  }
                  setIsCustomizingTheme(false);
                }}
                className="flex items-center justify-center gap-2 text-sm font-bold bg-accent text-bg hover:opacity-90 px-6 py-2 rounded-xl border-2 border-accent shadow-sm transition-all"
              >
                <Check size={16} />
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Style Switcher - Horizontal Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 w-full bg-panel/80 backdrop-blur-md border-b-2 border-border shadow-sm">
        <div className="flex items-center justify-center gap-2 p-2 overflow-x-auto custom-scrollbar max-w-7xl mx-auto relative">
          <button
            onClick={() => {
              const nextTheme = VISUAL_STYLES[(VISUAL_STYLES.findIndex(s => s.id === theme) + 1) % VISUAL_STYLES.length].id;
              setTheme(nextTheme);
              if (isCustomizingTheme) {
                setDraftTheme(customThemes[nextTheme] || { ...DEFAULT_THEMES[nextTheme] });
              }
            }}
            className="flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold bg-accent text-bg shadow-md hover:opacity-90 transition-all whitespace-nowrap"
            title="Cambiar estilo (Clic para rotar)"
          >
            {VISUAL_STYLES.find(s => s.id === theme)?.icon}
            Estilo: {VISUAL_STYLES.find(s => s.id === theme)?.name}
          </button>
          <button
            onClick={() => {
              setDraftTheme(customThemes[theme] || { ...DEFAULT_THEMES[theme] });
              setIsCustomizingTheme(true);
            }}
            className="absolute right-4 p-2 rounded-full text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Personalizar Estilo"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col lg:flex-row w-full min-h-screen p-4 pt-16 lg:p-6 lg:pt-20 gap-4 lg:gap-6 overflow-x-hidden overflow-y-auto">

        {/* LEFT PANEL: Upload & Tools */}
        <div className="w-full lg:w-72 flex flex-col gap-4 lg:gap-6 shrink-0 pb-20 lg:pb-0">
          {/* Logo */}
          <div className="relative w-full py-6 px-4 rounded-3xl bg-transparent flex flex-col items-center justify-center gap-3 border-2 border-border group overflow-visible">
            <div 
              className={`relative flex items-center justify-center w-24 h-24 cursor-pointer ${isCameraRunning ? 'animate-run-crazy' : 'group-hover:scale-110 transition-transform duration-300'}`}
              onClick={() => {
                if (!isCameraRunning) setIsCameraRunning(true);
              }}
              onAnimationEnd={() => setIsCameraRunning(false)}
            >
              <div className="relative w-full h-full group/logo flex items-center justify-center">
                <Camera size={64} className={`text-accent z-10 ${isCameraRunning ? 'animate-bounce-fast' : ''}`} strokeWidth={1.5} />
              </div>
              
              {/* Legs */}
              {isCameraRunning && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-3 z-0">
                  <div className="w-2 h-6 bg-accent rounded-full animate-leg-run-1 origin-top"></div>
                  <div className="w-2 h-6 bg-accent rounded-full animate-leg-run-2 origin-top"></div>
                </div>
              )}
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-black tracking-tighter logo-text text-white">
                RApiFotitoS
              </h1>
              <p className="text-sm font-bold mt-1 logo-subtitle text-white">
                {isCameraRunning ? '¡Atrápala!' : 'hace tus fotos geniales'}
              </p>
            </div>
          </div>

          {/* Upload Section */}
          <div className="bg-panel backdrop-blur-xl border-2 border-border shadow-xl rounded-3xl p-6 flex flex-col gap-4">
            <h2 className="text-lg font-bold tracking-tight text-text">Cargar Imagen</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 w-full bg-primary text-black py-3 px-5 rounded-xl hover:bg-primary-hover border-2 border-border transition-all font-bold text-sm sm:text-base shadow-sm"
              >
                <Upload size={20} />
                <span>Desde galería</span>
              </button>
              
              <button 
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center justify-center gap-2 w-full bg-btn-bg text-btn-text py-3 px-5 rounded-xl hover:bg-bg border-2 border-btn-border transition-all font-bold text-sm sm:text-base shadow-sm"
              >
                <Camera size={20} />
                <span>Usar Cámara</span>
              </button>
            </div>

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
            <input 
              type="file" 
              ref={cameraInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              capture="environment"
              className="hidden" 
            />

            <div className="relative flex items-center">
              <div className="flex-grow border-t-2 border-border"></div>
              <span className="flex-shrink-0 mx-4 text-text/50 text-sm font-medium">O</span>
              <div className="flex-grow border-t-2 border-border"></div>
            </div>

            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="URL de la imagen..." 
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 bg-btn-bg/80 border-2 border-border rounded-xl px-4 py-3 text-sm sm:text-base focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-medium text-text"
              />
              <button 
                onClick={handleUrlUpload}
                className="flex items-center justify-center bg-btn-bg text-btn-text px-5 py-3 rounded-xl hover:bg-bg border-2 border-btn-border transition-all shadow-sm"
              >
                <LinkIcon size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* CENTER PANEL: Canvas */}
        {isCanvasVisible && (
        <div className="flex-1 bg-panel backdrop-blur-xl border-2 border-border shadow-xl rounded-3xl p-4 lg:p-6 flex flex-col relative overflow-auto min-h-[400px] lg:min-h-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 sm:gap-0">
            <h2 className="text-xl font-bold tracking-tight text-text">Lienzo Principal</h2>
            {currentImage && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                <button 
                  onClick={handleNewUpload}
                  className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold bg-primary text-black hover:bg-primary-hover px-5 py-3 rounded-xl border-2 border-primary shadow-sm transition-all w-full"
                  title="Limpiar lienzo y empezar de nuevo"
                >
                  <Trash2 size={20} /> Nueva Carga
                </button>
                <button 
                  onClick={handleUndo}
                  disabled={history.length <= 1 && !previousImage}
                  className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold bg-btn-bg text-btn-text hover:bg-bg px-5 py-3 rounded-xl border-2 border-btn-border shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full"
                  title="Volver atrás de una modificación"
                >
                  <Undo2 size={20} /> Volver Atrás
                </button>
                <button 
                  onClick={handleDownloadPNG}
                  className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold bg-btn-bg text-btn-text hover:bg-bg px-5 py-3 rounded-xl border-2 border-btn-border shadow-sm transition-all w-full"
                  title="Descargar imagen en formato PNG"
                >
                  <Download size={20} /> Descargar
                </button>
                <div className="relative w-full">
                  <button 
                    onClick={() => setShowSaveMenu(!showSaveMenu)}
                    className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold bg-btn-bg text-btn-text hover:bg-bg px-5 py-3 rounded-xl border-2 border-btn-border shadow-sm transition-all w-full h-full"
                  >
                    <Save size={20} /> Guardar <ChevronDown size={18} />
                  </button>
                  {showSaveMenu && (
                      <div className="absolute right-0 mt-2 w-32 bg-btn-bg rounded-xl shadow-lg border-2 border-border overflow-hidden z-20">
                        <button onClick={handleDownloadJPG} className="block w-full text-left px-4 py-2 hover:bg-bg text-sm font-medium text-btn-text border-b-2 border-border">JPG</button>
                        <button onClick={handleDownloadPNG} className="block w-full text-left px-4 py-2 hover:bg-bg text-sm font-medium text-btn-text border-b-2 border-border">PNG</button>
                        <button onClick={handleDownloadWEBP} className="block w-full text-left px-4 py-2 hover:bg-bg text-sm font-medium text-btn-text border-b-2 border-border">WEBP</button>
                        <button onClick={handleDownloadPDF} className="block w-full text-left px-4 py-2 hover:bg-bg text-sm font-medium text-btn-text border-b-2 border-border">PDF</button>
                        <button onClick={handleDownloadSVG} className="block w-full text-left px-4 py-2 hover:bg-bg text-sm font-medium text-text">SVG (Vector)</button>
                      </div>
                    )}
                  </div>
              </div>
            )}
          </div>
          
          <div className="flex-1 bg-panel/50 rounded-2xl border-2 border-dashed border-border flex flex-col relative overflow-hidden min-h-[50vh] lg:min-h-0">
            {isInteractiveMode ? (
              <>
                <div className="absolute top-4 right-4 flex gap-3 z-20">
                   <button onClick={() => setIsInteractiveMode(false)} className="px-6 py-3 bg-btn-bg text-btn-text rounded-xl shadow-sm font-bold hover:bg-bg border-2 border-btn-border text-sm sm:text-base">Cancelar</button>
                   <button onClick={applyInteractiveScale} className="px-6 py-3 bg-accent text-bg rounded-xl shadow-sm font-bold hover:bg-accent/80 border-2 border-btn-border text-sm sm:text-base">Aplicar</button>
                </div>
                
                {(() => {
                  const scaleFactorW = visualDims.w / initialVisualDims.w;
                  const scaleFactorH = visualDims.h / initialVisualDims.h;
                  const finalW = Math.round(naturalDims.w * scaleFactorW);
                  const finalH = Math.round(naturalDims.h * scaleFactorH);
                  
                  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const newW = Number(e.target.value);
                    if (newW > 0) {
                      const newScale = newW / naturalDims.w;
                      setVisualDims({
                        w: initialVisualDims.w * newScale,
                        h: maintainAspectRatio ? initialVisualDims.h * newScale : visualDims.h
                      });
                    }
                  };

                  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const newH = Number(e.target.value);
                    if (newH > 0) {
                      const newScale = newH / naturalDims.h;
                      setVisualDims({
                        w: maintainAspectRatio ? initialVisualDims.w * newScale : visualDims.w,
                        h: initialVisualDims.h * newScale
                      });
                    }
                  };

                  const handlePercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const newPct = Number(e.target.value);
                    if (newPct > 0) {
                      const newScale = newPct / 100;
                      setVisualDims({
                        w: initialVisualDims.w * newScale,
                        h: initialVisualDims.h * newScale
                      });
                    }
                  };

                  return (
                    <div className="absolute top-4 left-4 right-4 sm:right-auto z-20 bg-btn-bg/90 backdrop-blur p-4 rounded-2xl shadow-lg border-2 border-border flex flex-col gap-4 overflow-x-auto">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex flex-col">
                          <label className="text-xs font-bold text-text/60 uppercase mb-1">Ancho (px)</label>
                          <input type="number" value={finalW} onChange={handleWidthChange} className="w-24 bg-btn-bg border-2 border-border rounded-xl px-3 py-1.5 text-sm font-mono font-bold text-btn-text focus:outline-none focus:border-accent transition-colors" />
                        </div>
                        <div className="flex flex-col">
                          <label className="text-xs font-bold text-text/60 uppercase mb-1">Alto (px)</label>
                          <input type="number" value={finalH} onChange={handleHeightChange} className="w-24 bg-btn-bg border-2 border-border rounded-xl px-3 py-1.5 text-sm font-mono font-bold text-btn-text focus:outline-none focus:border-accent transition-colors" />
                        </div>
                        <div className="flex flex-col">
                          <label className="text-xs font-bold text-text/60 uppercase mb-1">Escala (%)</label>
                          <input type="number" value={Math.round(scaleFactorW * 100)} onChange={handlePercentChange} className="w-24 bg-btn-bg border-2 border-border rounded-xl px-3 py-1.5 text-sm font-mono font-bold text-btn-text focus:outline-none focus:border-accent transition-colors" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer mt-1">
                        <input 
                          type="checkbox" 
                          checked={maintainAspectRatio} 
                          onChange={(e) => setMaintainAspectRatio(e.target.checked)}
                          className="w-4 h-4 text-accent rounded border-border focus:ring-accent"
                        />
                        <span className="text-sm font-bold text-btn-text">Mantener proporción</span>
                      </label>
                    </div>
                  );
                })()}

              <div className="w-full h-full overflow-auto custom-scrollbar p-4">
                <div className="w-max h-max min-w-full min-h-full flex flex-col relative p-8">
                  <div 
                    className="relative group m-auto mt-24" 
                    style={{ width: visualDims.w, height: visualDims.h }}
                  >
                     <img src={currentImage!} className="w-full h-full shadow-md rounded-lg pointer-events-none" style={{ objectFit: maintainAspectRatio ? 'contain' : 'fill' }} alt="Interactive scale" />
                     
                     {/* Drag Handle */}
                     <div 
                       onMouseDown={handleDragMouseDown}
                       onTouchStart={handleDragMouseDown}
                       className="absolute -bottom-3 -right-3 w-8 h-8 bg-accent rounded-full border-4 border-btn-bg shadow-lg cursor-se-resize flex items-center justify-center hover:scale-110 transition-transform z-20"
                     >
                       <MoveDiagonal size={14} className="text-bg" />
                     </div>
                     
                     {/* Border highlight */}
                     <div className="absolute inset-0 border-2 border-border rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                </div>
              </div>
              </>
            ) : isCropMode ? (
              <>
                <div className="absolute top-4 right-4 flex gap-3 z-20">
                   <button onClick={() => setIsCropMode(false)} className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold bg-btn-bg text-btn-text hover:bg-bg px-5 py-3 rounded-xl border-2 border-btn-border shadow-sm transition-all flex-1 sm:flex-none sm:w-[170px]">Cancelar</button>
                   <button onClick={applyCrop} className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold bg-accent text-bg hover:bg-accent/80 px-5 py-3 rounded-xl border-2 border-btn-border shadow-sm transition-all flex-1 sm:flex-none sm:w-[170px]" title="Aplicar recorte">Aplicar</button>
                </div>
                
                <div className="absolute top-4 left-4 right-4 sm:right-auto z-20 bg-btn-bg/90 backdrop-blur p-4 rounded-2xl shadow-lg border-2 border-border flex flex-col gap-4 overflow-x-auto">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-accent">Ajusta el área para recortar</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={keepAspectRatio} 
                        onChange={(e) => {
                          setKeepAspectRatio(e.target.checked);
                          if (e.target.checked && cropWidthPercent) {
                            setCropHeightPercent(cropWidthPercent);
                            updateCropFromPercent(cropWidthPercent, cropWidthPercent);
                          }
                        }}
                        className="w-4 h-4 text-accent rounded border-border focus:ring-accent"
                      />
                      <span className="text-sm font-bold text-btn-text">Mantener proporción</span>
                    </label>
                  </div>
                </div>

                <div className="w-full h-full flex flex-col relative p-4 mt-24">
                  <div className="flex-1 w-full relative flex items-center justify-center bg-btn-bg/50 rounded-xl border-2 border-border overflow-hidden">
                    <TransformWrapper
                      initialScale={0.8}
                      minScale={0.1}
                      maxScale={8}
                      centerOnInit={true}
                      wheel={{ step: 0.1 }}
                      panning={{ excluded: ['ReactCrop', 'ReactCrop__crop-selection', 'ReactCrop__drag-handle', 'ReactCrop__drag-bar'] }}
                    >
                      {({ zoomIn, zoomOut, resetTransform, scale }) => (
                        <>
                          <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                            <ReactCrop 
                              crop={crop} 
                              onChange={(c, percentCrop) => {
                                setCrop(c);
                                if (percentCrop.width && percentCrop.height) {
                                  setCropWidthPercent(Math.round(percentCrop.width));
                                  setCropHeightPercent(Math.round(percentCrop.height));
                                }
                              }} 
                              onComplete={c => setCompletedCrop(c)}
                              aspect={keepAspectRatio ? 1 : undefined}
                              className="max-w-full max-h-full m-auto"
                              renderSelectionAddon={(state) => (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    applyCrop();
                                  }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onTouchStart={(e) => e.stopPropagation()}
                                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-accent text-bg p-4 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center justify-center border-4 border-bg/50 group"
                                  title="Recortar selección"
                                >
                                  <CropIcon size={32} className="group-hover:animate-pulse" />
                                </button>
                              )}
                            >
                              <img 
                                ref={imgRef}
                                src={currentImage!} 
                                className="max-w-full max-h-full object-contain shadow-md rounded-lg" 
                                alt="Crop" 
                                crossOrigin="anonymous"
                              />
                            </ReactCrop>
                          </TransformComponent>
                          <div className="absolute bottom-4 right-4 flex bg-btn-bg/90 backdrop-blur rounded-xl shadow-md border-2 border-btn-border overflow-hidden z-10">
                            <button onClick={() => zoomOut()} className="p-3 hover:bg-bg text-btn-text" title="Alejar"><ZoomOut size={20} /></button>
                            <div className="flex items-center justify-center px-3 text-sm font-bold text-text/80 min-w-[4rem] select-none">
                              {Math.round(scale * 100)}%
                            </div>
                            <button onClick={() => zoomIn()} className="p-3 hover:bg-bg text-btn-text" title="Acercar"><ZoomIn size={20} /></button>
                            <div className="w-px bg-border"></div>
                            <button onClick={() => resetTransform()} className="p-3 hover:bg-bg text-btn-text" title="Restaurar vista"><Maximize size={20} /></button>
                          </div>
                        </>
                      )}
                    </TransformWrapper>
                  </div>
                </div>
              </>
            ) : isEraseMode ? (
              <>
                <div className="absolute top-4 right-4 flex gap-3 z-20">
                   <button onClick={() => setIsEraseMode(false)} className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold bg-btn-bg text-btn-text hover:bg-bg px-5 py-3 rounded-xl border-2 border-btn-border shadow-sm transition-all flex-1 sm:flex-none sm:w-[170px]">Cancelar</button>
                   <button onClick={applyErase} className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold bg-btn-bg text-btn-text hover:bg-bg px-5 py-3 rounded-xl border-2 border-btn-border shadow-sm transition-all flex-1 sm:flex-none sm:w-[170px]" title="Borrar área seleccionada">Borrar</button>
                </div>
                
                <div className="absolute top-4 left-4 right-4 sm:right-auto z-20 bg-btn-bg/90 backdrop-blur p-4 rounded-2xl shadow-lg border-2 border-border flex flex-col gap-4 overflow-x-auto">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-btn-text flex justify-between">
                      <span>Tamaño del pincel</span>
                      <span>{brushSize}px</span>
                    </label>
                    <input 
                      type="range" 
                      min="1" 
                      max="100" 
                      value={brushSize} 
                      onChange={(e) => setBrushSize(parseInt(e.target.value))}
                      className="w-full sm:w-48 h-2 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                    />
                  </div>
                </div>

                <div className="w-full h-full flex flex-col relative p-4 mt-24">
                  <div className="flex-1 w-full relative flex items-center justify-center bg-btn-bg/50 rounded-xl border-2 border-border overflow-hidden">
                    <div className="relative max-w-full max-h-full flex items-center justify-center">
                      <img 
                        ref={imgRef}
                        src={currentImage!} 
                        alt="Erase mode" 
                        className="max-w-full max-h-full pointer-events-none"
                      />
                      <canvas
                        ref={eraseCanvasRef}
                        onMouseDown={handleEraseMouseDown}
                        onMouseMove={handleEraseMouseMove}
                        onMouseUp={handleEraseMouseUp}
                        onMouseLeave={handleEraseMouseUp}
                        onTouchStart={handleEraseMouseDown}
                        onTouchMove={handleEraseMouseMove}
                        onTouchEnd={handleEraseMouseUp}
                        className="absolute top-0 left-0 w-full h-full cursor-crosshair touch-none opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : !originalImage ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-text/40 gap-3 p-4 min-h-[50vh]">
                <ImageIcon size={48} className="opacity-50" />
                <p className="font-medium text-center">Sube una imagen para comenzar</p>
              </div>
            ) : (
              <div className="w-full h-full overflow-hidden flex flex-col p-2 lg:p-4">
                <div className="flex flex-col md:flex-row w-full h-full gap-4">
                {showOriginal && (
                  <div className="flex-1 flex flex-col items-center gap-2 min-h-[30vh] md:min-h-0 relative">
                    <span className="font-bold text-text/60 bg-btn-bg px-4 py-1.5 rounded-full shadow-sm text-sm border-2 border-border absolute top-2 z-10">Original</span>
                    <div className="flex-1 w-full relative flex items-center justify-center bg-btn-bg/50 rounded-xl border-2 border-border overflow-hidden">
                      <TransformWrapper
                        initialScale={1}
                        minScale={0.1}
                        maxScale={8}
                        centerOnInit={true}
                        wheel={{ step: 0.1 }}
                      >
                        {({ zoomIn, zoomOut, resetTransform, scale }) => (
                          <>
                            <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                              <img 
                                src={originalImage} 
                                alt="Original" 
                                className="max-w-full max-h-full object-contain drop-shadow-md pointer-events-none will-change-transform" 
                                referrerPolicy="no-referrer" 
                              />
                            </TransformComponent>
                            <div className="absolute bottom-2 right-2 flex bg-btn-bg/90 backdrop-blur rounded-lg shadow-md border-2 border-btn-border overflow-hidden z-10">
                              <button onClick={() => zoomOut()} className="p-1.5 hover:bg-bg text-btn-text"><ZoomOut size={14} /></button>
                              <div className="flex items-center justify-center px-2 text-xs font-bold text-text/80 min-w-[3rem] select-none">
                                {Math.round(scale * 100)}%
                              </div>
                              <button onClick={() => zoomIn()} className="p-1.5 hover:bg-bg text-btn-text"><ZoomIn size={14} /></button>
                              <div className="w-px bg-border"></div>
                              <button onClick={() => resetTransform()} className="p-1.5 hover:bg-bg text-btn-text"><Maximize size={14} /></button>
                            </div>
                          </>
                        )}
                      </TransformWrapper>
                    </div>
                  </div>
                )}
                <div className="flex-1 flex flex-col items-center gap-2 min-h-[30vh] md:min-h-0 relative">
                  <span className="font-bold text-accent bg-accent/10 px-4 py-1.5 rounded-full shadow-sm text-sm border-2 border-border absolute top-2 z-10">
                    {previousImage ? "Modificado (Vista Previa)" : "Modificado"}
                  </span>
                  <DraggableToolbar isLocked={isToolbarLocked} onToggleLock={() => setIsToolbarLocked(!isToolbarLocked)}>
                    <button disabled={isProcessing} onClick={() => processImage('Eliminar Fondo', 'Remove the background of this image, leaving only the main subject on a pure white background.', currentImage!)} className="p-2 hover:bg-bg rounded-lg text-btn-text hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Eliminar Fondo">
                      <Scissors size={18} />
                    </button>
                    <button disabled={isProcessing} onClick={() => processImage('Vectorizar', 'Convert this image into a highly detailed, realistic vector art style. Maximize the number of colors, gradients, and detail level to create a faithful representation of the original image. Do NOT use line art, hard edges, or flat colors. Prioritize high photographic fidelity, preserving textures, shadows, lights, and smooth transitions between tones.', currentImage!)} className="p-2 hover:bg-bg rounded-lg text-btn-text hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Vectorizar (Alta Fidelidad)">
                      <Wand2 size={18} />
                    </button>
                    <button disabled={isProcessing} onClick={() => processImage('Aumentar Calidad', 'Upscale and enhance the quality of this photo, make it high resolution, sharp, and detailed. Reconstruct details creatively, increasing sharpness and realism without generating artificial artifacts. Preserve textures, sharp edges, and visual coherence. Apply super-resolution techniques to maintain or improve original details while upscaling.', currentImage!, undefined, { model: 'gemini-3.1-flash-image-preview', imageConfig: { imageSize: '2K' } })} className="p-2 hover:bg-bg rounded-lg text-btn-text hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Aumentar Calidad">
                      <Sparkles size={18} />
                    </button>
                    <button disabled={isProcessing} onClick={() => processImage('Optimizar Foto', 'Improve the overall quality of this image. Enhance sharpness, fix lighting, improve contrast, and reduce noise. Do NOT alter the content, composition, or original elements of the image. Keep it exactly the same but with professional photographic quality.', currentImage!)} className="p-2 hover:bg-bg rounded-lg text-btn-text hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Optimizar Foto">
                      <SlidersHorizontal size={18} />
                    </button>
                    <button disabled={isProcessing} onClick={() => processImage('Efecto de Estudio', 'Enhance this photo with professional studio lighting, cinematic color grading, and sharp details. Do NOT add, remove, or alter any objects, people, or the background composition. Keep the exact same content, just improve the lighting, contrast, and photographic quality.', currentImage!)} className="p-2 hover:bg-bg rounded-lg text-btn-text hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Efecto de Estudio">
                      <Sun size={18} />
                    </button>
                    <button disabled={isProcessing} onClick={() => setIsChangeBgMode(true)} className="p-2 hover:bg-bg rounded-lg text-btn-text hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Cambiar fondo con IA">
                      <ImagePlus size={18} />
                    </button>
                    <button disabled={isProcessing} onClick={startEraseMode} className="p-2 hover:bg-bg rounded-lg text-btn-text hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Borrar Objetos">
                      <Eraser size={18} />
                    </button>
                    <button disabled={isProcessing} onClick={() => processImage('Retrato', 'Smooth skin (smooth effect) without losing naturalness. Remove blemishes, imperfections, and pimples. Reduce or eliminate dark circles. Deflate puffy eyes. Maintain realistic texture avoiding artificial effect.', currentImage!)} className="p-2 hover:bg-bg rounded-lg text-btn-text hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Retrato (Suavizar piel)">
                      <UserCircle size={18} />
                    </button>
                    <button disabled={isProcessing} onClick={() => processImage('Restaurar', 'Restore this old photo into a professional portrait of DSLR-quality colour and detail, using an advanced upscaling algorithm comparable to the results from the Canon EOS R6 Mark II. Ensure the restored image looks natural, retains exact facial features, has great clarity and no noise. As if taken right now with Canon EOS R6 Mark II', currentImage!, undefined, { model: 'gemini-3.1-flash-image-preview', imageConfig: { imageSize: '2K' } })} className="p-2 hover:bg-bg rounded-lg text-btn-text hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Restaurar">
                      <Camera size={18} />
                    </button>
                    <button disabled={isProcessing} onClick={() => handleCropAction(currentImage!)} className="p-2 hover:bg-bg rounded-lg text-btn-text hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Recortar">
                      <CropIcon size={18} />
                    </button>
                    <button disabled={isProcessing} onClick={() => startInteractiveMode(currentImage!)} className="p-2 hover:bg-bg rounded-lg text-btn-text hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Achicar y Agrandar">
                      <MoveDiagonal size={18} />
                    </button>
                    <div className="w-px bg-border my-1 mx-1"></div>
                    <button onClick={() => setShowOriginal(!showOriginal)} className={`p-2 hover:bg-bg rounded-lg transition-colors ${!showOriginal ? 'text-accent' : 'text-btn-text hover:text-accent'}`} title={showOriginal ? "Ocultar imagen original" : "Mostrar imagen original"}>
                      <ImageIcon size={18} />
                    </button>
                    <button disabled={isProcessing} onClick={handleRotateCurrent} className="p-2 hover:bg-bg rounded-lg text-btn-text hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Rotar 90°">
                      <RotateCcw size={18} />
                    </button>
                  </DraggableToolbar>
                  <div className="flex-1 w-full relative flex items-center justify-center bg-btn-bg/50 rounded-xl border-2 border-accent/20 overflow-hidden">
                    <div className="absolute top-1/2 -translate-y-1/2 right-4 flex flex-col bg-btn-bg/90 backdrop-blur rounded-lg shadow-md border-2 border-btn-border overflow-hidden z-20">
                      <button 
                        onClick={() => { 
                          if (previousImage) {
                            setHistory(prev => [...prev, { id: Date.now().toString(), image: currentImage!, action: pendingAction || 'Modificación' }]);
                            setPreviousImage(null); 
                            setPendingAction(null);
                          }
                        }} 
                        disabled={!previousImage}
                        className="flex items-center justify-center p-1.5 hover:bg-bg text-btn-text hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed" title="Aplicar cambios">
                        <Check size={14} />
                      </button>
                      <div className="h-px w-full bg-border"></div>
                      <button 
                        onClick={() => { 
                          if (previousImage) {
                            setCurrentImage(previousImage); 
                            setPreviousImage(null); 
                            setPendingAction(null);
                          }
                        }} 
                        disabled={!previousImage}
                        className="flex items-center justify-center p-1.5 hover:bg-bg text-btn-text hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed" title="Cancelar cambios">
                        <X size={14} />
                      </button>
                      <div className="h-px w-full bg-border"></div>
                      <button 
                        onClick={handleUndo} 
                        disabled={history.length <= 1 && !previousImage}
                        className="flex items-center justify-center p-1.5 hover:bg-bg text-btn-text disabled:opacity-50 disabled:cursor-not-allowed" title="Deshacer cambio">
                        <Undo2 size={14} />
                      </button>
                    </div>
                    <TransformWrapper
                      initialScale={1}
                      minScale={0.1}
                      maxScale={8}
                      centerOnInit={true}
                      wheel={{ step: 0.1 }}
                    >
                      {({ zoomIn, zoomOut, resetTransform, scale }) => (
                        <>
                          <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                            <img 
                              src={currentImage!} 
                              alt="Modificado" 
                              className="max-w-full max-h-full object-contain drop-shadow-xl pointer-events-none will-change-transform" 
                              referrerPolicy="no-referrer" 
                            />
                          </TransformComponent>
                          <div className="absolute bottom-2 right-2 flex bg-btn-bg/90 backdrop-blur rounded-lg shadow-md border-2 border-btn-border overflow-hidden z-10">
                            <button onClick={() => zoomOut()} className="p-1.5 hover:bg-bg text-btn-text"><ZoomOut size={14} /></button>
                            <div className="flex items-center justify-center px-2 text-xs font-bold text-text/80 min-w-[3rem] select-none">
                              {Math.round(scale * 100)}%
                            </div>
                            <button onClick={() => zoomIn()} className="p-1.5 hover:bg-bg text-btn-text"><ZoomIn size={14} /></button>
                            <div className="w-px bg-border"></div>
                            <button onClick={() => resetTransform()} className="p-1.5 hover:bg-bg text-btn-text"><Maximize size={14} /></button>
                          </div>
                        </>
                      )}
                    </TransformWrapper>
                  </div>
                </div>
              </div>
              </div>
            )}

            {isProcessing && (
              <div className="absolute inset-0 bg-panel backdrop-blur-sm flex flex-col items-center justify-center z-10">
                <Loader2 size={48} className="text-accent animate-spin mb-4" />
                <p className="text-text font-bold bg-btn-bg px-6 py-3 rounded-full shadow-lg border-2 border-border">
                  Procesando: {processingAction}...
                </p>
              </div>
            )}
          </div>

        </div>
        )}

        {/* RIGHT PANEL */}
        <div className="w-full lg:w-72 bg-panel backdrop-blur-xl border-2 border-border shadow-xl rounded-3xl p-6 flex flex-col gap-4 shrink-0">
          <div className="flex bg-panel p-1 rounded-xl border-2 border-border">
            <button 
              onClick={() => setRightTab('history')}
              className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${rightTab === 'history' ? 'bg-btn-bg text-text shadow-sm' : 'text-text/60 hover:text-btn-text'}`}
            >
              Historial
            </button>
            <button 
              onClick={() => setRightTab('similar')}
              className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${rightTab === 'similar' ? 'bg-btn-bg text-text shadow-sm' : 'text-text/60 hover:text-btn-text'}`}
            >
              Similares
            </button>
          </div>

          {rightTab === 'history' ? (
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-2 custom-scrollbar">
              {history.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-text/40 text-sm text-center px-4 font-medium">
                  Sube una imagen para ver el historial de cambios.
                </div>
              ) : (
                <>
                  {history.map((item, idx) => (
                    <div 
                      key={item.id} 
                      className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-3 ${idx === history.length - 1 && !previousImage ? 'border-accent bg-accent/10' : 'border-border bg-btn-bg hover:border-accent/50'}`}
                      onClick={() => revertToHistory(idx)}
                    >
                      <div className="w-12 h-12 rounded-lg bg-panel border-2 border-border overflow-hidden flex-shrink-0">
                        <img src={item.image} alt={item.action} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-text">{item.action}</span>
                        <span className="text-xs text-text/60">Paso {idx + 1}</span>
                      </div>
                      {idx === history.length - 1 && !previousImage && (
                        <div className="ml-auto w-2 h-2 rounded-full bg-accent"></div>
                      )}
                    </div>
                  ))}
                  {previousImage && (
                    <div className="p-3 rounded-xl border-2 border-dashed border-border bg-accent/10 flex items-center gap-3 opacity-70">
                      <div className="w-12 h-12 rounded-lg bg-panel border-2 border-border overflow-hidden flex-shrink-0">
                        <img src={currentImage!} alt="Pending" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-accent">{pendingAction || 'Modificación'}</span>
                        <span className="text-xs text-accent">Sin guardar</span>
                      </div>
                      <Loader2 size={14} className="ml-auto text-accent animate-spin" />
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <button 
                  onClick={findSimilarImages}
                  disabled={!currentImage || isProcessing}
                  className="flex-1 flex items-center justify-center gap-2 bg-btn-bg text-btn-text py-3 px-3 rounded-xl hover:bg-bg transition-all font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base border-2 border-btn-border overflow-hidden"
                  title="Generar similares con IA"
                >
                  <Search size={18} className="shrink-0" />
                  <span className="truncate">Internet (IA)</span>
                </button>
                <button 
                  onClick={() => similarFileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 bg-btn-bg text-btn-text py-3 px-3 rounded-xl hover:bg-bg transition-all font-bold shadow-sm text-sm sm:text-base border-2 border-btn-border overflow-hidden"
                  title="Cargar desde galería"
                >
                  <Upload size={18} className="shrink-0" />
                  <span className="truncate">Galería</span>
                </button>
                <input 
                  type="file" 
                  ref={similarFileInputRef} 
                  onChange={handleSimilarFileUpload} 
                  accept="image/*" 
                  multiple
                  className="hidden" 
                />
              </div>

              <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-2 custom-scrollbar">
                {similarImages.length > 0 ? (
                  similarImages.map((img, idx) => (
                    <div key={idx} className="bg-btn-bg p-2 rounded-xl shadow-sm border-2 border-border group relative cursor-pointer hover:border-accent transition-colors">
                      <img src={img} alt={`Similar ${idx}`} className="w-full h-40 object-cover rounded-lg" referrerPolicy="no-referrer" onClick={() => { setPreviousImage(currentImage); setCurrentImage(img); setPendingAction('Imagen Similar'); }} />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex flex-col items-center justify-center gap-2 pointer-events-none">
                        <button className="text-bg font-bold text-sm bg-black/60 px-4 py-2 rounded-full backdrop-blur-sm pointer-events-auto hover:bg-black/80 transition-colors" onClick={(e) => { e.stopPropagation(); setPreviousImage(currentImage); setCurrentImage(img); setPendingAction('Imagen Similar'); }}>Usar esta</button>
                        <button className="text-bg font-bold text-sm bg-accent/80 px-4 py-2 rounded-full backdrop-blur-sm pointer-events-auto hover:bg-accent transition-colors" onClick={(e) => { e.stopPropagation(); processImage('Transferir Pose', 'Transfer the pose, attitude, and facial expression from the original image to this image. Maintain the identity and style of this image but adopt the pose of the original.', img, originalImage!); }}>Transferir Pose</button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex-1 flex items-center justify-center text-text/40 text-sm text-center px-4 font-medium">
                    Haz clic en "Buscar Similares" para encontrar variaciones de tu imagen.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
