import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import {
    ArrowLeft, ZoomIn, ZoomOut, Bookmark, Maximize, Minimize,
    X, Languages, FileText, ChevronLeft, ChevronRight,
    Columns, Square, PanelRightClose, PanelRightOpen
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

    
    const [pageNumber, setPageNumber] = useState(1);
    const [numPages, setNumPages] = useState(null);
    const [scale, setScale] = useState(window.innerWidth < 768 ? 0.6 : 1.2);
    const [isDoublePage, setIsDoublePage] = useState(false);
    const [activeTab, setActiveTab] = useState('translation');
    const [translation, setTranslation] = useState("");
    const [loadingTranslation, setLoadingTranslation] = useState(false);
    const [selectionMenu, setSelectionMenu] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // MEMOIZAÇÃO DO PDF - Evita recarregamento ao trocar abas ou redimensionar
    const pdfFile = useMemo(() => ({
        url: `${api.defaults.baseURL}/documents/${id}/file`,
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        withCredentials: true
    }), [id]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(e => console.error(e));
        } else {
            document.exitFullscreen();
        }
    };

    useEffect(() => {
        const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFSChange);
        return () => document.removeEventListener('fullscreenchange', handleFSChange);
    }, []);

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
        setSelectionMenu({ x: rect.left + (rect.width / 2), y: rect.top + window.scrollY - 10, range: range });
    };

    const applyHighlight = (colorHex, targetPage) => {
        if (!selectionMenu || !selectionMenu.range) return;
        const pageElement = document.querySelector(`[data-page-number="${targetPage}"]`);
        if (!pageElement) return;
        const pageRect = pageElement.getBoundingClientRect();
        const clientRects = Array.from(selectionMenu.range.getClientRects());
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

    const renderHighlightLayer = (pNum) => (
        <div className="absolute inset-0 pointer-events-none z-10">
            {(highlights[pNum] || []).map(h => (
                <div key={h.id}>
                    {h.rects.map((rect, idx) => (
                        <div key={idx} className="absolute pointer-events-auto cursor-pointer"
                            onClick={() => removeHighlight(pNum, h.id)}
                            style={{ top: `${rect.top}%`, left: `${rect.left}%`, width: `${rect.width}%`, height: `${rect.height}%`, backgroundColor: h.color, opacity: 0.4, mixBlendMode: 'multiply' }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );

    return (
        <div ref={containerRef} className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden select-none">
            
            {selectionMenu && (
                <div className="fixed z-[60] bg-white shadow-2xl rounded-full p-2 flex gap-2 border border-gray-200" style={{ left: selectionMenu.x, top: selectionMenu.y, transform: 'translate(-50%, -100%)' }}>
                    {HIGHLIGHT_COLORS.map(color => (
                        <button key={color.id} onClick={() => applyHighlight(color.hex, pageNumber)} className="w-8 h-8 rounded-full border border-gray-300 hover:scale-110 transition shadow-sm" style={{ backgroundColor: color.hex }} />
                    ))}
                    <button onClick={() => setSelectionMenu(null)} className="p-1 text-gray-500 hover:text-red-500 ml-1"><X size={18} /></button>
                </div>
            )}

            {/* HEADER COM Z-50 PARA FICAR ACIMA DO PAINEL */}
            <header className="fixed top-0 w-full h-14 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-1 md:px-4 z-50">
                <div className="flex items-center gap-1 md:gap-4">
                    <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-700 rounded-full transition"><ArrowLeft size={20} /></button>
                    <button onClick={toggleFullscreen} className="p-2 hover:bg-gray-700 rounded-full transition" title="Tela Cheia">
                        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                    
                    <button 
                        onClick={() => setIsDoublePage(!isDoublePage)}
                        className={`hidden md:flex p-2 rounded-lg items-center gap-2 transition ${isDoublePage ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
                    >
                        {isDoublePage ? <Columns size={18} /> : <Square size={18} />}
                    </button>
                </div>

                <div className="flex items-center gap-1 md:gap-4 bg-gray-900/50 px-2 py-1.5 rounded-full border border-gray-700">
                    <button onClick={goToPrevPage} disabled={pageNumber <= 1} className="p-1 hover:text-blue-400 disabled:opacity-30">
                        <ChevronLeft size={22} />
                    </button>
                    <span className="text-xs font-mono min-w-[50px] md:min-w-[80px] text-center">
                        {pageNumber} / {numPages || '--'}
                    </span>
                    <button onClick={goToNextPage} disabled={pageNumber >= numPages} className="p-1 hover:text-blue-400 disabled:opacity-30">
                        <ChevronRight size={22} />
                    </button>
                </div>

                <div className="flex items-center gap-1 md:gap-2">
                    <div className="flex items-center gap-1 bg-gray-900 rounded-lg px-1 md:px-2">
                        <button onClick={() => setScale(s => Math.max(0.3, s - 0.2))} className="p-1.5 hover:text-blue-400"><ZoomOut size={16} /></button>
                        <button onClick={() => setScale(s => Math.min(3.0, s + 0.1))} className="p-1.5 hover:text-blue-400"><ZoomIn size={16} /></button>
                    </div>
                    <button onClick={() => toggleBookmark(pageNumber)} className={`p-2 transition ${bookmarks.includes(pageNumber) ? 'text-yellow-400' : 'text-gray-400'}`}>
                        <Bookmark size={20} fill={bookmarks.includes(pageNumber) ? "currentColor" : "none"} />
                    </button>
                    
                    {/* TOGGLE DO PAINEL - ACESSÍVEL SEMPRE PELO Z-50 DO HEADER */}
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className={`p-2 rounded-lg transition ml-1 ${isSidebarOpen ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                    >
                        {isSidebarOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
                    </button>
                </div>
            </header>

            <div className="flex w-full h-full pt-14">
                <main className={`flex-1 bg-gray-600 overflow-auto p-4 flex justify-center select-text transition-all ${isResizing ? 'pointer-events-none' : ''}`} onMouseUp={handleTextSelection}>   
                    <Document 
                        file={pdfFile}
                        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                        loading={<div className="text-white mt-20 font-medium">A carregar biblioteca...</div>}
                    >
                        <div className={`flex gap-4 ${isDoublePage ? 'max-w-none' : 'max-w-4xl'}`}>
                            <div className="bg-white shadow-2xl relative">
                                {renderHighlightLayer(pageNumber)}
                                <Page pageNumber={pageNumber} scale={scale} renderTextLayer={true} renderAnnotationLayer={true} inputRef={(ref) => ref?.setAttribute('data-page-number', pageNumber)}/>
                            </div>
                            {isDoublePage && pageNumber + 1 <= numPages && (
                                <div className="bg-white shadow-2xl relative">
                                    {renderHighlightLayer(pageNumber + 1)}
                                    <Page pageNumber={pageNumber + 1} scale={scale} renderTextLayer={true} renderAnnotationLayer={true} inputRef={(ref) => ref?.setAttribute('data-page-number', pageNumber + 1)}/>
                                </div>
                            )}
                        </div>
                    </Document>
                </main>

                {/* DIVISOR COM SUPORTE A TOUCH */}
                {isSidebarOpen && (
                    <div 
                        onMouseDown={startResizing}
                        onTouchStart={startResizing} 
                        className="hidden lg:block w-1.5 bg-gray-700 cursor-col-resize hover:bg-blue-600 active:bg-blue-400 transition-all z-40" 
                    />
                )}

                {/* PAINEL COM Z-40 PARA NÃO COBRIR O HEADER */}
                <aside 
                    style={{ width: (window.innerWidth >= 1024 && isSidebarOpen) ? `${sidebarWidth}px` : undefined }} 
                    className={`
                        fixed inset-y-0 right-0 z-40 bg-white flex flex-col shadow-2xl transition-all duration-300
                        lg:relative lg:pt-0 pt-14
                        ${isSidebarOpen ? 'translate-x-0 w-full sm:w-96 lg:w-auto' : 'translate-x-full lg:hidden'}
                    `}
                >
                    <div className="flex border-b border-gray-200 flex-shrink-0">
                        <button onClick={() => setActiveTab('translation')} className={`flex-1 py-4 flex items-center justify-center gap-2 ${activeTab === 'translation' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 font-bold' : 'text-gray-500'}`}>
                            <Languages size={18} /> <span className="text-sm">Tradução</span>
                        </button>
                        <button onClick={() => setActiveTab('notes')} className={`flex-1 py-4 flex items-center justify-center gap-2 ${activeTab === 'notes' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 font-bold' : 'text-gray-500'}`}>
                            <FileText size={18} /> <span className="text-sm">Notas</span>
                        </button>
                    </div>
                    <div className="flex-1 p-6 bg-gray-50 overflow-hidden">
                        {activeTab === 'translation' ? (
                            <TranslationTab pageNumber={pageNumber} translation={translation} loadingTranslation={loadingTranslation} handleTranslate={handleTranslate} />
                        ) : (
                            <NotesTab 
                                pageNumber={pageNumber} 
                                notes={notes} 
                                onNoteChange={updateNote} 
                                isSaving={isSaving}
                                onNavigate={(p) => {
                                    setPageNumber(p);
                                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                                }}
                            />
                        )}
                    </div>
                </aside>

                {isSidebarOpen && (
                    <div className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
                )}
            </div>
        </div>
    );
};

export default PDFReader;