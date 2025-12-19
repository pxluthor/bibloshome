import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import axios from 'axios';
import {
    ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
    Maximize, Minimize, FileText,
    Languages, Bookmark, Save, ArrowLeft, Columns, Smartphone,
    X, Menu
} from 'lucide-react';

import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

const HIGHLIGHT_COLORS = [
    { id: 'yellow', hex: '#fef08a', label: 'Amarelo' },
    { id: 'green', hex: '#bbf7d0', label: 'Verde' },
    { id: 'blue', hex: '#bfdbfe', label: 'Azul' },
    { id: 'pink', hex: '#fbcfe8', label: 'Rosa' },
    { id: 'purple', hex: '#e9d5ff', label: 'Roxo' },
];

const PDFReader = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const containerRef = useRef(null);

    // --- ESTADOS ---
    const [sidebarWidth, setSidebarWidth] = useState(400);
    const [isResizing, setIsResizing] = useState(false);

    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [dualPage, setDualPage] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [pdfError, setPdfError] = useState(null);
    const [pageWidth, setPageWidth] = useState(700);

    const [bookmarks, setBookmarks] = useState([]);
    const [notes, setNotes] = useState({});
    const [highlights, setHighlights] = useState({});
    const [selectionMenu, setSelectionMenu] = useState(null);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    const [activeTab, setActiveTab] = useState('translation');
    const [translation, setTranslation] = useState("");
    const [loadingTranslation, setLoadingTranslation] = useState(false);

    useEffect(() => {
        setBookmarks(JSON.parse(localStorage.getItem(`bookmarks_${id}`)) || []);
        setNotes(JSON.parse(localStorage.getItem(`notes_${id}`)) || {});
        setHighlights(JSON.parse(localStorage.getItem(`highlights_${id}`)) || {});

        const handleResize = () => {
            if (window.innerWidth < 768) {
                setPageWidth(window.innerWidth - 32);
                setScale(1.0);
                setDualPage(false);
            } else {
                setPageWidth(700);
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [id]);

    // --- REDIMENSIONAMENTO ---
    const startResizing = useCallback((e) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e) => {
        if (isResizing) {
            const newWidth = window.innerWidth - e.clientX;
            // Limites: Min 200px, Max (Tela - 50px)
            if (newWidth > 200 && newWidth < window.innerWidth - 50) {
                setSidebarWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener("mousemove", resize);
            window.addEventListener("mouseup", stopResizing);
        } else {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        }
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    // --- HANDLERS ---
    const onDocumentLoadSuccess = ({ numPages }) => {
        setNumPages(numPages);
        setPdfError(null);
    };

    const changePage = (offset) => {
        setPageNumber(prev => Math.min(Math.max(1, prev + offset), numPages));
        setTranslation("");
        setSelectionMenu(null);
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const toggleBookmark = () => {
        let newBookmarks = bookmarks.includes(pageNumber)
            ? bookmarks.filter(p => p !== pageNumber)
            : [...bookmarks, pageNumber];
        setBookmarks(newBookmarks);
        localStorage.setItem(`bookmarks_${id}`, JSON.stringify(newBookmarks));
    };

    const handleNoteChange = (e) => {
        const newNotes = { ...notes, [pageNumber]: e.target.value };
        setNotes(newNotes);
        localStorage.setItem(`notes_${id}`, JSON.stringify(newNotes));
    };

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

    const applyHighlight = (colorHex) => {
        if (!selectionMenu || !selectionMenu.range) return;
        const clientRects = Array.from(selectionMenu.range.getClientRects());
        const pageElement = document.querySelector(`[data-page-number="${pageNumber}"]`);
        if (!pageElement) return;

        const pageRect = pageElement.getBoundingClientRect();
        const normalizedRects = clientRects.map(rect => ({
            left: ((rect.left - pageRect.left) / pageRect.width) * 100,
            top: ((rect.top - pageRect.top) / pageRect.height) * 100,
            width: (rect.width / pageRect.width) * 100,
            height: (rect.height / pageRect.height) * 100
        }));

        const newHighlight = { id: Date.now(), color: colorHex, rects: normalizedRects };
        const pageHighlights = highlights[pageNumber] || [];
        const newHighlightsMap = { ...highlights, [pageNumber]: [...pageHighlights, newHighlight] };

        setHighlights(newHighlightsMap);
        localStorage.setItem(`highlights_${id}`, JSON.stringify(newHighlightsMap));
        window.getSelection().removeAllRanges();
        setSelectionMenu(null);
    };

    const removeHighlight = (highlightId) => {
        const pageHighlights = highlights[pageNumber].filter(h => h.id !== highlightId);
        const newHighlightsMap = { ...highlights, [pageNumber]: pageHighlights };
        setHighlights(newHighlightsMap);
        localStorage.setItem(`highlights_${id}`, JSON.stringify(newHighlightsMap));
    };

    const handleTranslate = async () => {
        setLoadingTranslation(true);
        try {
            const response = await axios.post(`http://localhost:8001/documents/${id}/page/${pageNumber}/translate`);
            setTranslation(response.data.translated_text);
        } catch (error) {
            console.error("Erro na tradução:", error);
            setTranslation("Erro ao obter tradução.");
        } finally {
            setLoadingTranslation(false);
        }
    };

    return (
        <div ref={containerRef} className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden font-sans relative select-none">

            {/* Menu Highlights */}
            {selectionMenu && (
                <div
                    className="fixed z-50 bg-white shadow-xl rounded-full p-2 flex gap-2 border border-gray-200 animate-in fade-in zoom-in duration-200"
                    style={{ left: selectionMenu.x, top: selectionMenu.y, transform: 'translate(-50%, -100%)' }}
                >
                    {HIGHLIGHT_COLORS.map(color => (
                        <button
                            key={color.id}
                            onClick={() => applyHighlight(color.hex)}
                            className="w-8 h-8 rounded-full border border-gray-300 hover:scale-110 transition shadow-sm"
                            style={{ backgroundColor: color.hex }}
                        />
                    ))}
                    <div className="w-px h-8 bg-gray-300 mx-1"></div>
                    <button onClick={() => setSelectionMenu(null)} className="p-1 text-gray-500 hover:text-red-500"><X size={18} /></button>
                </div>
            )}

            {/* Barra Superior */}
            <div className="fixed top-0 left-0 w-full h-14 md:h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-2 md:px-4 z-40 shadow-md">
                <div className="flex items-center gap-2 md:gap-4">
                    <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-700 rounded-full transition text-gray-300"><ArrowLeft size={20} /></button>
                    <h1 className="text-sm font-semibold text-gray-300 hidden sm:block">Leitor de Estudo</h1>
                </div>

                <div className="flex items-center gap-1 md:gap-2 bg-gray-900 rounded-lg p-1">
                    <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-1 md:p-2 hover:bg-gray-700 rounded text-gray-300"><ZoomOut size={16} /></button>
                    <span className="text-xs font-mono w-8 md:w-12 text-center hidden sm:block">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.min(2.5, s + 0.1))} className="p-1 md:p-2 hover:bg-gray-700 rounded text-gray-300"><ZoomIn size={16} /></button>
                    <div className="hidden md:flex items-center">
                        <div className="w-px h-4 bg-gray-700 mx-2"></div>
                        <button onClick={() => setDualPage(!dualPage)} className={`p-2 rounded ${dualPage ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}>
                            {dualPage ? <Columns size={18} /> : <Smartphone size={18} />}
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-1 md:gap-2">
                    <button onClick={toggleBookmark} className={`p-2 rounded-full transition ${bookmarks.includes(pageNumber) ? 'text-yellow-400' : 'text-gray-400 hover:text-white'}`}>
                        <Bookmark size={20} fill={bookmarks.includes(pageNumber) ? "currentColor" : "none"} />
                    </button>
                    <button onClick={toggleFullscreen} className="p-2 hover:bg-gray-700 rounded text-gray-300 hidden sm:block">
                        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex w-full h-full pt-14 md:pt-16">

                {/* 1. PDF AREA */}
                <div
                    className={`flex-1 bg-gray-500 relative flex justify-center items-start p-4 overflow-auto ${isResizing ? 'pointer-events-none' : ''}`}
                    onMouseUp={handleTextSelection}
                >
                    <button
                        disabled={pageNumber <= 1}
                        onClick={() => changePage(dualPage ? -2 : -1)}
                        className="fixed left-4 top-1/2 transform -translate-y-1/2 bg-gray-800/80 text-white p-3 rounded-full shadow-lg hover:bg-black disabled:opacity-30 z-30 transition"
                    >
                        <ChevronLeft size={20} />
                    </button>

                    <button
                        disabled={pageNumber >= numPages}
                        onClick={() => changePage(dualPage ? 2 : 1)}
                        className="fixed top-1/2 transform -translate-y-1/2 bg-gray-800/80 text-white p-3 rounded-full shadow-lg hover:bg-black disabled:opacity-30 z-30 transition"
                        style={{ right: window.innerWidth < 768 ? '1rem' : `${sidebarWidth + 24}px` }}
                    >
                        <ChevronRight size={20} />
                    </button>

                    <div className="flex gap-4 shadow-2xl mt-4 mb-20 select-text">
                        {pdfError ? (
                            <div className="bg-white p-6 text-red-500 rounded text-center mt-10"><p className="font-bold">Erro</p><p className="text-sm">{pdfError}</p></div>
                        ) : (
                            <Document
                                file={`http://localhost:8001/documents/${id}/file`}
                                onLoadSuccess={onDocumentLoadSuccess}
                                onLoadError={(error) => setPdfError(error.message)}
                                loading={<div className="text-white mt-20 animate-pulse">Carregando...</div>}
                                className="flex gap-4"
                            >
                                <div className="bg-white relative shadow-lg">
                                    <div className="absolute inset-0 pointer-events-none z-10">
                                        {(highlights[pageNumber] || []).map(h => (
                                            <div key={h.id}>
                                                {h.rects.map((rect, idx) => (
                                                    <div key={idx} className="absolute cursor-pointer hover:opacity-80 pointer-events-auto"
                                                        onClick={() => { if (window.confirm("Remover?")) removeHighlight(h.id); }}
                                                        style={{ top: `${rect.top}%`, left: `${rect.left}%`, width: `${rect.width}%`, height: `${rect.height}%`, backgroundColor: h.color, opacity: 0.4, mixBlendMode: 'multiply' }}
                                                    />
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                    <Page
                                        pageNumber={pageNumber}
                                        scale={scale}
                                        width={pageWidth}
                                        renderTextLayer={true}
                                        renderAnnotationLayer={true}
                                        inputRef={(ref) => { if (ref) ref.setAttribute('data-page-number', pageNumber); }}
                                    />
                                </div>
                                {dualPage && pageNumber + 1 <= numPages && (
                                    <div className="bg-white hidden xl:block relative shadow-lg">
                                        <Page
                                            pageNumber={pageNumber + 1} scale={scale} width={pageWidth} renderTextLayer={true}
                                            inputRef={(ref) => { if (ref) ref.setAttribute('data-page-number', pageNumber + 1); }}
                                        />
                                    </div>
                                )}
                            </Document>
                        )}
                    </div>

                    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg text-sm font-semibold opacity-90 z-30">
                        {pageNumber} / {numPages}
                    </div>
                </div>

                {/* 2. DIVISOR (HANDLE) */}
                <div
                    className="hidden md:flex w-1 hover:w-2 bg-gray-300 hover:bg-blue-600 cursor-col-resize z-50 items-center justify-center transition-all duration-150 flex-shrink-0"
                    onMouseDown={startResizing}
                >
                    <div className="h-8 w-1 bg-gray-400 rounded-full"></div>
                </div>

                {/* 3. SIDEBAR */}
                <div
                    className={`
                        bg-white border-l border-gray-200 flex flex-col shadow-xl z-40 flex-shrink-0
                        fixed inset-y-0 right-0 w-[90%] max-w-sm transition-transform duration-300
                        ${isMobileSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
                        md:static md:translate-x-0 md:transition-none md:flex
                        md:max-w-none 
                    `} // ADICIONEI "md:max-w-none" aqui acima para remover o limite no desktop
                    style={{
                        width: window.innerWidth >= 768 ? `${sidebarWidth}px` : undefined
                    }}
                >
                    <div className="md:hidden p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <span className="font-bold text-gray-700">Ferramentas</span>
                        <button onClick={() => setIsMobileSidebarOpen(false)} className="p-2 text-gray-500 hover:bg-gray-200 rounded-full"><X size={20} /></button>
                    </div>

                    <div className="flex border-b border-gray-200 flex-shrink-0">
                        <button onClick={() => setActiveTab('translation')} className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition ${activeTab === 'translation' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}`}>
                            <Languages size={18} /> <span className="hidden sm:inline">Tradução</span>
                        </button>
                        <button onClick={() => setActiveTab('notes')} className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition ${activeTab === 'notes' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}`}>
                            <FileText size={18} /> <span className="hidden sm:inline">Notas</span>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50 flex flex-col h-full">
                        {activeTab === 'translation' && (
                            <div className="flex flex-col h-full">
                                <div className="mb-4 p-3 bg-blue-100 rounded-lg text-blue-800 text-sm flex-shrink-0">
                                    <p className="font-bold mb-1">Tradutor da Pág. {pageNumber}</p>
                                    <p className="text-xs">Selecione texto para destacar ou clique abaixo.</p>
                                </div>
                                <div className="flex-grow bg-white border border-gray-200 rounded-lg p-4 shadow-sm overflow-y-auto mb-4 prose prose-sm max-w-none text-gray-700 min-h-[200px]">
                                    {loadingTranslation ? (
                                        <div className="flex items-center justify-center h-full text-gray-400">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                                            Traduzindo...
                                        </div>
                                    ) : translation ? translation : (
                                        <div className="flex items-center justify-center h-full text-gray-400 italic text-center">
                                            A tradução aparecerá aqui.
                                        </div>
                                    )}
                                </div>
                                <button onClick={handleTranslate} disabled={loadingTranslation} className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold shadow hover:bg-blue-700 transition flex-shrink-0">
                                    Traduzir Página
                                </button>
                            </div>
                        )}

                        {activeTab === 'notes' && (
                            <div className="flex flex-col h-full">
                                <div className="mb-2 flex justify-between items-center flex-shrink-0">
                                    <span className="text-xs font-bold text-gray-500 uppercase">Notas da Pág. {pageNumber}</span>
                                    {notes[pageNumber] && <span className="text-xs text-green-600 flex items-center gap-1"><Save size={12} /> Salvo</span>}
                                </div>
                                <textarea
                                    value={notes[pageNumber] || ""}
                                    onChange={handleNoteChange}
                                    placeholder="Suas anotações..."
                                    className="flex-grow w-full p-4 border border-gray-300 rounded-lg shadow-inner resize-none focus:ring-2 focus:ring-blue-500 text-base"
                                />
                            </div>
                        )}
                    </div>
                </div>

                <button onClick={() => setIsMobileSidebarOpen(true)} className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-2xl flex items-center justify-center z-50 hover:bg-blue-700 transition">
                    <Menu size={24} />
                </button>
                {isMobileSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden animate-in fade-in duration-200" onClick={() => setIsMobileSidebarOpen(false)} />}
            </div>
        </div>
    );
};

export default PDFReader;