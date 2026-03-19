import React, { useState, useRef } from 'react';
import { Upload, Link as LinkIcon, Image as ImageIcon, Sparkles, Wand2, Scissors, Search, Download, Loader2, SlidersHorizontal, Check, Undo2, Trash2, ChevronDown, Maximize, MoveDiagonal, Aperture, ZoomIn, ZoomOut, Move, RotateCcw, Crop as CropIcon, Camera, Palette, Filter as FilterIcon, Rocket, Smile, Wind } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
// @ts-ignore
import ImageTracer from 'imagetracerjs';
import { jsPDF } from 'jspdf';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function ToolButton({ icon, label, onClick, disabled }: { icon: React.ReactNode, label: string, onClick: () => void, disabled: boolean }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 w-full bg-btn-bg text-text py-2 px-3 rounded-lg hover:bg-bg hover:shadow-md border-2 border-btn-border transition-all font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed group text-sm"
    >
      <div className="text-btn-text group-hover:text-accent transition-colors flex-shrink-0">
        {icon}
      </div>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

interface HistoryItem {
  id: string;
  image: string;
  action: string;
}

export default function App() {
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [previousImage, setPreviousImage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'history' | 'similar'>('history');
  
  const THEMES = ['slate', 'dark', 'blue', 'emerald', 'rose'];
  const [theme, setTheme] = useState('slate');
  const toggleTheme = () => {
    const nextIdx = (THEMES.indexOf(theme) + 1) % THEMES.length;
    setTheme(THEMES[nextIdx]);
  };
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [similarImages, setSimilarImages] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  
  const [isInteractiveMode, setIsInteractiveMode] = useState(false);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [isCropMode, setIsCropMode] = useState(false);
  const [isFilterMode, setIsFilterMode] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  
  const [naturalDims, setNaturalDims] = useState({ w: 0, h: 0 });
  const [visualDims, setVisualDims] = useState({ w: 0, h: 0 });
  const [initialVisualDims, setInitialVisualDims] = useState({ w: 0, h: 0 });
  
  const [viewZoom, setViewZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  const originalContainerRef = useRef<HTMLDivElement>(null);
  const modifiedContainerRef = useRef<HTMLDivElement>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'lumina-edit-image.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setShowDownloadMenu(false);
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
    };
    img.src = currentImage;
  };

  const handleDownloadSVG = () => {
    if (!currentImage) return;
    
    setIsProcessing(true);
    setProcessingAction('Generando SVG');
    setShowDownloadMenu(false);
    
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


  const startInteractiveMode = () => {
    if (!currentImage) return;
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
       setIsInteractiveMode(true);
    };
    img.src = currentImage;
  };

  const startCropMode = () => {
    if (!currentImage) return;
    setCrop(undefined);
    setCompletedCrop(null);
    setIsCropMode(true);
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
    setPreviousImage(currentImage);
    setCurrentImage(dataUrl);
    setPendingAction('recortar');
    setIsCropMode(false);
  };

  const startFilterMode = () => {
    if (!currentImage) return;
    setSelectedFilter('none');
    setIsFilterMode(true);
  };

  const applyFilter = () => {
    if (!currentImage) return;
    if (selectedFilter === 'none') {
      setIsFilterMode(false);
      return;
    }
    
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.filter = selectedFilter;
      ctx.drawImage(img, 0, 0);
      
      const dataUrl = canvas.toDataURL('image/png');
      setPreviousImage(currentImage);
      setCurrentImage(dataUrl);
      setPendingAction('Filtro');
      setIsFilterMode(false);
    };
    img.src = currentImage;
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

  const handleDragMouseDown = (e: React.MouseEvent) => {
     e.preventDefault();
     const startX = e.clientX;
     const startY = e.clientY;
     const startW = visualDims.w;
     const startH = visualDims.h;
     const ratio = startW / startH;
     
     const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        let newW = startW + deltaX;
        let newH = startH + deltaY;
        
        if (newW < 50) newW = 50;
        if (newH < 50) newH = 50;

        if (maintainAspectRatio) {
           newH = newW / ratio;
        }
        
        setVisualDims({ w: newW, h: newH });
     };
     
     const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
     };
     
     document.addEventListener('mousemove', onMouseMove);
     document.addEventListener('mouseup', onMouseUp);
  };

  const handleNewUpload = () => {
    setOriginalImage(null);
    setCurrentImage(null);
    setPreviousImage(null);
    setHistory([]);
    setSimilarImages([]);
    setUrlInput('');
    setPendingAction(null);
    setViewZoom(1);
    setIsCropMode(false);
    setCrop(undefined);
    setCompletedCrop(null);
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

  const handlePanStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isInteractiveMode || isCropMode || isFilterMode) return;
    setIsPanning(true);
    setPanStart({ 
      x: e.clientX + e.currentTarget.scrollLeft, 
      y: e.clientY + e.currentTarget.scrollTop 
    });
  };

  const handlePanMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || isInteractiveMode || isCropMode || isFilterMode) return;
    const newScrollLeft = panStart.x - e.clientX;
    const newScrollTop = panStart.y - e.clientY;
    
    e.currentTarget.scrollLeft = newScrollLeft;
    e.currentTarget.scrollTop = newScrollTop;
    
    if (e.currentTarget === originalContainerRef.current && modifiedContainerRef.current) {
       modifiedContainerRef.current.scrollLeft = newScrollLeft;
       modifiedContainerRef.current.scrollTop = newScrollTop;
    } else if (e.currentTarget === modifiedContainerRef.current && originalContainerRef.current) {
       originalContainerRef.current.scrollLeft = newScrollLeft;
       originalContainerRef.current.scrollTop = newScrollTop;
    }
  };

  const handlePanEnd = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isInteractiveMode || isCropMode || isFilterMode) return;
    const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
    setViewZoom(prev => Math.max(0.1, Math.min(5, prev + zoomDelta)));
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

  const processImage = async (action: string, prompt: string) => {
    if (!currentImage) return;
    
    setIsProcessing(true);
    setProcessingAction(action);
    
    try {
      const { base64Data, mimeType } = await getBase64Data(currentImage);

      const response = await ai.models.generateContent({
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
              text: prompt,
            },
          ],
        },
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
      
      // Generate 2 variations in parallel
      const promises = Array(2).fill(0).map((_, i) => {
        return ai.models.generateContent({
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
      alert(error.message || "Hubo un error al buscar imágenes similares.");
    } finally {
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg relative overflow-auto font-sans text-text flex" data-theme={theme === 'slate' ? undefined : theme}>
      {/* Background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-blob"></div>
      <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-purple-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-[40%] h-[40%] bg-emerald-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-blob animation-delay-4000"></div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col lg:flex-row w-full min-h-screen p-4 lg:p-6 gap-4 lg:gap-6 overflow-auto">
        
        {/* LEFT PANEL: Upload & Tools */}
        <div className="w-full lg:w-80 flex flex-col gap-4 lg:gap-6 shrink-0">
          {/* Logo / Theme Button */}
          <button 
            onClick={toggleTheme}
            className="w-full py-6 px-4 rounded-3xl bg-transparent hover:bg-white/20 transition-all flex flex-col items-center justify-center gap-3 border-2 border-transparent hover:border-white/30 group"
          >
            <div className="relative flex items-center justify-center group-hover:scale-110 transition-transform duration-300 w-24 h-24">
              {/* Speed lines */}
              <Wind size={36} className="text-slate-400 absolute left-[-15px] bottom-0 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-4 group-hover:-translate-x-6" />
              
              {/* Rocket */}
              <Rocket size={64} className="text-accent transform rotate-12 group-hover:translate-x-3 group-hover:-translate-y-3 transition-transform duration-300 z-10" strokeWidth={1.5} />
              
              {/* Anthropomorphized Photo (Riding the rocket) */}
              <div className="absolute top-0 left-4 transform -translate-x-2 -translate-y-2 rotate-[-15deg] group-hover:translate-x-1 group-hover:-translate-y-5 transition-transform duration-300 z-20">
                <div className="relative bg-white rounded-lg p-1 shadow-xl border-2 border-primary flex items-center justify-center">
                  <ImageIcon size={28} className="text-primary" />
                  <Smile size={16} className="text-accent absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-full" strokeWidth={2.5} />
                </div>
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-black tracking-tighter text-text">
                RApiFotitoS
              </h1>
              <p className="text-sm font-bold text-text/70 mt-1">
                hace tus fotos geniales
              </p>
            </div>
          </button>

          {/* Upload Section */}
          <div className="bg-panel backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col gap-4">
            <h2 className="text-lg font-bold tracking-tight text-text">Cargar Imagen</h2>
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 w-full bg-primary text-white py-3 px-4 rounded-xl hover:bg-primary-hover border-2 border-btn-border transition-all font-semibold shadow-md"
            >
              <Upload size={18} />
              <span>Desde el PC</span>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />

            <div className="relative flex items-center">
              <div className="flex-grow border-t border-slate-300"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-sm font-medium">O</span>
              <div className="flex-grow border-t border-slate-300"></div>
            </div>

            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="URL de la imagen..." 
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 bg-btn-bg/80 border-2 border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <button 
                onClick={handleUrlUpload}
                className="bg-primary text-white p-2 rounded-xl hover:bg-primary-hover border-2 border-btn-border transition-all shadow-md"
              >
                <LinkIcon size={18} />
              </button>
            </div>
          </div>

          {/* Tools Section */}
          <div className="bg-panel backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl p-4 flex-1 flex flex-col gap-3 overflow-hidden min-h-[300px] lg:min-h-0">
            <h2 className="text-base font-bold tracking-tight text-text shrink-0">Herramientas</h2>
            
            <div className="flex-1 overflow-auto custom-scrollbar pr-2 pb-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2 min-w-max lg:min-w-0">
                <ToolButton 
                  icon={<Scissors size={16} />} 
                  label="Eliminar Fondo" 
                  onClick={() => processImage('Eliminar Fondo', 'Remove the background of this image, leaving only the main subject on a pure white background.')}
                  disabled={!currentImage || isProcessing}
                />
                <ToolButton 
                  icon={<Wand2 size={16} />} 
                  label="Vectorizar" 
                  onClick={() => processImage('Vectorizar', 'Convert this image into a clean, scalable vector art style with flat colors and crisp edges.')}
                  disabled={!currentImage || isProcessing}
                />
                <ToolButton 
                  icon={<Sparkles size={16} />} 
                  label="Aumentar Calidad" 
                  onClick={() => processImage('Aumentar Calidad', 'Upscale and enhance the quality of this photo, make it high resolution, sharp, and detailed.')}
                  disabled={!currentImage || isProcessing}
                />
                <ToolButton 
                  icon={<SlidersHorizontal size={16} />} 
                  label="Optimizar Foto" 
                  onClick={() => processImage('Optimizar Foto', 'Fix the lighting, reduce noise, color correct, and optimize this poorly taken photo to look professional and clear.')}
                  disabled={!currentImage || isProcessing}
                />
                <ToolButton 
                  icon={<Aperture size={16} />} 
                  label="Efecto de Estudio" 
                  onClick={() => processImage('Efecto de Estudio', 'Enhance this photo with professional studio lighting, cinematic color grading, and sharp details. Do NOT add, remove, or alter any objects, people, or the background composition. Keep the exact same content, just improve the lighting, contrast, and photographic quality.')}
                  disabled={!currentImage || isProcessing}
                />
                <ToolButton 
                  icon={<Camera size={16} />} 
                  label="RECONSTRUIR (nivel bajo)" 
                  onClick={() => processImage('RECONSTRUIR (nivel bajo)', 'Restore this old photo into a professional portrait of DSLR-quality colour and detail, using an advanced upscaling algorithm comparable to the results from the Canon EOS R6 Mark II. Ensure the restored image looks natural, retains exact facial features, has great clarity and no noise. As if taken right now with Canon EOS R6 Mark II')}
                  disabled={!currentImage || isProcessing}
                />
                <ToolButton 
                  icon={<MoveDiagonal size={16} />} 
                  label="Achicar y Agrandar" 
                  onClick={startInteractiveMode}
                  disabled={!currentImage || isProcessing || isInteractiveMode || isCropMode || isFilterMode}
                />
                <ToolButton 
                  icon={<CropIcon size={16} />} 
                  label="Recortar" 
                  onClick={startCropMode}
                  disabled={!currentImage || isProcessing || isInteractiveMode || isCropMode || isFilterMode}
                />
                <ToolButton 
                  icon={<FilterIcon size={16} />} 
                  label="Filtros" 
                  onClick={startFilterMode}
                  disabled={!currentImage || isProcessing || isInteractiveMode || isCropMode || isFilterMode}
                />
              </div>
            </div>
          </div>
        </div>

        {/* CENTER PANEL: Canvas */}
        <div className="flex-1 bg-panel backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl p-4 lg:p-6 flex flex-col relative overflow-auto min-h-[500px] lg:min-h-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 sm:gap-0">
            <h2 className="text-xl font-bold tracking-tight text-text">Lienzo Principal</h2>
            {currentImage && (
              <div className="flex flex-wrap items-center gap-2">
                <button 
                  onClick={handleNewUpload}
                  className="flex items-center gap-2 text-sm font-bold bg-btn-bg text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-xl border-2 border-btn-border shadow-sm transition-all"
                  title="Limpiar lienzo y empezar de nuevo"
                >
                  <Trash2 size={16} /> Nueva Carga
                </button>
                <button 
                  onClick={handleUndo}
                  disabled={history.length <= 1 && !previousImage}
                  className="flex items-center gap-2 text-sm font-bold bg-btn-bg text-btn-text hover:bg-bg px-3 py-2 rounded-xl border-2 border-btn-border shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Volver atrás de una modificación"
                >
                  <Undo2 size={16} /> Volver Atrás
                </button>
                <div className="relative">
                  <button 
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                    className="flex items-center gap-2 text-sm font-bold bg-accent text-white hover:bg-blue-700 px-3 py-2 rounded-xl border-2 border-btn-border shadow-sm transition-all"
                  >
                    <Download size={16} /> Descargar <ChevronDown size={14} />
                  </button>
                  {showDownloadMenu && (
                    <div className="absolute right-0 mt-2 w-32 bg-btn-bg rounded-xl shadow-lg border border-border overflow-hidden z-20">
                      <button onClick={handleDownloadJPG} className="block w-full text-left px-4 py-2 hover:bg-bg text-sm font-medium text-btn-text border-b border-slate-100">JPG</button>
                      <button onClick={handleDownloadPNG} className="block w-full text-left px-4 py-2 hover:bg-bg text-sm font-medium text-btn-text border-b border-slate-100">PNG</button>
                      <button onClick={handleDownloadPDF} className="block w-full text-left px-4 py-2 hover:bg-bg text-sm font-medium text-btn-text border-b border-slate-100">PDF</button>
                      <button onClick={handleDownloadSVG} className="block w-full text-left px-4 py-2 hover:bg-bg text-sm font-medium text-emerald-600">SVG (Vector)</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="flex-1 bg-slate-100/50 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col relative overflow-hidden">
            {isInteractiveMode ? (
              <>
                <div className="absolute top-4 right-4 flex gap-2 z-20">
                   <button onClick={() => setIsInteractiveMode(false)} className="px-4 py-2 bg-btn-bg text-btn-text rounded-xl shadow-sm font-bold hover:bg-bg border-2 border-btn-border">Cancelar</button>
                   <button onClick={applyInteractiveScale} className="px-4 py-2 bg-accent text-white rounded-xl shadow-sm font-bold hover:bg-blue-700 border-2 border-btn-border">Aplicar</button>
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
                    <div className="absolute top-4 left-4 z-20 bg-btn-bg/90 backdrop-blur p-4 rounded-2xl shadow-lg border border-border flex flex-col gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                          <label className="text-xs font-bold text-slate-500 uppercase mb-1">Ancho (px)</label>
                          <input type="number" value={finalW} onChange={handleWidthChange} className="w-24 bg-btn-bg border-2 border-border rounded-xl px-3 py-1.5 text-sm font-mono font-bold text-btn-text focus:outline-none focus:border-blue-500 transition-colors" />
                        </div>
                        <div className="flex flex-col">
                          <label className="text-xs font-bold text-slate-500 uppercase mb-1">Alto (px)</label>
                          <input type="number" value={finalH} onChange={handleHeightChange} className="w-24 bg-btn-bg border-2 border-border rounded-xl px-3 py-1.5 text-sm font-mono font-bold text-btn-text focus:outline-none focus:border-blue-500 transition-colors" />
                        </div>
                        <div className="flex flex-col">
                          <label className="text-xs font-bold text-slate-500 uppercase mb-1">Escala (%)</label>
                          <input type="number" value={Math.round(scaleFactorW * 100)} onChange={handlePercentChange} className="w-24 bg-btn-bg border-2 border-border rounded-xl px-3 py-1.5 text-sm font-mono font-bold text-btn-text focus:outline-none focus:border-blue-500 transition-colors" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer mt-1">
                        <input 
                          type="checkbox" 
                          checked={maintainAspectRatio} 
                          onChange={(e) => setMaintainAspectRatio(e.target.checked)}
                          className="w-4 h-4 text-accent rounded border-slate-300 focus:ring-blue-500"
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
                       className="absolute -bottom-3 -right-3 w-8 h-8 bg-accent rounded-full border-4 border-white shadow-lg cursor-se-resize flex items-center justify-center hover:scale-110 transition-transform z-20"
                     >
                       <MoveDiagonal size={14} className="text-white" />
                     </div>
                     
                     {/* Border highlight */}
                     <div className="absolute inset-0 border-2 border-blue-500/50 rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                </div>
              </div>
              </>
            ) : isCropMode ? (
              <>
                <div className="absolute top-4 right-4 flex gap-2 z-20">
                   <button onClick={() => setIsCropMode(false)} className="px-4 py-2 bg-btn-bg text-btn-text rounded-xl shadow-sm font-bold hover:bg-bg border-2 border-btn-border">Cancelar</button>
                   <button onClick={applyCrop} className="px-4 py-2 bg-accent text-white rounded-xl shadow-sm font-bold hover:bg-blue-700 border-2 border-btn-border">Aplicar</button>
                </div>
                <div className="w-full h-full overflow-auto custom-scrollbar p-4">
                  <div className="w-max h-max min-w-full min-h-full flex flex-col relative p-8">
                    <div className="flex-1 w-full relative flex overflow-hidden p-8 mt-12">
                      <ReactCrop 
                        crop={crop} 
                        onChange={c => setCrop(c)} 
                        onComplete={c => setCompletedCrop(c)}
                        className="max-w-full max-h-full m-auto"
                      >
                        <img 
                          ref={imgRef}
                          src={currentImage!} 
                          className="max-w-full max-h-full object-contain shadow-md rounded-lg" 
                          alt="Crop" 
                          crossOrigin="anonymous"
                        />
                      </ReactCrop>
                    </div>
                  </div>
                </div>
              </>
            ) : isFilterMode ? (
              <>
                <div className="absolute top-4 right-4 flex gap-2 z-20">
                   <button onClick={() => setIsFilterMode(false)} className="px-4 py-2 bg-btn-bg text-btn-text rounded-xl shadow-sm font-bold hover:bg-bg border-2 border-btn-border">Cancelar</button>
                   <button onClick={applyFilter} className="px-4 py-2 bg-accent text-white rounded-xl shadow-sm font-bold hover:bg-blue-700 border-2 border-btn-border">Aplicar</button>
                </div>
                <div className="w-full h-full overflow-auto custom-scrollbar p-4 flex flex-col">
                  <div className="flex-1 relative flex items-center justify-center p-4 min-h-[300px]">
                    <img 
                      src={currentImage!} 
                      className="max-w-full max-h-full object-contain shadow-md rounded-lg transition-all duration-300" 
                      style={{ filter: selectedFilter === 'none' ? 'none' : selectedFilter }}
                      alt="Filter Preview" 
                    />
                  </div>
                  <div className="w-full bg-panel backdrop-blur-xl border border-white/40 shadow-xl rounded-2xl p-4 mt-4 overflow-x-auto custom-scrollbar">
                    <div className="flex gap-3 min-w-max pb-2">
                      {[
                        { id: 'none', name: 'Normal' },
                        { id: 'contrast(1.2) saturate(1.35)', name: 'Clarendon' },
                        { id: 'sepia(0.3) contrast(0.9) saturate(0.8) brightness(1.05)', name: 'Gingham' },
                        { id: 'saturate(1.4) contrast(1.1) sepia(0.2) hue-rotate(-10deg)', name: 'Juno' },
                        { id: 'brightness(1.1) contrast(0.9) saturate(1.05)', name: 'Retrato' },
                        { id: 'contrast(1.3) saturate(1.2) brightness(0.9)', name: 'Polarizador' },
                        { id: 'brightness(0.6)', name: 'Filtro ND' }
                      ].map(f => (
                        <button
                          key={f.name}
                          onClick={() => setSelectedFilter(f.id)}
                          className={`flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all ${selectedFilter === f.id ? 'border-accent bg-blue-50/50' : 'border-transparent hover:bg-bg'}`}
                        >
                          <div className="w-16 h-16 rounded-lg overflow-hidden border border-border">
                            <img src={currentImage!} style={{ filter: f.id === 'none' ? 'none' : f.id }} className="w-full h-full object-cover" alt={f.name} />
                          </div>
                          <span className="text-xs font-bold text-text">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : !originalImage ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-3 p-4">
                <ImageIcon size={48} className="opacity-50" />
                <p className="font-medium">Sube una imagen para comenzar</p>
              </div>
            ) : (
              <div className="w-full h-full overflow-auto custom-scrollbar p-4">
                <div className="flex flex-col md:flex-row w-full h-full gap-4">
                <div className="flex-1 flex flex-col items-center gap-3 min-h-[300px] md:min-h-0">
                  <span className="font-bold text-slate-500 bg-btn-bg px-4 py-1.5 rounded-full shadow-sm text-sm border border-border">Original</span>
                  <div 
                    ref={originalContainerRef}
                    className={`flex-1 w-full relative flex items-start justify-start bg-btn-bg/50 rounded-xl border border-border overflow-auto custom-scrollbar p-2 ${isInteractiveMode ? '' : 'cursor-grab active:cursor-grabbing'}`}
                    onMouseDown={handlePanStart}
                    onMouseMove={handlePanMove}
                    onMouseUp={handlePanEnd}
                    onMouseLeave={handlePanEnd}
                    onWheel={handleWheel}
                  >
                    <div 
                      className="flex items-center justify-center min-w-full min-h-full"
                      style={{ 
                        width: `${viewZoom * 100}%`, 
                        height: `${viewZoom * 100}%`,
                        transition: isPanning ? 'none' : 'width 0.1s, height 0.1s ease-out'
                      }}
                    >
                      <img 
                        src={originalImage} 
                        alt="Original" 
                        className="max-w-full max-h-full object-contain drop-shadow-md pointer-events-none" 
                        referrerPolicy="no-referrer" 
                      />
                    </div>
                    
                    {/* View Controls Toolbar */}
                    <div className="absolute bottom-2 right-2 flex bg-btn-bg/90 backdrop-blur rounded-xl shadow-md border-2 border-btn-border overflow-hidden z-10 cursor-default" onMouseDown={(e) => e.stopPropagation()}>
                      <button onClick={() => setViewZoom(z => Math.max(0.1, z - 0.2))} className="p-1.5 hover:bg-bg text-btn-text" title="Achicar vista"><ZoomOut size={16} /></button>
                      <div className="flex items-center justify-center px-1 text-xs font-medium text-slate-600 min-w-[3rem] select-none">
                        {Math.round(viewZoom * 100)}%
                      </div>
                      <button onClick={() => setViewZoom(z => Math.min(5, z + 0.2))} className="p-1.5 hover:bg-bg text-btn-text" title="Agrandar vista"><ZoomIn size={16} /></button>
                      <div className="w-px bg-slate-200"></div>
                      <button onClick={() => { setViewZoom(1); if(originalContainerRef.current) { originalContainerRef.current.scrollLeft = 0; originalContainerRef.current.scrollTop = 0; } }} className="p-1.5 hover:bg-bg text-btn-text" title="Centrar y restaurar vista"><Move size={16} /></button>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-center gap-3 min-h-[300px] md:min-h-0">
                  <span className="font-bold text-accent bg-blue-50 px-4 py-1.5 rounded-full shadow-sm text-sm border border-blue-200">
                    {previousImage ? "Modificado (Vista Previa)" : "Modificado"}
                  </span>
                  <div 
                    ref={modifiedContainerRef}
                    className={`flex-1 w-full relative flex items-start justify-start bg-btn-bg/50 rounded-xl border border-blue-200 overflow-auto custom-scrollbar p-2 ${isInteractiveMode ? '' : 'cursor-grab active:cursor-grabbing'}`}
                    onMouseDown={handlePanStart}
                    onMouseMove={handlePanMove}
                    onMouseUp={handlePanEnd}
                    onMouseLeave={handlePanEnd}
                    onWheel={handleWheel}
                  >
                    <div 
                      className="flex items-center justify-center min-w-full min-h-full"
                      style={{ 
                        width: `${viewZoom * 100}%`, 
                        height: `${viewZoom * 100}%`,
                        transition: isPanning ? 'none' : 'width 0.1s, height 0.1s ease-out'
                      }}
                    >
                      <img 
                        src={currentImage!} 
                        alt="Modificado" 
                        className="max-w-full max-h-full object-contain drop-shadow-xl pointer-events-none" 
                        referrerPolicy="no-referrer" 
                      />
                    </div>
                    
                    {/* View Controls Toolbar */}
                    <div className="absolute bottom-2 right-2 flex bg-btn-bg/90 backdrop-blur rounded-xl shadow-md border-2 border-btn-border overflow-hidden z-10 cursor-default" onMouseDown={(e) => e.stopPropagation()}>
                      <button onClick={() => setViewZoom(z => Math.max(0.1, z - 0.2))} className="p-1.5 hover:bg-bg text-btn-text" title="Achicar vista"><ZoomOut size={16} /></button>
                      <div className="flex items-center justify-center px-1 text-xs font-medium text-slate-600 min-w-[3rem] select-none">
                        {Math.round(viewZoom * 100)}%
                      </div>
                      <button onClick={() => setViewZoom(z => Math.min(5, z + 0.2))} className="p-1.5 hover:bg-bg text-btn-text" title="Agrandar vista"><ZoomIn size={16} /></button>
                      <div className="w-px bg-slate-200"></div>
                      <button onClick={() => { setViewZoom(1); if(modifiedContainerRef.current) { modifiedContainerRef.current.scrollLeft = 0; modifiedContainerRef.current.scrollTop = 0; } }} className="p-1.5 hover:bg-bg text-btn-text" title="Centrar y restaurar vista"><Move size={16} /></button>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            )}

            {isProcessing && (
              <div className="absolute inset-0 bg-panel backdrop-blur-sm flex flex-col items-center justify-center z-10">
                <Loader2 size={48} className="text-accent animate-spin mb-4" />
                <p className="text-text font-bold bg-btn-bg px-6 py-3 rounded-full shadow-lg border border-slate-100">
                  Procesando: {processingAction}...
                </p>
              </div>
            )}
          </div>

          {previousImage && !isProcessing && (
            <div className="flex justify-center gap-4 mt-4">
              <button 
                onClick={() => { setCurrentImage(previousImage); setPreviousImage(null); setPendingAction(null); }} 
                className="flex items-center gap-2 px-5 py-2.5 bg-btn-bg border-2 border-btn-border text-btn-text rounded-xl hover:bg-bg font-bold transition-all shadow-sm"
              >
                <Undo2 size={18} /> Deshacer
              </button>
              <button 
                onClick={() => { 
                  setHistory(prev => [...prev, { id: Date.now().toString(), image: currentImage!, action: pendingAction || 'Modificación' }]);
                  setPreviousImage(null); 
                  setPendingAction(null);
                }} 
                className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl hover:bg-blue-700 font-bold shadow-md transition-all border-2 border-btn-border"
              >
                <Check size={18} /> Aceptar Cambios
              </button>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="w-full lg:w-80 bg-panel backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col gap-4 shrink-0">
          <div className="flex bg-slate-200/50 p-1 rounded-xl">
            <button 
              onClick={() => setRightTab('history')}
              className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${rightTab === 'history' ? 'bg-btn-bg text-text shadow-sm' : 'text-slate-500 hover:text-btn-text'}`}
            >
              Historial
            </button>
            <button 
              onClick={() => setRightTab('similar')}
              className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${rightTab === 'similar' ? 'bg-btn-bg text-text shadow-sm' : 'text-slate-500 hover:text-btn-text'}`}
            >
              Similares
            </button>
          </div>

          {rightTab === 'history' ? (
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-2 custom-scrollbar">
              {history.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm text-center px-4 font-medium">
                  Sube una imagen para ver el historial de cambios.
                </div>
              ) : (
                <>
                  {history.map((item, idx) => (
                    <div 
                      key={item.id} 
                      className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-3 ${idx === history.length - 1 && !previousImage ? 'border-blue-500 bg-blue-50' : 'border-border bg-btn-bg hover:border-blue-300'}`}
                      onClick={() => revertToHistory(idx)}
                    >
                      <div className="w-12 h-12 rounded-lg bg-slate-100 border border-border overflow-hidden flex-shrink-0">
                        <img src={item.image} alt={item.action} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-text">{item.action}</span>
                        <span className="text-xs text-slate-500">Paso {idx + 1}</span>
                      </div>
                      {idx === history.length - 1 && !previousImage && (
                        <div className="ml-auto w-2 h-2 rounded-full bg-accent"></div>
                      )}
                    </div>
                  ))}
                  {previousImage && (
                    <div className="p-3 rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/50 flex items-center gap-3 opacity-70">
                      <div className="w-12 h-12 rounded-lg bg-slate-100 border border-border overflow-hidden flex-shrink-0">
                        <img src={currentImage!} alt="Pending" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-blue-800">{pendingAction || 'Modificación'}</span>
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
                  className="flex-1 flex items-center justify-center gap-2 bg-accent text-white py-2.5 px-2 rounded-xl hover:bg-blue-700 transition-all font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed text-sm border-2 border-btn-border"
                  title="Generar similares con IA"
                >
                  <Search size={16} />
                  <span>Internet (IA)</span>
                </button>
                <button 
                  onClick={() => similarFileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 px-2 rounded-xl hover:bg-primary-hover transition-all font-semibold shadow-md text-sm border-2 border-btn-border"
                  title="Cargar desde tu PC"
                >
                  <Upload size={16} />
                  <span>Mi PC</span>
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
                    <div key={idx} className="bg-btn-bg p-2 rounded-xl shadow-sm border border-border group relative cursor-pointer hover:border-blue-400 transition-colors" onClick={() => { setPreviousImage(currentImage); setCurrentImage(img); setPendingAction('Imagen Similar'); }}>
                      <img src={img} alt={`Similar ${idx}`} className="w-full h-40 object-cover rounded-lg" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                        <span className="text-white font-bold text-sm bg-black/60 px-4 py-2 rounded-full backdrop-blur-sm">Usar esta</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-400 text-sm text-center px-4 font-medium">
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
