import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import {
    ArrowLeft, ZoomIn, ZoomOut, Bookmark, Maximize, Minimize,
    X, Languages, FileText, ChevronLeft, ChevronRight,
    Columns, Square, PanelRightClose, PanelRightOpen, Bot, Volume2,
    Expand, Search
} from 'lucide-react';

import api from '../services/api';
import { useSidebarResizer } from '../hooks/useSidebarResizer';
import { usePDFAnnotations } from '../hooks/usePDFAnnotations';
import { TranslationTab, NotesTab } from './Reader/SidebarTabs';
import AITab from './Reader/AITab';

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
    const isResettingRef = useRef(false);
    const pdfDocRef = useRef(null);

    const { sidebarWidth, isResizing, startResizing } = useSidebarResizer(400);
    const {
        bookmarks, notes, highlights, isSaving, lastPage, totalPages,
        toggleBookmark, updateNote, addHighlight, removeHighlight, updateLastPage, updateTotalPages
    } = usePDFAnnotations(id);

    
    const [pageNumber, setPageNumber] = useState(1);
    const [inputPage, setInputPage] = useState(1);
    const [numPages, setNumPages] = useState(null);
    const [scale, setScale] = useState(() => {
        const savedScale = localStorage.getItem('pdf_scale');
        return savedScale ? parseFloat(savedScale) : (window.innerWidth < 768 ? 0.6 : 1.2);
    });
    const [isDoublePage, setIsDoublePage] = useState(() => {
        const savedDoublePage = localStorage.getItem('pdf_double_page');
        return savedDoublePage === 'true';
    });
    const [fitToWidth, setFitToWidth] = useState(false);
    const [activeTab, setActiveTab] = useState('translation');
    const [translation, setTranslation] = useState("");
    const [loadingTranslation, setLoadingTranslation] = useState(false);
    const [selectionMenu, setSelectionMenu] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        const savedSidebar = localStorage.getItem('pdf_sidebar');
        if (savedSidebar === 'true') return true;
        if (savedSidebar === 'false') return false;
        return window.innerWidth >= 1024;
    });
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [hasSelection, setHasSelection] = useState(false);
    const [readingStatus, setReadingStatus] = useState(null); // Estado para controlar se é 'lendo', 'concluido', etc.
    const [currentPageText, setCurrentPageText] = useState(''); // Texto da página atual para TTS
    const [searchQuery, setSearchQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [searchIdx, setSearchIdx] = useState(0);
    const [searchLoading, setSearchLoading] = useState(false);
    const [pdfError, setPdfError] = useState(false);
    const [pageVisible, setPageVisible] = useState(true);
    const initializedRef = useRef(false);
    const selectionAudioRef = useRef(null);

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
        if (isResettingRef.current) {
            isResettingRef.current = false;
            return;
        }
        if (pageNumber && pageNumber > 0) {
            updateLastPage(pageNumber);
        }
    }, [pageNumber]);

    // Resetar estado ao trocar de livro
    useEffect(() => {
        isResettingRef.current = true;
        setPageNumber(1);
        initializedRef.current = false;
    }, [id]);

    useEffect(() => {
        localStorage.setItem('pdf_scale', scale);
    }, [scale]);

    useEffect(() => {
        localStorage.setItem('pdf_sidebar', isSidebarOpen);
    }, [isSidebarOpen]);

    useEffect(() => {
        localStorage.setItem('pdf_double_page', isDoublePage);
    }, [isDoublePage]);

    // Extrai texto da página atual para TTS (lê do text layer do react-pdf)
    useEffect(() => {
        const timer = setTimeout(() => {
            const textLayer = document.querySelector(
                `.react-pdf__Page__textContent`
            );
            if (textLayer) {
                setCurrentPageText(textLayer.textContent || '');
            }
        }, 600);
        return () => clearTimeout(timer);
    }, [pageNumber]);

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
        if (mainRef.current) mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        setPageVisible(false);
        const fadeTimer = setTimeout(() => setPageVisible(true), 150);
        return () => clearTimeout(fadeTimer);
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

    const handleTTSFromSelection = async () => {
        const text = window.getSelection()?.toString()?.trim();
        if (!text) return;
        setSelectionMenu(null);

        // Para áudio anterior se houver
        if (selectionAudioRef.current) {
            selectionAudioRef.current.pause();
            selectionAudioRef.current = null;
        }

        try {
            const res = await fetch(`${api.defaults.baseURL}/ai/tts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ text, voice: 'Francisca', rate: 1.0 }),
            });
            if (!res.ok) return;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            selectionAudioRef.current = audio;
            audio.onended = () => URL.revokeObjectURL(url);
            audio.play();
        } catch (e) {
            console.error('TTS seleção:', e);
        }
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

    const handleFitToWidth = () => {
        if (!mainRef.current) return;
        const containerWidth = mainRef.current.clientWidth - 32;
        const newScale = Math.round((containerWidth / 600) * 100) / 100;
        setScale(Math.min(3.0, Math.max(0.3, newScale)));
        setFitToWidth(true);
    };

    const handleSearch = async () => {
        if (!searchQuery.trim() || !pdfDocRef.current) return;
        setSearchLoading(true);
        setSearchResults([]);
        const results = [];

        for (let p = 1; p <= pdfDocRef.current.numPages; p++) {
            try {
                const page = await pdfDocRef.current.getPage(p);
                const content = await page.getTextContent();
                const text = content.items.map(i => i.str).join(' ');
                const q = searchQuery.toLowerCase();
                const lowerText = text.toLowerCase();

                if (lowerText.includes(q)) {
                    const idx = lowerText.indexOf(q);
                    const snippet = text.substring(Math.max(0, idx - 30), idx + q.length + 30);
                    results.push({ page: p, snippet });
                }
            } catch {
                // Ignora paginas que falharem na extracao de texto
            }
        }

        setSearchResults(results);
        setSearchIdx(0);
        if (results.length > 0) setPageNumber(results[0].page);
        setSearchLoading(false);
    };

    const goToSearchResult = (dir) => {
        const next = (searchIdx + dir + searchResults.length) % searchResults.length;
        setSearchIdx(next);
        setPageNumber(searchResults[next].page);
    };

    // Desabilita zoom nativo do browser enquanto o PDFReader está montado
    useEffect(() => {
        const metaViewport = document.querySelector('meta[name="viewport"]');
        const original = metaViewport?.getAttribute('content') ?? 'width=device-width, initial-scale=1.0';
        metaViewport?.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        return () => metaViewport?.setAttribute('content', original);
    }, []);

    // Refs para touch (swipe + pinch) — listeners nativos
    const touchStartX = useRef(null);
    const touchStartY = useRef(null);
    const pinchStartDist = useRef(null);
    const pinchStartScale = useRef(null);
    const pinchCurrentRatio = useRef(1);
    const scaleRef = useRef(scale);
    useEffect(() => { scaleRef.current = scale; }, [scale]);

    useEffect(() => {
        const el = mainRef.current;
        if (!el) return;

        // O container do PDF dentro da main (primeiro filho do Document)
        const getPdfContainer = () => el.querySelector('.react-pdf__Document');
        const getPinchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

        const onTouchStart = (e) => {
            if (e.touches.length === 2) {
                pinchStartDist.current = getPinchDist(e.touches);
                pinchStartScale.current = scaleRef.current;
                pinchCurrentRatio.current = 1;
                touchStartX.current = null;
                return;
            }
            touchStartX.current = e.changedTouches[0].clientX;
            touchStartY.current = e.changedTouches[0].clientY;
        };

        const onTouchMove = (e) => {
            if (e.touches.length === 2 && pinchStartDist.current !== null) {
                e.preventDefault();
                const ratio = getPinchDist(e.touches) / pinchStartDist.current;
                pinchCurrentRatio.current = ratio;
                // Aplica transform CSS diretamente — sem re-render React
                const pdfEl = getPdfContainer();
                if (pdfEl) {
                    pdfEl.style.transform = `scale(${ratio})`;
                    pdfEl.style.transformOrigin = 'center top';
                    pdfEl.style.transition = 'none';
                }
            }
        };

        const onTouchEnd = (e) => {
            if (pinchStartDist.current !== null) {
                // Commita o zoom real — remove transform e re-renderiza PDF na escala correta
                const pdfEl = getPdfContainer();
                if (pdfEl) {
                    pdfEl.style.transform = '';
                    pdfEl.style.transition = '';
                }
                const finalScale = Math.min(3.0, Math.max(0.5,
                    pinchStartScale.current * pinchCurrentRatio.current
                ));
                setScale(Math.round(finalScale * 100) / 100);
                pinchStartDist.current = null;
                pinchStartScale.current = null;
                pinchCurrentRatio.current = 1;
                return;
            }
            if (touchStartX.current === null) return;
            const diffX = touchStartX.current - e.changedTouches[0].clientX;
            const diffY = touchStartY.current - e.changedTouches[0].clientY;
            touchStartX.current = null;
            touchStartY.current = null;
            if (window.getSelection().toString().length > 0) return;
            if (Math.abs(diffY) > Math.abs(diffX)) return;
            if (Math.abs(diffX) > 50) {
                if (diffX > 0) goToNextPage();
                else goToPrevPage();
            }
        };

        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd, { passive: true });
        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
                <div className="fixed bg-white shadow-2xl rounded-full p-2 flex gap-2 border border-gray-200 z-[60]" style={{ left: Math.max(60, Math.min(window.innerWidth - 60, selectionMenu.x)), top: Math.max(70, selectionMenu.y), transform: 'translate(-50%, -100%)' }}>
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
                    <button
                        onClick={handleTTSFromSelection}
                        className="w-8 h-8 md:w-8 md:h-8 rounded-full border border-green-300 bg-green-50 hover:bg-green-100 hover:scale-110 transition shadow-sm flex items-center justify-center flex-shrink-0"
                        title="Ouvir seleção"
                        aria-label="Ouvir seleção"
                    >
                        <Volume2 size={16} className="text-green-600" />
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
                    <button
                        onClick={() => setSearchOpen(!searchOpen)}
                        className={`p-2 hover:bg-gray-700 rounded-lg transition ${searchOpen ? 'bg-blue-600 text-white' : ''}`}
                    >
                        <Search size={18} />
                    </button>
                </div>

                <div className="flex items-center gap-1 md:gap-4 bg-gray-900/50 px-2 py-1.5 rounded-full border border-gray-700">
                    <button onClick={goToPrevPage} disabled={pageNumber <= 1} className="p-1 hover:text-blue-400 disabled:opacity-30">
                        <ChevronLeft size={22} />
                    </button>
                    <form onSubmit={handlePageSubmit} className="flex items-center justify-center gap-1 flex-nowrap whitespace-nowrap">
                        <input
                            type="number"
                            min={1}
                            max={numPages || ''}
                            value={inputPage}
                            onChange={(e) => setInputPage(e.target.value)}
                            onBlur={handlePageSubmit}
                            className="w-10 bg-transparent text-center text-sm font-mono focus:outline-none text-white appearance-none m-0 border-b border-transparent focus:border-blue-500 transition-colors p-0 flex-shrink-0"
                            style={{
                                MozAppearance: 'textfield',
                                WebkitAppearance: 'none',
                                backgroundColor: 'transparent'
                            }}
                        />
                        <span className="text-sm font-mono text-gray-400 select-none flex-shrink-0 whitespace-nowrap">/ {numPages || '--'}</span>
                    </form>
                    <button onClick={goToNextPage} disabled={pageNumber >= numPages} className="p-1 hover:text-blue-400 disabled:opacity-30">
                        <ChevronRight size={22} />
                    </button>
                </div>

                <div className="flex items-center gap-1 md:gap-2">
                    <div className="hidden sm:flex items-center gap-1 bg-gray-900 rounded-lg px-1 md:px-2">
                        <button onClick={() => { setScale(s => Math.max(0.3, s - 0.15)); setFitToWidth(false); }} className="p-1.5 hover:text-blue-400"><ZoomOut size={16} /></button>
                        <button onClick={() => { setScale(s => Math.min(3.0, s + 0.15)); setFitToWidth(false); }} className="p-1.5 hover:text-blue-400"><ZoomIn size={16} /></button>
                        <button onClick={handleFitToWidth} className={`hidden sm:flex p-1.5 hover:text-blue-400 text-xs font-mono ${fitToWidth ? 'text-blue-400' : ''}`} title="Ajustar largura"><Expand size={16} /></button>
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

            {searchOpen && (
                <div className="fixed top-14 left-0 right-0 z-40 bg-gray-800 border-b border-gray-700 px-4 py-2">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSearch();
                            }}
                            placeholder="Buscar no documento..."
                            className="flex-1 bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button onClick={handleSearch} disabled={searchLoading} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                            Buscar
                        </button>
                        {searchLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400" />}
                        {searchResults.length > 0 && !searchLoading && (
                            <>
                                <span className="text-gray-400 text-sm">{searchIdx + 1} / {searchResults.length}</span>
                                <button onClick={() => goToSearchResult(-1)} className="p-1 text-gray-400 hover:text-white"><ChevronLeft size={16} /></button>
                                <button onClick={() => goToSearchResult(1)} className="p-1 text-gray-400 hover:text-white"><ChevronRight size={16} /></button>
                            </>
                        )}
                        {searchResults.length === 0 && !searchLoading && searchQuery !== '' && (
                            <span className="text-gray-500 text-sm">Nenhum resultado</span>
                        )}
                        <button onClick={() => setSearchOpen(false)} className="p-1 text-gray-400 hover:text-white"><X size={16} /></button>
                    </div>
                </div>
            )}

            <div className={`flex w-full h-full ${searchOpen ? 'pt-28' : 'pt-14'}`}>
                <main ref={mainRef} className={`flex-1 bg-gray-600 overflow-auto p-4 flex justify-center select-text transition-all ${isResizing ? 'pointer-events-none' : ''} ${hasSelection ? 'selection-active' : ''}`}
                      style={{ touchAction: 'pan-y' }}
                      onScroll={() => setSelectionMenu(null)}
                      onContextMenu={(e) => e.preventDefault()}>
                    {pdfError ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4">
                            <p className="text-gray-300">Erro ao carregar o PDF. Tente reabrir o documento.</p>
                            <button onClick={() => setPdfError(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                Tentar novamente
                            </button>
                        </div>
                    ) : (
                    <Document
                        file={pdfFile}
                        onLoadSuccess={(pdf) => {
                            setNumPages(pdf.numPages);
                            updateTotalPages(pdf.numPages); // Salva o total de páginas no JSON de anotações
                            pdfDocRef.current = pdf;
                        }}
                        onLoadError={(error) => { console.error('PDF load error:', error); setPdfError(true); }}
                        loading={<div className="text-white mt-20 font-medium">A carregar biblioteca...</div>}
                    >
                        <div className={`flex gap-4 ${isDoublePage ? 'max-w-none' : 'max-w-4xl'}`} style={{ opacity: pageVisible ? 1 : 0, transition: 'opacity 0.2s ease-in' }}>
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
                    )}
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
                        <button onClick={() => setActiveTab('translation')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-0.5 text-xs ${activeTab === 'translation' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 font-bold' : 'text-gray-500'}`}>
                            <Languages size={16} /> <span>Tradução</span>
                        </button>
                        <button onClick={() => setActiveTab('notes')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-0.5 text-xs ${activeTab === 'notes' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 font-bold' : 'text-gray-500'}`}>
                            <FileText size={16} /> <span>Notas</span>
                        </button>
                        <button onClick={() => setActiveTab('ai')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-0.5 text-xs ${activeTab === 'ai' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 font-bold' : 'text-gray-500'}`}>
                            <Bot size={16} /> <span>IA</span>
                        </button>
                    </div>
                    <div className="flex-1 p-4 bg-gray-50 overflow-hidden flex flex-col">
                        {activeTab === 'translation' && (
                            <TranslationTab pageNumber={pageNumber} translation={translation} loadingTranslation={loadingTranslation} handleTranslate={handleTranslate} />
                        )}
                        {activeTab === 'ai' && (
                            <AITab livroId={id} pageNumber={pageNumber} pageText={currentPageText} />
                        )}
                        {activeTab === 'notes' && (
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
