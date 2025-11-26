import React, { useMemo } from 'react';
import { BingoCardData, BingoItem } from '../types';
import { MathDisplay } from './MathDisplay';

interface BingoCardProps {
  card: BingoCardData;
  rows: number;
  cols: number;
  isMath: boolean;
  className?: string; // Allow passing classes for selection
  id?: string;
}

export const BingoCard: React.FC<BingoCardProps> = ({ card, rows, cols, isMath, className = '', id }) => {
  
  // Transform flat array into rows for rendering
  const gridRows = useMemo(() => {
    const result = [];
    for (let i = 0; i < rows; i++) {
      result.push(card.cells.slice(i * cols, (i + 1) * cols));
    }
    return result;
  }, [card.cells, rows, cols]);

  // Helper to determine if content should be treated as text even in math mode
  // e.g. "Herleid" is text, but "2x" or formulas are math.
  const shouldRenderAsText = (content: string) => {
    if (!content) return true;
    // If it contains backslashes, braces, or equals, it's definitely Latex/Math
    if (/[\\={}^_]/.test(content)) return false;
    // If it contains digits, assume it's math-related (e.g. "2x", "45")
    if (/\d/.test(content)) return false;
    // If it's short (like "x" or "y"), treat as math variable
    if (content.length <= 2) return false;
    // Otherwise, if it's mostly letters/punctuation, treat as text
    return /^[a-zA-Z\u00C0-\u00FF\s.,?!'"-]+$/.test(content);
  };

  return (
    <div 
      id={id}
      className={`bingo-card bg-white border-2 border-indigo-600 mb-8 mx-4 shadow-xl shadow-indigo-900/10 w-[300px] max-w-full rounded-2xl overflow-hidden print:shadow-none print:border-2 print:border-black print:rounded-none print:m-0 print:mb-4 ${className}`}
    >
      <div className="text-center py-2 bg-indigo-600 text-white font-black uppercase tracking-widest text-sm print:bg-gray-200 print:text-black print:border-b-2 print:border-black">
        Bingo Kaart #{card.id}
      </div>
      
      <div className="w-full flex flex-col bg-indigo-600 print:bg-black gap-[2px] border-t-0">
          {gridRows.map((rowItems, rowIndex) => (
            <div key={rowIndex} className="flex flex-1 w-full gap-[2px]">
              {rowItems.map((cell, colIndex) => {
                const isFree = cell === 'GRATIS';
                const item = !isFree ? (cell as BingoItem) : null;
                const content = item?.answer || '';
                const isTextOverride = isMath && shouldRenderAsText(content);
                
                return (
                  <div 
                    key={colIndex}
                    className={`
                      flex-1 flex items-center justify-center p-1 relative
                      ${isFree ? 'bg-indigo-50 print:bg-gray-100' : 'bg-white'}
                    `}
                    style={{
                      aspectRatio: '1/1', 
                      fontSize: isFree ? '0.8rem' : Math.max(0.7, 1.1 - (Math.max(rows, cols) * 0.1)) + 'rem',
                      fontWeight: 'bold',
                      color: isFree ? '#6366f1' : '#1e1b4b' 
                    }}
                  >
                    {isFree ? (
                      <span className="tracking-widest opacity-80 font-black">GRATIS</span>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center overflow-hidden text-indigo-950 print:text-black">
                        <div className={`max-w-full max-h-full px-1 ${(!isMath || isTextOverride) ? 'break-words leading-tight text-center font-bold' : ''}`}>
                          {isMath && !isTextOverride ? (
                            <MathDisplay latex={content} />
                          ) : (
                            <span>{content}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
};