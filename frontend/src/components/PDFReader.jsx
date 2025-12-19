import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import DOMPurify from 'dompurify';
import { 
    ArrowLeft, ZoomIn, ZoomOut, Bookmark, 
    X, Languages, FileText, ChevronLeft, ChevronRight,
    Columns, Square
} from 'lucide-react';

import api from '../services/api';
import { useSidebarResizer } from '../hooks/useSidebarResizer';
import { usePDFAnnotations } from '../hooks/usePDFAnnotations';
import { TranslationTab, NotesTab } from './Reader/SidebarTabs';

import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const HIGHLIGHT_COLORS = [
    { id: 'yellow', hex: '#fef08a' },
    { id: 'green', hex: '#bbf7d0' },
    { id: 'blue', hex: '#bfdbfe' },
    { id: 'pink', hex: '#fbcfe8' },
];

const PDFReader = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const containerRef = useRef(null);

    const { sidebarWidth, isResizing, startResizing } = useSidebarResizer(400);
    const { 
        bookmarks, notes, highlights, isSaving, 
        toggleBookmark, updateNote, addHighlight, removeHighlight 
    } = usePDFAnnotations(id);

    // ESTADOS DO LEITOR
    const [pageNumber, setPageNumber] = useState(1);
    const [numPages, setNumPages] = useState(null);
    const [scale, setScale] = useState(1.2);
    const [isDoublePage, setIsDoublePage] = useState(false); // ESTADO PÁGINA DUPLA
    const [activeTab, setActiveTab] = useState('translation');
    const [translation, setTranslation] = useState("");
    const [loadingTranslation, setLoadingTranslation] = useState(false);
    const [selectionMenu, setSelectionMenu] = useState(null);

    // Navegação Inteligente
    const goToPrevPage = () => setPageNumber(p => Math.max(1, isDoublePage ? p - 2 : p - 1));
    const goToNextPage = () => setPageNumber(p => Math.min(numPages || p, isDoublePage ? p + 2 : p + 1));

    // Suporte ao Teclado
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
            if (e.key === 'ArrowRight') goToNextPage();
            if (e.key === 'ArrowLeft') goToPrevPage();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [numPages, isDoublePage]);

    const handleTextSelection = () => {
        if (isResizing) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            setSelectionMenu(null);
            return;
        }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelectionMenu({
            x: rect.left + (rect.width / 2),
            y: rect.top + window.scrollY - 10,
            range: range
        });
    };

    const applyHighlight = (colorHex, targetPage) => {
        if (!selectionMenu || !selectionMenu.range) return;
        const clientRects = Array.from(selectionMenu.range.getClientRects());
        const pageElement = document.querySelector(`[data-page-number="${targetPage}"]`);
        if (!pageElement) return;

        const pageRect = pageElement.getBoundingClientRect();
        const normalizedRects = clientRects.map(rect => ({
            left: ((rect.left - pageRect.left) / pageRect.width) * 100,
            top: ((rect.top - pageRect.top) / pageRect.height) * 100,
            width: (rect.width / pageRect.width) * 100,
            height: (rect.height / pageRect.height) * 100
        }));

        addHighlight(targetPage, { id: Date.now(), color: colorHex, rects: normalizedRects });
        window.getSelection().removeAllRanges();
        setSelectionMenu(null);
    };

    const handleTranslate = () => {
        setTranslation("<div style='text-align: center; padding: 20px; color: #4b5563;'><strong>Disponível em breve!</strong></div>");
    };

    // Função para renderizar a camada de destaques em uma página específica
    const renderHighlightLayer = (pNum) => (
        <div className="absolute inset-0 pointer-events-none z-10">
            {(highlights[pNum] || []).map(h => (
                <div key={h.id}>
                    {h.rects.map((rect, idx) => (
                        <div key={idx} className="absolute pointer-events-auto cursor-pointer"
                            onClick={() => removeHighlight(pNum, h.id)}
                            style={{ 
                                top: `${rect.top}%`, left: `${rect.left}%`, 
                                width: `${rect.width}%`, height: `${rect.height}%`, 
                                backgroundColor: h.color, opacity: 0.4, mixBlendMode: 'multiply' 
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );

    return (
        <div ref={containerRef} className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden select-none">
            
            {/* MENU FLUTUANTE DE CORES */}
            {selectionMenu && (
                <div 
                    className="fixed z-50 bg-white shadow-2xl rounded-full p-2 flex gap-2 border border-gray-200"
                    style={{ left: selectionMenu.x, top: selectionMenu.y, transform: 'translate(-50%, -100%)' }}
                >
                    {HIGHLIGHT_COLORS.map(color => (
                        <button 
                            key={color.id} 
                            onClick={() => applyHighlight(color.hex, pageNumber)} // Nota: em modo duplo, aplica na página base
                            className="w-8 h-8 rounded-full border border-gray-300 hover:scale-110 transition shadow-sm" 
                            style={{ backgroundColor: color.hex }} 
                        />
                    ))}
                    <button onClick={() => setSelectionMenu(null)} className="p-1 text-gray-500 hover:text-red-500 ml-1"><X size={18} /></button>
                </div>
            )}

            {/* HEADER */}
            <header className="fixed top-0 w-full h-14 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4 z-40">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-700 rounded-full transition"><ArrowLeft size={20} /></button>
                    <div className="h-6 w-px bg-gray-700 mx-1 hidden md:block" />
                    
                    {/* Botão de Alternar Modo de Visualização */}
                    <button 
                        onClick={() => setIsDoublePage(!isDoublePage)}
                        className={`p-2 rounded-lg flex items-center gap-2 transition ${isDoublePage ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
                        title={isDoublePage ? "Mudar para Página Única" : "Mudar para Página Dupla"}
                    >
                        {isDoublePage ? <Columns size={18} /> : <Square size={18} />}
                        <span className="text-xs font-bold hidden lg:block">{isDoublePage ? "Dupla" : "Simples"}</span>
                    </button>
                </div>

                {/* CONTROLES DE PÁGINA */}
                <div className="flex items-center gap-4 bg-gray-900/50 px-4 py-1.5 rounded-full border border-gray-700">
                    <button onClick={goToPrevPage} disabled={pageNumber <= 1} className="p-1 hover:text-blue-400 disabled:opacity-30 transition">
                        <ChevronLeft size={22} />
                    </button>
                    <span className="text-xs font-mono min-w-[80px] text-center">
                        {isDoublePage ? `${pageNumber}-${Math.min(pageNumber + 1, numPages)}` : pageNumber} / {numPages || '--'}
                    </span>
                    <button onClick={goToNextPage} disabled={pageNumber >= numPages || (isDoublePage && pageNumber + 1 >= numPages)} className="p-1 hover:text-blue-400 disabled:opacity-30 transition">
                        <ChevronRight size={22} />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-gray-900 rounded-lg px-2 mr-2">
                        <button onClick={() => setScale(s => Math.max(0.3, s - 0.2))} className="p-1.5 hover:text-blue-400"><ZoomOut size={16} /></button>
                        <span className="text-[10px] font-mono w-8 text-center">{Math.round(scale * 100)}%</span>
                        <button onClick={() => setScale(s => Math.min(3.0, s + 0.1))} className="p-1.5 hover:text-blue-400"><ZoomIn size={16} /></button>
                    </div>
                    <button onClick={() => toggleBookmark(pageNumber)} className={`p-2 transition ${bookmarks.includes(pageNumber) ? 'text-yellow-400' : 'text-gray-400'}`}>
                        <Bookmark size={20} fill={bookmarks.includes(pageNumber) ? "currentColor" : "none"} />
                    </button>
                </div>
            </header>

            <div className="flex w-full h-full pt-14">
                <main 
                    className={`flex-1 bg-gray-600 overflow-auto p-4 flex justify-center select-text ${isResizing ? 'pointer-events-none' : ''}`}
                    onMouseUp={handleTextSelection}
                >   
                    <Document 
                        file={`${api.defaults.baseURL}/documents/${id}/file`} 
                        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                        loading={<div className="text-white mt-20">A carregar PDF...</div>}
                    >
                        <div className={`flex gap-4 ${isDoublePage ? 'max-w-none' : 'max-w-4xl'}`}>
                            {/* PÁGINA 1 (ESQUERDA OU ÚNICA) */}
                            <div className="bg-white shadow-2xl relative">
                                {renderHighlightLayer(pageNumber)}
                                <Page 
                                    pageNumber={pageNumber} 
                                    scale= {scale} //{isDoublePage ? scale * 0.8 : scale} 
                                    renderTextLayer={true} 
                                    renderAnnotationLayer={true}
                                    inputRef={(ref) => ref?.setAttribute('data-page-number', pageNumber)}
                                />
                            </div>

                            {/* PÁGINA 2 (DIREITA) - SÓ APARECE NO MODO DUPLO */}
                            {isDoublePage && pageNumber + 1 <= numPages && (
                                <div className="bg-white shadow-2xl relative">
                                    {renderHighlightLayer(pageNumber + 1)}
                                    <Page 
                                        pageNumber={pageNumber + 1} 
                                        scale={scale} 
                                        renderTextLayer={true} 
                                        renderAnnotationLayer={true}
                                        inputRef={(ref) => ref?.setAttribute('data-page-number', pageNumber + 1)}
                                    />
                                </div>
                            )}
                        </div>
                    </Document>
                </main>

                <div onMouseDown={startResizing} className="w-1 bg-gray-700 cursor-col-resize hover:bg-blue-600 transition-all" />

                <aside style={{ width: `${sidebarWidth}px` }} className="bg-white flex flex-col shadow-xl">
                    <div className="flex border-b border-gray-200">
                        <button onClick={() => setActiveTab('translation')} className={`flex-1 py-4 flex items-center justify-center gap-2 ${activeTab === 'translation' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 font-bold' : 'text-gray-500'}`}>
                            <Languages size={18} /> Tradução
                        </button>
                        <button onClick={() => setActiveTab('notes')} className={`flex-1 py-4 flex items-center justify-center gap-2 ${activeTab === 'notes' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 font-bold' : 'text-gray-500'}`}>
                            <FileText size={18} /> Notas
                        </button>
                    </div>
                    <div className="flex-1 p-6 bg-gray-50 overflow-hidden">
                        {activeTab === 'translation' ? (
                            <TranslationTab pageNumber={pageNumber} translation={translation} loadingTranslation={loadingTranslation} handleTranslate={handleTranslate} />
                        ) : (
                            <NotesTab pageNumber={pageNumber} note={notes[pageNumber]} onNoteChange={updateNote} isSaving={isSaving} />
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default PDFReader;