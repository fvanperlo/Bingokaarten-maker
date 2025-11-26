import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BingoItem, BingoCardData, GeneratorStatus, SubjectContext } from './types';
import { generateBingoItems, detectSubject } from './services/geminiService';
import { BingoCard } from './components/BingoCard';
import { MathDisplay } from './components/MathDisplay';
import { Loader2, RefreshCw, LayoutGrid, ListChecks, Sparkles, Image as ImageIcon, X, Settings2, Calculator, Check, Palette, Printer } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<GeneratorStatus>(GeneratorStatus.IDLE);
  const [items, setItems] = useState<BingoItem[]>([]);
  const [cards, setCards] = useState<BingoCardData[]>([]);
  
  // Context
  const [subjectContext, setSubjectContext] = useState<SubjectContext>({ subject: '', isMath: false });
  const [tempSubjectName, setTempSubjectName] = useState('');

  // Grid Settings
  const [gridRows, setGridRows] = useState<number>(3);
  const [gridCols, setGridCols] = useState<number>(3);
  
  const [cardCount, setCardCount] = useState<number>(30);
  const [poolSize, setPoolSize] = useState<number>(13);
  const [minPoolSize, setMinPoolSize] = useState<number>(9);
  
  const [topic, setTopic] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [generationMode, setGenerationMode] = useState<'similar' | 'exact'>('similar');
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0); // 0 to 100
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Combinatorics Helpers ---
  const getCombinations = (n: number, r: number): number => {
    if (r > n) return 0;
    if (r === 0 || r === n) return 1;
    if (r > n / 2) r = n - r; 
    let res = 1;
    for (let i = 1; i <= r; i++) {
        res = res * (n - i + 1) / i;
    }
    return Math.round(res);
  };

  const getItemsPerCard = useCallback(() => {
    // Return total cells, no free space subtraction
    return gridRows * gridCols;
  }, [gridRows, gridCols]);

  useEffect(() => {
    const itemsPerCard = getItemsPerCard();
    let calculatedMinPool = itemsPerCard;
    while (true) {
      const combinations = getCombinations(calculatedMinPool, itemsPerCard);
      if (combinations >= cardCount) {
        break;
      }
      calculatedMinPool++;
      if (calculatedMinPool > 100) break;
    }
    const suggestedMin = Math.max(calculatedMinPool, itemsPerCard + 1);
    setMinPoolSize(suggestedMin);
    setPoolSize(suggestedMin); 
  }, [cardCount, getItemsPerCard]);


  // --- Logic ---

  const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const generateCards = useCallback((pool: BingoItem[], count: number) => {
    const newCards: BingoCardData[] = [];
    const itemsNeededPerCard = gridRows * gridCols;

    for (let i = 1; i <= count; i++) {
      const shuffled = shuffleArray(pool);
      if (shuffled.length < itemsNeededPerCard) {
        console.error("Not enough items to fill a card!");
        return;
      }
      // Fill the card completely with items (no free space)
      const selectedItems = shuffled.slice(0, itemsNeededPerCard);
      newCards.push({ id: i, cells: selectedItems });
    }
    setCards(newCards);
  }, [gridRows, gridCols]);

  // Step 1: Detect Subject
  const handleStartGeneration = async () => {
    if (!topic && !selectedImage) {
        alert("Voer een onderwerp in of upload een afbeelding.");
        return;
    }
    setStatus(GeneratorStatus.DETECTING);
    try {
      const context = await detectSubject(topic, selectedImage);
      setSubjectContext(context);
      setTempSubjectName(context.subject);
      setStatus(GeneratorStatus.CONFIRMING);
    } catch (e) {
      console.error(e);
      setStatus(GeneratorStatus.ERROR);
    }
  };

  // Step 2: Confirm & Generate
  const handleConfirmAndGenerate = async () => {
    // Update context with potentially edited name
    const finalContext = { ...subjectContext, subject: tempSubjectName };
    setSubjectContext(finalContext);
    
    setStatus(GeneratorStatus.GENERATING);
    try {
      const pool = await generateBingoItems(finalContext, topic, poolSize, selectedImage, generationMode);
      setItems(pool);
      generateCards(pool, cardCount);
      setStatus(GeneratorStatus.SUCCESS);
    } catch (e) {
      console.error(e);
      setStatus(GeneratorStatus.ERROR);
    }
  };

  const handleRegenerateCardsOnly = () => {
    if (items.length > 0) {
      generateCards(items, cardCount);
    }
  };

  // --- Optimized PDF Generation ---

  const generateNativePDF = (doc: any) => {
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;
    const cardWidth = 90;
    const gap = 10;
    const cols = gridCols;
    const rows = gridRows;
    
    // Calculate cell size to keep aspect ratio 1:1 roughly
    const cellWidth = cardWidth / cols;
    const cellHeight = cellWidth; // Square cells
    const headerHeight = 8;
    const totalCardHeight = (rows * cellHeight) + headerHeight;

    let cursorY = 30; // Start below title on page 1
    
    // Title Page 1
    doc.setFontSize(24);
    doc.setTextColor(49, 46, 129); // indigo-900
    doc.setFont("helvetica", "bold");
    doc.text(`Bingo: ${subjectContext.subject}`, pageWidth / 2, 20, { align: 'center' });

    cards.forEach((card, index) => {
        const colIndex = index % 2;
        
        // Pagination logic
        if (colIndex === 0) {
            // Check if fit in page
            if (cursorY + totalCardHeight > pageHeight - margin) {
                doc.addPage();
                cursorY = margin + 10;
            }
        }
        
        const x = margin + (colIndex * (cardWidth + gap));
        const y = cursorY;

        // Draw Card Header
        doc.setFillColor(79, 70, 229); // Indigo 600
        doc.rect(x, y, cardWidth, headerHeight, 'F');
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.rect(x, y, cardWidth, headerHeight); 
        
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.text(`BINGO KAART #${card.id}`, x + (cardWidth/2), y + 5.5, { align: 'center' });

        // Draw Grid
        const gridStartY = y + headerHeight;
        
        // Draw Outer Border
        doc.setDrawColor(0);
        doc.rect(x, gridStartY, cardWidth, rows * cellHeight);

        for(let r=0; r<rows; r++) {
            for(let c=0; c<cols; c++) {
                const cellIndex = (r * cols) + c;
                if (cellIndex >= card.cells.length) continue;
                
                const cellX = x + (c * cellWidth);
                const cellY = gridStartY + (r * cellHeight);
                const item = card.cells[cellIndex];
                
                // Cell Border
                doc.rect(cellX, cellY, cellWidth, cellHeight);
                
                // Content
                const centerX = cellX + (cellWidth/2);
                const centerY = cellY + (cellHeight/2);
                
                if (item === 'GRATIS') {
                   doc.setFontSize(8);
                   doc.setTextColor(150);
                   doc.text("GRATIS", centerX, centerY, { align: 'center', baseline: 'middle' });
                } else {
                   const answer = (item as BingoItem).answer;
                   // Simple dynamic font sizing
                   let fontSize = 11;
                   if (answer.length > 10) fontSize = 9;
                   if (answer.length > 20) fontSize = 8;

                   doc.setFontSize(fontSize);
                   doc.setTextColor(0);
                   
                   const maxLineWidth = cellWidth - 4;
                   // Split text
                   const lines = doc.splitTextToSize(answer, maxLineWidth);
                   
                   // Manual vertical centering for multiline
                   const lineHeight = fontSize * 0.3527 * 1.2; // mm approx
                   const blockHeight = lines.length * lineHeight;
                   const textStartY = centerY - (blockHeight/2) + (lineHeight/1.5);

                   doc.text(lines, centerX, textStartY, { align: 'center' });
                }
            }
        }

        // Advance cursor
        if (colIndex === 1 || index === cards.length - 1) {
            cursorY += totalCardHeight + 10;
        }
    });
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    // Yield to UI to show the progress bar immediately
    await new Promise(resolve => setTimeout(resolve, 10)); 
    
    try {
      // @ts-ignore
      const { jsPDF } = window.jspdf;
      // @ts-ignore
      const html2canvas = window.html2canvas;

      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // --- STRATEGY SELECTION ---
      // If NOT Math mode, use Native PDF generation (Fast!)
      // If Math mode, we must use html2canvas (Slow, but necessary for rendering formulas)
      
      if (!subjectContext.isMath) {
         generateNativePDF(pdf);
         setDownloadProgress(80);
      } else {
          // --- Fallback to Image Capture for Math ---
          const pageWidth = 210;
          const pageHeight = 297;
          const margin = 10;
          
          const cardWidth = 90; 
          const cardGap = 10;

          pdf.setFontSize(22);
          pdf.setTextColor(49, 46, 129);
          pdf.text(`Bingo: ${subjectContext.subject}`, pageWidth / 2, 20, { align: 'center' });
          
          let cursorY = 30;
          let cursorX = margin;
          
          const cardElements = document.querySelectorAll('.bingo-card-export');
          const totalCards = cardElements.length;
          
          for (let i = 0; i < totalCards; i++) {
            // Update progress
            setDownloadProgress(Math.round(((i) / totalCards) * 80));
            // Crucial: Yield to the main thread so React can re-render the progress bar
            await new Promise(r => setTimeout(r, 1));

            const cardEl = cardElements[i] as HTMLElement;
            
            const canvas = await html2canvas(cardEl, { 
              scale: 1.5, 
              useCORS: true,
              logging: false
            });
            
            const imgData = canvas.toDataURL('image/jpeg', 0.85);
            const imgWidth = cardWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            const colIndex = i % 2;
            
            if (colIndex === 0 && cursorY + imgHeight > pageHeight - margin) {
                pdf.addPage();
                cursorY = margin + 10;
            }
            cursorX = margin + (colIndex * (cardWidth + cardGap));
            pdf.addImage(imgData, 'JPEG', cursorX, cursorY, imgWidth, imgHeight);
            
            if (colIndex === 1 || i === totalCards - 1) {
              cursorY += imgHeight + 10;
            }
          }
      }
      
      // --- Calling List (Common for both) ---
      setDownloadProgress(90);
      await new Promise(r => setTimeout(r, 10)); // Yield

      pdf.addPage();
      
      const listElement = document.getElementById('calling-list-export');
      if (listElement) {
        const listCanvas = await html2canvas(listElement, { scale: 1.5, useCORS: true });
        const contentWidth = 190;
        const pageHeight = 297; 
        const margin = 10;
        
        const imgWidth = contentWidth;
        const imgHeight = (listCanvas.height * imgWidth) / listCanvas.width;
        
        if (imgHeight <= (pageHeight - 20)) {
             pdf.addImage(listCanvas.toDataURL('image/jpeg', 0.8), 'JPEG', margin, margin, imgWidth, imgHeight);
        } else {
            // Multi-page slicing for long lists
            let currentSrcY = 0;
            let remainingSrcHeight = listCanvas.height;
            const canvasToPdfRatio = contentWidth / listCanvas.width;
            const maxSrcHeightPerPage = (pageHeight - 20) / canvasToPdfRatio;

            while (remainingSrcHeight > 0) {
                if (currentSrcY > 0) pdf.addPage(); // Add page for subsequent slices
                
                const sliceHeight = Math.min(remainingSrcHeight, maxSrcHeightPerPage);
                
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = listCanvas.width;
                tempCanvas.height = sliceHeight;
                const ctx = tempCanvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(listCanvas, 0, currentSrcY, listCanvas.width, sliceHeight, 0, 0, listCanvas.width, sliceHeight);
                    pdf.addImage(tempCanvas.toDataURL('image/jpeg', 0.8), 'JPEG', margin, margin, contentWidth, sliceHeight * canvasToPdfRatio);
                }
                currentSrcY += sliceHeight;
                remainingSrcHeight -= sliceHeight;
            }
        }
      }

      setDownloadProgress(100);
      pdf.save(`Bingo-${subjectContext.subject.replace(/[^a-z0-9]/gi, '_')}.pdf`);

    } catch (error) {
      console.error("PDF Generation failed", error);
      alert("Er ging iets mis bij het maken van de PDF.");
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setGenerationMode('similar'); 
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Logic to determine if a string should be text even in math mode
  const shouldRenderAsText = (content: string) => {
    if (!content) return true;
    if (/[\\={}^_]/.test(content)) return false;
    if (/\d/.test(content)) return false;
    if (content.length <= 2) return false;
    return /^[a-zA-Z\u00C0-\u00FF\s.,?!'"-]+$/.test(content);
  };

  return (
    <div className="min-h-screen font-sans pb-20">
      {/* Screen-only Controls Header */}
      <div className="print:hidden bg-white/80 backdrop-blur-md border-b border-indigo-100 shadow-sm sticky top-0 z-10 p-4 md:p-6 transition-all">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-200">
                <Palette size={26} />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">Bingo Generator</h1>
                <p className="text-indigo-600 font-medium text-sm">
                  Maak prachtige bingokaarten met AI
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 items-center">
               {/* Progress Bar Display */}
               {isDownloading && (
                 <div className="flex flex-col items-end mr-3 w-40 animate-in fade-in slide-in-from-right-4">
                    <div className="flex justify-between w-full mb-1">
                        <span className="text-xs font-bold text-indigo-600">PDF Maken...</span>
                        <span className="text-xs font-bold text-indigo-500">{downloadProgress}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-indigo-100 rounded-full overflow-hidden shadow-inner">
                       <div 
                         className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all duration-200 ease-out"
                         style={{ width: `${downloadProgress}%` }}
                       />
                    </div>
                 </div>
               )}
               
               {status === GeneratorStatus.SUCCESS && (
                <button 
                  onClick={handleDownloadPDF}
                  disabled={isDownloading}
                  className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-6 py-2.5 rounded-full hover:shadow-xl hover:shadow-pink-200 hover:-translate-y-0.5 transition-all shadow-md disabled:opacity-70 disabled:cursor-wait font-bold disabled:hover:translate-y-0"
                  title="Download als PDF"
                >
                  {isDownloading ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                  {isDownloading ? 'Even geduld...' : 'Download PDF'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start bg-white p-6 rounded-3xl border border-indigo-50 shadow-xl shadow-indigo-100/50">
            
            {/* Left Column: Subject & Input */}
            <div className="md:col-span-7 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  1. Kies een Onderwerp <span className="font-normal text-gray-400">- Waar gaat de bingo over?</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-grow group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-colors group-focus-within:text-indigo-500">
                      <Sparkles size={18} className="text-gray-400 group-focus-within:text-indigo-500" />
                    </div>
                    <input 
                      type="text" 
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="w-full pl-10 border border-gray-200 bg-gray-50 rounded-xl p-3 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium transition-all"
                      placeholder={selectedImage ? "Optioneel: Geef extra context..." : "Typ een onderwerp (bijv. 'Dieren', 'Hoofdsteden', 'Breuken')..."}
                    />
                  </div>
                  
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleImageUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex items-center justify-center px-4 rounded-xl border-2 transition-all font-semibold ${selectedImage ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-100 text-gray-500 hover:border-indigo-200 hover:text-indigo-600 hover:bg-gray-50'}`}
                    title="Upload een voorbeeld"
                  >
                    <ImageIcon size={20} />
                  </button>
                </div>

                {selectedImage && (
                  <div className="mt-3 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 flex gap-4 animate-in fade-in slide-in-from-top-2">
                    <div className="relative flex-shrink-0">
                      <img src={selectedImage} alt="Voorbeeld" className="h-20 w-20 rounded-lg border border-white shadow-sm object-cover" />
                      <button 
                        onClick={clearImage}
                        className="absolute -top-2 -right-2 bg-white text-rose-500 border border-gray-100 rounded-full p-1 hover:bg-rose-50 shadow-sm"
                        title="Verwijder afbeelding"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    
                    <div className="flex-grow space-y-2">
                      <label className="block text-xs font-bold text-indigo-900 uppercase tracking-wider">
                        Verwerking
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <label className={`flex-1 flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all ${generationMode === 'similar' ? 'bg-white border-indigo-300 shadow-sm' : 'bg-transparent border-transparent hover:bg-white/50'}`}>
                          <input 
                            type="radio" 
                            name="mode" 
                            checked={generationMode === 'similar'} 
                            onChange={() => setGenerationMode('similar')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-gray-700">Soortgelijk</span>
                        </label>
                        
                        <label className={`flex-1 flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all ${generationMode === 'exact' ? 'bg-white border-indigo-300 shadow-sm' : 'bg-transparent border-transparent hover:bg-white/50'}`}>
                          <input 
                            type="radio" 
                            name="mode" 
                            checked={generationMode === 'exact'} 
                            onChange={() => setGenerationMode('exact')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-gray-700">Exact overnemen</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Settings */}
            <div className="md:col-span-5 space-y-5">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                      <Settings2 size={16} className="text-indigo-500" />
                      2. Rooster
                    </label>
                    <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-200">
                      <select 
                        value={gridRows}
                        onChange={(e) => setGridRows(Number(e.target.value))}
                        className="flex-1 bg-transparent p-2 text-sm font-semibold text-center focus:outline-none cursor-pointer hover:bg-white rounded-lg transition-colors"
                      >
                         {[3, 4, 5].map(n => <option key={n} value={n}>{n} rijen</option>)}
                      </select>
                      <span className="text-gray-300">×</span>
                      <select 
                        value={gridCols}
                        onChange={(e) => setGridCols(Number(e.target.value))}
                        className="flex-1 bg-transparent p-2 text-sm font-semibold text-center focus:outline-none cursor-pointer hover:bg-white rounded-lg transition-colors"
                      >
                         {[3, 4, 5].map(n => <option key={n} value={n}>{n} kol.</option>)}
                      </select>
                    </div>
                 </div>

                 <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Aantal Kaarten</label>
                    <input 
                      type="number" 
                      min={1} 
                      max={100}
                      value={cardCount}
                      onChange={(e) => setCardCount(parseInt(e.target.value) || 0)}
                      className="w-full border border-gray-200 bg-gray-50 rounded-xl p-3 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold text-center"
                    />
                 </div>
              </div>

              <div className="flex gap-3">
                 <div className="flex-1">
                     <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                        <ListChecks size={16} className="text-indigo-500" />
                        Aantal Vragen
                    </label>
                    <input 
                        type="number" 
                        min={minPoolSize} 
                        max={60}
                        value={poolSize}
                        onChange={(e) => setPoolSize(parseInt(e.target.value) || minPoolSize)}
                        className="w-full border border-gray-200 bg-gray-50 rounded-xl p-3 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold text-indigo-900"
                    />
                 </div>
                 <div className="flex items-end pb-1">
                    <button 
                    onClick={handleStartGeneration}
                    disabled={status === GeneratorStatus.GENERATING || status === GeneratorStatus.DETECTING}
                    className="h-[46px] px-6 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-bold shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5"
                    >
                    {status === GeneratorStatus.DETECTING || status === GeneratorStatus.GENERATING ? (
                        <Loader2 className="animate-spin" size={20} />
                    ) : (
                        <LayoutGrid size={20} />
                    )}
                    {status === GeneratorStatus.DETECTING ? '...' : 
                    status === GeneratorStatus.GENERATING ? '...' : 'Genereren'}
                    </button>
                    
                    {status === GeneratorStatus.SUCCESS && (
                    <button 
                    onClick={handleRegenerateCardsOnly}
                    title="Herschud kaarten met zelfde vragen"
                    className="ml-2 h-[46px] w-[46px] flex items-center justify-center border-2 border-gray-200 bg-white rounded-xl hover:border-indigo-300 hover:text-indigo-600 text-gray-400 transition-colors"
                    >
                    <RefreshCw size={20} />
                    </button>
                    )}
                 </div>
              </div>
            </div>
          </div>
          
          {status === GeneratorStatus.ERROR && (
             <div className="bg-rose-50 text-rose-700 p-4 rounded-xl border border-rose-200 text-sm font-medium flex items-center gap-2">
                <div className="w-2 h-2 bg-rose-500 rounded-full"></div>
                Er is een fout opgetreden. Controleer de input en probeer het opnieuw.
             </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {status === GeneratorStatus.CONFIRMING && (
        <div className="fixed inset-0 bg-indigo-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 border border-white/20">
            <h3 className="text-xl font-black text-gray-900 mb-2">Bevestig Onderwerp</h3>
            <p className="text-gray-600 mb-6">
              Ik heb je input geanalyseerd. Klopt de volgende indeling?
            </p>
            
            <div className="mb-6 space-y-4">
              <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Onderwerp / Vak</label>
                  <input 
                    type="text" 
                    value={tempSubjectName}
                    onChange={(e) => setTempSubjectName(e.target.value)}
                    className="w-full border-2 border-indigo-100 bg-indigo-50/50 rounded-xl p-3 focus:bg-white focus:border-indigo-500 focus:ring-0 outline-none font-bold text-lg text-indigo-900"
                  />
              </div>
              
              <label className="flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all hover:border-indigo-200 hover:bg-indigo-50/30 select-none group">
                <div className={`w-6 h-6 flex items-center justify-center rounded-lg border-2 transition-colors ${subjectContext.isMath ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300 group-hover:border-indigo-300'}`}>
                  {subjectContext.isMath && <Check size={16} className="text-white" />}
                </div>
                <input 
                  type="checkbox" 
                  checked={subjectContext.isMath}
                  onChange={(e) => setSubjectContext(prev => ({ ...prev, isMath: e.target.checked }))}
                  className="hidden"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                      <Calculator size={18} className={subjectContext.isMath ? "text-indigo-600" : "text-gray-400"} />
                      <span className="block font-bold text-gray-900">Wiskunde Modus</span>
                  </div>
                  <span className="block text-xs text-gray-500 mt-0.5">Zet aan voor LaTeX formules en symbolen.</span>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button 
                onClick={() => setStatus(GeneratorStatus.IDLE)}
                className="px-5 py-2.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 rounded-xl font-medium transition-colors"
              >
                Annuleren
              </button>
              <button 
                onClick={handleConfirmAndGenerate}
                className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200 transition-all flex items-center gap-2 font-bold"
              >
                <Check size={18} />
                Bevestigen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div id="printable-content" className="max-w-6xl mx-auto p-4 md:p-8">
        
        {/* Print Instruction Header */}
        {status === GeneratorStatus.SUCCESS && (
          <div className="mb-10 text-center pb-4">
            <h1 className="text-4xl font-black mb-3 text-indigo-900">Bingo: {subjectContext.subject}</h1>
            <p className="text-lg text-indigo-700 max-w-2xl mx-auto leading-relaxed">
              De spelleider leest een vraag voor. Weet jij het antwoord? 
              Staat het op je kaart? <span className="font-bold underline decoration-pink-500 decoration-4">Streep het door!</span>
            </p>
          </div>
        )}

        {/* Empty State */}
        {status === GeneratorStatus.IDLE && (
          <div className="text-center py-20 opacity-50 select-none">
            <div className="w-24 h-24 bg-white rounded-3xl mx-auto mb-6 flex items-center justify-center transform rotate-12 shadow-xl shadow-purple-100">
                <LayoutGrid size={48} className="text-indigo-400" />
            </div>
            <p className="text-xl font-bold text-indigo-900/60">Kies een onderwerp en klik op Genereren.</p>
          </div>
        )}

        {/* Cards Grid */}
        {cards.length > 0 && (
          <div className="cards-container flex flex-wrap justify-center items-start">
            {cards.map((card) => (
              <BingoCard 
                key={card.id} 
                card={card} 
                rows={gridRows} 
                cols={gridCols} 
                isMath={subjectContext.isMath}
                className="bingo-card-export transform hover:scale-[1.02] transition-transform duration-300 origin-center" 
              />
            ))}
          </div>
        )}

        {/* Teacher Calling List */}
        {items.length > 0 && status === GeneratorStatus.SUCCESS && (
          <div id="calling-list-export" className="mt-12 bg-white rounded-3xl p-8 shadow-xl shadow-indigo-100/50 border border-indigo-50">
            <div className="flex items-center gap-4 mb-8 border-b border-gray-100 pb-6">
              <div className="bg-pink-100 p-3 rounded-2xl text-pink-600 shadow-sm">
                <ListChecks size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900">Oproeplijst voor de Docent</h2>
                <p className="text-gray-500 font-medium">Gebruik deze lijst om de bingo te leiden.</p>
              </div>
            </div>
            
            <div className="w-full max-w-5xl mx-auto overflow-hidden rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider font-bold">
                  <tr>
                    <th className="p-4 border-b border-gray-200 w-16 text-center">#</th>
                    <th className="p-4 border-b border-gray-200">Vraag (Hardop voorlezen)</th>
                    <th className="p-4 border-b border-gray-200 min-w-[150px]">Antwoord (Op kaart)</th>
                    <th className="p-4 border-b border-gray-200 w-24 text-center">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item, idx) => {
                    // Also check for text in the calling list
                    const answerIsText = subjectContext.isMath && shouldRenderAsText(item.answer);
                    const problemIsText = subjectContext.isMath && shouldRenderAsText(item.problem);

                    return (
                      <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="p-4 text-center font-bold text-indigo-300">{idx + 1}</td>
                        <td className="p-4 font-medium text-lg text-gray-800">
                          {subjectContext.isMath && !problemIsText ? <MathDisplay latex={item.problem} /> : item.problem}
                        </td>
                        <td className="p-4 font-bold text-lg text-indigo-700">
                          <span className="bg-white px-3 py-1.5 rounded-lg border border-indigo-100 inline-block shadow-sm text-indigo-800">
                               {subjectContext.isMath && !answerIsText ? <MathDisplay latex={item.answer} /> : item.answer}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="w-8 h-8 border-2 border-gray-200 rounded-lg mx-auto bg-white"></div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;