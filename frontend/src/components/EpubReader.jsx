import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ePub from 'epubjs';
import {
    ArrowLeft, ChevronLeft, ChevronRight, BookOpen,
    Moon, Sun, Minus, Plus, List, X, Search
} from 'lucide-react';
import api from '../services/api';

const FONT_SIZES = [14, 16, 18, 20, 22, 24];
const THEMES = {
    light: { body: { background: '#ffffff', color: '#1a1a1a' } },
    sepia: { body: { background: '#f4ecd8', color: '#3b2f2f' } },
    dark:  { body: { background: '#1a1a2e', color: '#e0e0e0' } },
};

export default function EpubReader() {
    const { id } = useParams();
    const navigate = useNavigate();

    const viewerRef = useRef(null);
    const bookRef = useRef(null);
    const renditionRef = useRef(null);

    const [titulo, setTitulo] = useState('');
    const [toc, setToc] = useState([]);
    const [tocOpen, setTocOpen] = useState(false);
    const [currentChapter, setCurrentChapter] = useState('');
    const [progress, setProgress] = useState(0);       // 0-100
    const [fontSizeIdx, setFontSizeIdx] = useState(1); // índice em FONT_SIZES
    const [theme, setTheme] = useState('light');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const epubUrl = `${api.defaults.baseURL}/documents/${id}/epub`;
    const token = localStorage.getItem('token');

    // Cache local das anotações para não sobrescrever bookmarks/notes ao salvar progresso
    const annotationsRef = useRef({ bookmarks: [], notes: {}, highlights: {} });

    // Salva progresso no backend — mesmo formato do PDFReader (usePDFAnnotations)
    const saveProgress = useCallback(async (cfi, pct) => {
        try {
            await api.post(`/documents/${id}/annotations`, {
                ...annotationsRef.current,
                lastPage: Math.round(pct),   // % como "página" (0-100)
                totalPages: 100,
                lastCfi: cfi,                // posição exata no EPUB
            });
        } catch { /* silencia */ }
    }, [id]);

    useEffect(() => {
        if (!viewerRef.current) return;

        let book = null;
        let onKey = null;
        let cancelled = false;

        const init = async () => {
            // Baixa o EPUB como ArrayBuffer — epub.js descompacta em memória
            // sem tentar buscar arquivos internos no servidor (evita 404 em META-INF/*)
            let buffer;
            try {
                const res = await fetch(epubUrl, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                buffer = await res.arrayBuffer();
            } catch {
                if (!cancelled) { setLoading(false); setError('Não foi possível baixar o arquivo EPUB.'); }
                return;
            }

            if (cancelled) return;

            book = ePub(buffer);
            bookRef.current = book;

            const rendition = book.renderTo(viewerRef.current, {
                width: '100%',
                height: '100%',
                spread: 'none',
            });
            renditionRef.current = rendition;

            // Aplica tema e fonte
            Object.entries(THEMES).forEach(([name, styles]) => rendition.themes.register(name, styles));
            rendition.themes.select(theme);
            rendition.themes.fontSize(`${FONT_SIZES[fontSizeIdx]}px`);

            book.ready.then(async () => {
                if (cancelled) return;
                setLoading(false);

                // Título
                const meta = await book.loaded.metadata;
                setTitulo(meta.title || 'Livro');

                // TOC
                const nav = await book.loaded.navigation;
                setToc(nav.toc || []);

                // Carrega anotações existentes e retoma posição
                try {
                    const res = await api.get(`/documents/${id}/annotations`);
                    const data = res.data || {};
                    annotationsRef.current = {
                        bookmarks: data.bookmarks || [],
                        notes: data.notes || {},
                        highlights: data.highlights || {},
                    };
                    const cfi = data.lastCfi;
                    if (cfi) await rendition.display(cfi);
                    else await rendition.display();
                } catch {
                    await rendition.display();
                }
            });

            // Atualiza capítulo e progresso ao mudar página
            rendition.on('relocated', (location) => {
                const cfi = location.start.cfi;
                const pct = Math.round(book.locations.percentageFromCfi(cfi) * 100) || 0;
                setProgress(pct);
                setCurrentChapter(location.start.href || '');
                saveProgress(cfi, pct);
            });

            // Gera locations para cálculo de progresso
            book.ready.then(() => book.locations.generate(1024));

            // Navegação por teclado
            onKey = (e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') renditionRef.current?.next();
                if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   renditionRef.current?.prev();
            };
            window.addEventListener('keydown', onKey);

            book.on('openFailed', () => {
                if (!cancelled) { setLoading(false); setError('Não foi possível abrir o arquivo EPUB.'); }
            });
        };

        init();

        return () => {
            cancelled = true;
            if (onKey) window.removeEventListener('keydown', onKey);
            if (book) book.destroy();
        };
    }, [id]);

    // Atualiza tema
    useEffect(() => {
        renditionRef.current?.themes.select(theme);
    }, [theme]);

    // Atualiza fonte
    useEffect(() => {
        renditionRef.current?.themes.fontSize(`${FONT_SIZES[fontSizeIdx]}px`);
    }, [fontSizeIdx]);

    const nextPage = () => renditionRef.current?.next();
    const prevPage = () => renditionRef.current?.prev();

    const goToChapter = (href) => {
        renditionRef.current?.display(href);
        setTocOpen(false);
    };

    const themeOptions = [
        { key: 'light', icon: Sun,  label: 'Claro',  bg: 'bg-white border-gray-300 text-gray-800' },
        { key: 'sepia', icon: BookOpen, label: 'Sépia', bg: 'bg-amber-50 border-amber-300 text-amber-900' },
        { key: 'dark',  icon: Moon, label: 'Escuro', bg: 'bg-gray-900 border-gray-600 text-gray-100' },
    ];

    const viewerBg = theme === 'dark' ? '#1a1a2e' : theme === 'sepia' ? '#f4ecd8' : '#ffffff';

    return (
        <div className="flex flex-col h-screen" style={{ background: viewerBg }}>
            {/* Header */}
            <header className="flex items-center gap-2 px-3 py-2 border-b bg-white/90 backdrop-blur z-20 flex-shrink-0">
                <button
                    onClick={() => navigate(-1)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition flex-shrink-0"
                >
                    <ArrowLeft size={18} />
                </button>

                <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{titulo}</span>

                {/* Controles */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Índice */}
                    <button
                        onClick={() => setTocOpen(o => !o)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition"
                        title="Índice"
                    >
                        <List size={17} />
                    </button>

                    {/* Tema */}
                    {themeOptions.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTheme(t.key)}
                            className={`hidden sm:flex p-1.5 rounded-lg border transition ${
                                theme === t.key ? t.bg + ' shadow-sm' : 'hover:bg-gray-100 border-transparent text-gray-500'
                            }`}
                            title={t.label}
                        >
                            <t.icon size={15} />
                        </button>
                    ))}

                    {/* Tamanho de fonte */}
                    <button
                        onClick={() => setFontSizeIdx(i => Math.max(0, i - 1))}
                        disabled={fontSizeIdx === 0}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition disabled:opacity-30"
                        title="Diminuir fonte"
                    >
                        <Minus size={15} />
                    </button>
                    <span className="text-xs text-gray-500 w-6 text-center">{FONT_SIZES[fontSizeIdx]}</span>
                    <button
                        onClick={() => setFontSizeIdx(i => Math.min(FONT_SIZES.length - 1, i + 1))}
                        disabled={fontSizeIdx === FONT_SIZES.length - 1}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition disabled:opacity-30"
                        title="Aumentar fonte"
                    >
                        <Plus size={15} />
                    </button>
                </div>
            </header>

            {/* Barra de progresso */}
            <div className="h-0.5 bg-gray-200 flex-shrink-0">
                <div
                    className="h-0.5 bg-blue-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Corpo */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Painel TOC */}
                {tocOpen && (
                    <div className="absolute left-0 top-0 h-full w-72 bg-white border-r shadow-xl z-30 flex flex-col">
                        <div className="flex items-center justify-between p-3 border-b">
                            <span className="text-sm font-semibold text-gray-800">Índice</span>
                            <button onClick={() => setTocOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
                            {toc.map((item, i) => (
                                <button
                                    key={i}
                                    onClick={() => goToChapter(item.href)}
                                    className={`w-full text-left text-sm px-3 py-2 rounded-lg transition ${
                                        currentChapter === item.href
                                            ? 'bg-blue-50 text-blue-700 font-medium'
                                            : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Botão Anterior */}
                <button
                    onClick={prevPage}
                    className="absolute left-0 top-0 h-full w-12 sm:w-16 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 transition z-10"
                    aria-label="Página anterior"
                >
                    <ChevronLeft size={28} />
                </button>

                {/* Viewer */}
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                        <div className="flex flex-col items-center gap-3">
                            <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                            <span className="text-sm text-gray-500">Carregando livro...</span>
                        </div>
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center z-20">
                        <div className="text-center text-red-500 px-8">
                            <p className="font-semibold mb-1">Erro ao abrir o livro</p>
                            <p className="text-sm text-gray-500">{error}</p>
                        </div>
                    </div>
                )}
                <div
                    ref={viewerRef}
                    className="flex-1 h-full px-12 sm:px-16"
                    style={{ background: viewerBg }}
                />

                {/* Botão Próximo */}
                <button
                    onClick={nextPage}
                    className="absolute right-0 top-0 h-full w-12 sm:w-16 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 transition z-10"
                    aria-label="Próxima página"
                >
                    <ChevronRight size={28} />
                </button>
            </div>

            {/* Footer com progresso */}
            <div className="flex items-center justify-center gap-3 px-4 py-1.5 border-t bg-white/80 backdrop-blur text-xs text-gray-400 flex-shrink-0">
                <span>{progress}% concluído</span>
            </div>
        </div>
    );
}
