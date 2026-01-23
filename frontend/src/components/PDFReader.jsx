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
    const mainRef = useRef(null);
    const selectionTimeoutRef = useRef(null);

    const { sidebarWidth, isResizing, startResizing } = useSidebarResizer(400);
    const {
        bookmarks, notes, highlights, isSaving, lastPage, totalPages,
        toggleBookmark, updateNote, addHighlight, removeHighlight, updateLastPage, updateTotalPages
    } = usePDFAnnotations(id);

    
    const [pageNumber, setPageNumber] = useState(1);
    const [inputPage, setInputPage] = useState(1);
    const [numPages, setNumPages] = useState(null);
    const [scale, setScale] = useState(window.innerWidth < 768 ? 0.6 : 1.2);
    const [isDoublePage, setIsDoublePage] = useState(false);
    const [activeTab, setActiveTab] = useState('translation');
    const [translation, setTranslation] = useState("");
    const [loadingTranslation, setLoadingTranslation] = useState(false);
    const [selectionMenu, setSelectionMenu] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [hasSelection, setHasSelection] = useState(false);
    const [readingStatus, setReadingStatus] = useState(null); // Estado para controlar se é 'lendo', 'concluido', etc.
    const initializedRef = useRef(false);

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

    // Restaura a última página lida ao carregar
    useEffect(() => {
        if (lastPage && lastPage > 1 && !initializedRef.current) {
            setPageNumber(lastPage);
            initializedRef.current = true;
        }
    }, [lastPage]);

    // Salva a página atual sempre que ela mudar
    useEffect(() => {
        if (pageNumber && pageNumber > 0) {
            updateLastPage(pageNumber);
        }
    }, [pageNumber]);

    // Resetar estado ao trocar de livro
    useEffect(() => {
        setPageNumber(1);
        initializedRef.current = false;
    }, [id]);

    // Busca o status inicial do livro na lista do usuário
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const response = await api.get('/my-list');
                const item = response.data.find(i => i.livro.id === parseInt(id));
                if (item) setReadingStatus(item.status);
            } catch (error) {
                console.error("Erro ao buscar status:", error);
            }
        };
        fetchStatus();
    }, [id]);

    // Atualiza o status automaticamente baseado no progresso
    useEffect(() => {
        if (!numPages) return;

        const updateStatus = async (newStatus) => {
            try {
                await api.put(`/my-list/${id}/status`, { status: newStatus });
                setReadingStatus(newStatus);
            } catch (error) { console.error("Erro ao atualizar status:", error); }
        };

        if (pageNumber > 1 && (!readingStatus || readingStatus === 'quero_ler')) updateStatus('lendo');
        else if (pageNumber === numPages && numPages > 1 && readingStatus === 'lendo') updateStatus('concluido');
    }, [pageNumber, numPages, readingStatus, id]);

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

    useEffect(() => {
        setInputPage(pageNumber);
    }, [pageNumber]);

    // Monitora mudanças na seleção (funciona melhor em mobile/tablet com handles nativos)
    useEffect(() => {
        const handleSelectionChange = () => {
            // Detecção imediata para aplicar o efeito de "foco" e reduzir o fantasma
            const selection = window.getSelection();
            // Verificação robusta: checa anchorNode E focusNode para garantir detecção em mobile
            // Em dispositivos móveis, o ponto de ancoragem pode variar dependendo da direção da seleção
            const isPdfSelection = selection && 
                                 selection.rangeCount > 0 && 
                                 !selection.isCollapsed && 
                                 mainRef.current && 
                                 (mainRef.current.contains(selection.anchorNode) || (selection.focusNode && mainRef.current.contains(selection.focusNode)));
            setHasSelection(!!isPdfSelection);

            if (isResizing) return;

            if (selectionTimeoutRef.current) {
                clearTimeout(selectionTimeoutRef.current);
            }

            // Delay para aguardar o fim do ajuste dos handles de seleção no mobile
            selectionTimeoutRef.current = setTimeout(() => {
                const selection = window.getSelection();
                if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
                    setSelectionMenu(null);
                    return;
                }

                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                if (rect.width === 0 || rect.height === 0) return;

                setSelectionMenu({ x: rect.left + (rect.width / 2), y: rect.top - 10, range: range });
            }, 500);
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, [isResizing]);

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

    const handleTranslateFromSelection = async () => {
        const selection = window.getSelection();
        const selectedText = selection.toString();
        
        if (!selectedText) {
            setTranslation("<p class='text-red-500'>Por favor, selecione um texto primeiro.</p>");
            return;
        }
        
        setLoadingTranslation(true);
        setTranslation("<div class='flex items-center justify-center h-full'><div class='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'></div></div>");
        
        try {
            // Copiar para clipboard
            await navigator.clipboard.writeText(selectedText);
            
            // Pequeno delay para o navegador processar a tradução
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Ler de volta (já traduzido pelo navegador)
            const translatedText = await navigator.clipboard.readText();
            
            // Exibir no painel lateral
            setTranslation(`<p class="whitespace-pre-wrap">${translatedText}</p>`);
        } catch (error) {
            console.error('Erro ao traduzir:', error);
            setTranslation(`<p class='text-red-500'>Erro ao traduzir: ${error.message}</p>`);
        } finally {
            setLoadingTranslation(false);
        }
    };

    const handleTranslate = () => {
        handleTranslateFromSelection();
    };

    const handlePageSubmit = (e) => {
        e.preventDefault();
        const page = parseInt(inputPage);
        if (page && page >= 1 && page <= (numPages || 1)) {
            setPageNumber(page);
        } else {
            setInputPage(pageNumber);
        }
    };

    // Lógica de Swipe para Mobile
    const touchStartX = useRef(null);
    const touchStartY = useRef(null);

    const handleTouchStart = (e) => {
        touchStartX.current = e.changedTouches[0].clientX;
        touchStartY.current = e.changedTouches[0].clientY;
    };

    const handleTouchEnd = (e) => {
        if (touchStartX.current === null) return;
        
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        
        const diffX = touchStartX.current - touchEndX;
        const diffY = touchStartY.current - touchEndY;

        touchStartX.current = null;
        touchStartY.current = null;

        if (window.getSelection().toString().length > 0) return; // Ignora se estiver selecionando texto
        if (Math.abs(diffY) > Math.abs(diffX)) return; // Ignora scroll vertical

        if (Math.abs(diffX) > 50) {
            if (diffX > 0) goToNextPage();
            else goToPrevPage();
        }
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
                <div className="fixed bg-white shadow-2xl rounded-full p-2 flex gap-2 border border-gray-200 z-[60]" style={{ left: Math.max(60, Math.min(window.innerWidth - 60, selectionMenu.x)), top: selectionMenu.y, transform: 'translate(-50%, -100%)' }}>
                    {HIGHLIGHT_COLORS.map(color => (
                        <button key={color.id} onClick={() => applyHighlight(color.hex, pageNumber)} className="w-8 h-8 md:w-8 md:h-8 rounded-full border border-gray-300 hover:scale-110 transition shadow-sm flex-shrink-0" style={{ backgroundColor: color.hex }} />
                    ))}
                    <button 
                        onClick={() => {
                            handleTranslateFromSelection();
                            setSelectionMenu(null);
                        }} 
                        className="w-8 h-8 md:w-8 md:h-8 rounded-full border border-blue-300 bg-blue-50 hover:bg-blue-100 hover:scale-110 transition shadow-sm flex items-center justify-center flex-shrink-0"
                        title="Traduzir seleção"
                        aria-label="Traduzir seleção"
                    >
                        <Languages size={16} className="text-blue-600" />
                    </button>
                    <button onClick={() => setSelectionMenu(null)} className="p-1 text-gray-500 hover:text-red-500 flex-shrink-0" aria-label="Fechar menu"><X size={18} /></button>
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
                    <form onSubmit={handlePageSubmit} className="flex items-center justify-center gap-1">
                        <input 
                            type="number" 
                            min={1} 
                            max={numPages || ''}
                            value={inputPage}
                            onChange={(e) => setInputPage(e.target.value)}
                            onBlur={handlePageSubmit}
                            className="w-12 bg-transparent text-center text-sm font-mono focus:outline-none text-white appearance-none m-0 border-b border-transparent focus:border-blue-500 transition-colors p-0"
                            style={{ 
                                MozAppearance: 'textfield', 
                                WebkitAppearance: 'none',
                                backgroundColor: 'transparent' 
                            }}
                        />
                        <span className="text-sm font-mono text-gray-400 select-none">/ {numPages || '--'}</span>
                    </form>
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
                <main ref={mainRef} className={`flex-1 bg-gray-600 overflow-auto p-4 flex justify-center select-text transition-all ${isResizing ? 'pointer-events-none' : ''} ${hasSelection ? 'selection-active' : ''}`} 
                      onScroll={() => setSelectionMenu(null)}
                      onContextMenu={(e) => e.preventDefault()}
                      onTouchStart={handleTouchStart}
                      onTouchEnd={handleTouchEnd}>
                    <Document 
                        file={pdfFile}
                        onLoadSuccess={({ numPages }) => {
                            setNumPages(numPages);
                            updateTotalPages(numPages); // Salva o total de páginas no JSON de anotações
                        }}
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
