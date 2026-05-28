import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, BookOpen, Bot, Send, Loader2, AlertCircle,
    CheckCircle, GraduationCap, FileQuestion, Layers, Map,
    Headphones, Plus, Trash2, Play, Pause, Square, Volume2,
    RefreshCw, Menu, X, ChevronLeft, ChevronRight, RotateCcw,
    ChevronDown, Save
} from 'lucide-react';
import api from '../services/api';
import { toast } from '../utils/toast';

// ─── ARTIFACT TYPES ───────────────────────────────────────────────────────────
const ARTIFACT_TYPES = [
    {
        id: 'quiz',
        label: 'Teste / Quiz',
        desc: 'Questões de múltipla escolha com gabarito',
        icon: FileQuestion,
        color: 'purple',
    },
    {
        id: 'flashcards',
        label: 'Cartões Didáticos',
        desc: 'Flashcards frente e verso para revisão',
        icon: Layers,
        color: 'green',
    },
    {
        id: 'mindmap',
        label: 'Mapa Mental',
        desc: 'Estrutura hierárquica de tópicos',
        icon: Map,
        color: 'orange',
    },
    {
        id: 'audio_resumo',
        label: 'Resumo em Áudio',
        desc: 'Resumo narrado por voz neural',
        icon: Headphones,
        color: 'blue',
    },
];

const COLOR_MAP = {
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    green:  'bg-green-100 text-green-700 border-green-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    blue:   'bg-blue-100 text-blue-700 border-blue-200',
};
const BTN_COLOR_MAP = {
    purple: 'bg-purple-600 hover:bg-purple-700',
    green:  'bg-green-600 hover:bg-green-700',
    orange: 'bg-orange-500 hover:bg-orange-600',
    blue:   'bg-blue-600 hover:bg-blue-700',
};

// ─── QUIZ RESULT ──────────────────────────────────────────────────────────────
const QuizResult = ({ questions }) => {
    const [revealed, setRevealed] = useState(new Set());
    const toggle = (i) =>
        setRevealed((prev) => {
            const next = new Set(prev);
            next.has(i) ? next.delete(i) : next.add(i);
            return next;
        });

    return (
        <div className="space-y-4">
            {questions.map((q, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="font-semibold text-gray-800 mb-3">
                        {i + 1}. {q.question}
                    </p>
                    <div className="space-y-1">
                        {q.options.map((opt, j) => (
                            <div
                                key={j}
                                className={`text-sm px-3 py-2 rounded-lg ${
                                    revealed.has(i) && j === q.answer_index
                                        ? 'bg-green-100 text-green-800 font-semibold'
                                        : 'bg-gray-50 text-gray-700'
                                }`}
                            >
                                {opt}
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => toggle(i)}
                        className="mt-3 text-xs text-purple-600 hover:text-purple-800 font-semibold"
                    >
                        {revealed.has(i) ? 'Ocultar resposta' : 'Revelar resposta'}
                    </button>
                    {revealed.has(i) && q.explanation && (
                        <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
                            💡 {q.explanation}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
};

// ─── FLASHCARDS RESULT ────────────────────────────────────────────────────────
const FlashcardsResult = ({ cards }) => {
    const [index, setIndex]       = useState(0);
    const [flipped, setFlipped]   = useState(false);
    const [correct, setCorrect]   = useState(0);
    const [wrong, setWrong]       = useState(0);
    const [answered, setAnswered] = useState(new Set());
    const [finished, setFinished] = useState(false);

    const total = cards.length;
    const card  = cards[index];

    const goTo   = (i) => { setIndex(i); setFlipped(false); };
    const goPrev = () => { if (index > 0) goTo(index - 1); };
    const goNext = () => {
        if (index < total - 1) goTo(index + 1);
        else setFinished(true);
    };

    const mark = (isCorrect) => {
        if (!answered.has(index)) {
            setAnswered((p) => new Set([...p, index]));
            if (isCorrect) setCorrect((c) => c + 1);
            else setWrong((w) => w + 1);
        }
        goNext();
    };

    const reset = () => {
        setIndex(0); setFlipped(false);
        setCorrect(0); setWrong(0);
        setAnswered(new Set()); setFinished(false);
    };

    if (!total) return <p className="text-sm text-gray-400 py-4 text-center">Nenhum cartão gerado.</p>;

    if (finished) return (
        <div className="text-center py-10 space-y-5">
            <p className="text-4xl">🎉</p>
            <p className="font-bold text-gray-800 text-lg">Sessão concluída!</p>
            <div className="flex justify-center gap-8 text-base">
                <span className="text-green-600 font-bold">✅ {correct} certos</span>
                <span className="text-red-500 font-bold">❌ {wrong} erros</span>
            </div>
            <p className="text-xs text-gray-400">
                Aproveitamento: {total > 0 ? Math.round((correct / total) * 100) : 0}%
            </p>
            <button
                onClick={reset}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition"
            >
                <RotateCcw size={15} /> Reiniciar
            </button>
        </div>
    );

    return (
        <div className="select-none space-y-4">
            {/* Score + contador */}
            <div className="flex items-center justify-between text-sm">
                <div className="flex gap-5">
                    <span className="text-red-500 font-bold">❌ {wrong}</span>
                    <span className="text-green-600 font-bold">✅ {correct}</span>
                </div>
                <span className="text-gray-400 font-medium tabular-nums">{index + 1} / {total}</span>
            </div>

            {/* Cartão — clica para virar */}
            <div className="flex justify-center py-2">
                <div
                    onClick={() => setFlipped((f) => !f)}
                    style={{ width: '480px', maxWidth: '100%', minHeight: '320px' }}
                    className={`rounded-2xl shadow-2xl flex flex-col items-center justify-center text-center px-10 py-12 cursor-pointer transition-colors duration-300 ${
                        flipped ? 'bg-slate-700 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                >
                    <p className={`text-xs uppercase tracking-widest mb-4 font-semibold ${flipped ? 'text-purple-300' : 'text-gray-500'}`}>
                        {flipped ? 'Resposta' : 'Pergunta'}
                    </p>
                    <p className="text-xl font-semibold leading-relaxed">
                        {flipped ? card.verso : card.frente}
                    </p>
                    {!flipped && (
                        <p className="text-xs text-gray-600 mt-8">Clique para ver a resposta</p>
                    )}
                </div>
            </div>

            {/* Ações */}
            <div className="flex justify-center">
                <div style={{ width: '480px', maxWidth: '100%' }}>
                    {!flipped ? (
                        <button
                            onClick={() => setFlipped(true)}
                            className="w-full py-3 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition"
                        >
                            Ver a resposta
                        </button>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => mark(false)}
                                className="py-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 active:scale-95 transition"
                            >
                                ❌ Errei
                            </button>
                            <button
                                onClick={() => mark(true)}
                                className="py-3 bg-green-50 border border-green-200 text-green-600 rounded-xl text-sm font-bold hover:bg-green-100 active:scale-95 transition"
                            >
                                ✅ Acertei
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Navegação: ← dots → */}
            <div className="flex items-center justify-between">
                <button
                    onClick={goPrev}
                    disabled={index === 0}
                    className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 disabled:opacity-20 transition"
                >
                    <ChevronLeft size={22} />
                </button>

                {total <= 20 ? (
                    <div className="flex gap-1.5 flex-wrap justify-center">
                        {cards.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => goTo(i)}
                                className={`w-2 h-2 rounded-full transition-all ${
                                    i === index
                                        ? 'bg-purple-600 scale-125'
                                        : answered.has(i)
                                        ? 'bg-green-400'
                                        : 'bg-gray-300'
                                }`}
                            />
                        ))}
                    </div>
                ) : (
                    <button
                        onClick={reset}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-600 transition"
                    >
                        <RotateCcw size={12} /> Reiniciar
                    </button>
                )}

                <button
                    onClick={goNext}
                    disabled={index === total - 1 && answered.size === total}
                    className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 disabled:opacity-20 transition"
                >
                    <ChevronRight size={22} />
                </button>
            </div>
        </div>
    );
};

// ─── AUDIO RESUMO RESULT ──────────────────────────────────────────────────────
const AudioResumoResult = ({ text }) => {
    const [playing, setPlaying] = useState(false);
    const [paused, setPaused] = useState(false);
    const [loading, setLoading] = useState(false);
    const audioRef = useRef(null);

    const stopAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current = null;
        }
        setPlaying(false);
        setPaused(false);
        setLoading(false);
    };

    const play = async () => {
        stopAudio();
        setLoading(true);
        try {
            const res = await fetch(`${api.defaults.baseURL}/ai/tts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ text, voice: 'Francisca', rate: 1.0 }),
            });
            if (!res.ok) throw new Error('Erro ao gerar áudio');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onplay   = () => { setPlaying(true); setPaused(false); setLoading(false); };
            audio.onpause  = () => setPaused(true);
            audio.onended  = () => { setPlaying(false); setPaused(false); URL.revokeObjectURL(url); };
            await audio.play();
        } catch (e) {
            setLoading(false);
        }
    };

    const togglePause = () => {
        if (!audioRef.current) return;
        if (audioRef.current.paused) {
            audioRef.current.play();
            setPaused(false);
        } else {
            audioRef.current.pause();
            setPaused(true);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {text}
            </div>
            <div className="flex gap-2">
                {!playing && !loading && (
                    <button
                        onClick={play}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
                    >
                        <Volume2 size={16} /> Ouvir Resumo
                    </button>
                )}
                {loading && (
                    <button disabled className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm opacity-70">
                        <Loader2 size={16} className="animate-spin" /> Gerando áudio…
                    </button>
                )}
                {playing && (
                    <>
                        <button
                            onClick={togglePause}
                            className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-xl text-sm font-semibold hover:bg-yellow-600 transition"
                        >
                            {paused ? <Play size={16} /> : <Pause size={16} />}
                            {paused ? 'Continuar' : 'Pausar'}
                        </button>
                        <button
                            onClick={stopAudio}
                            className="px-3 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition"
                        >
                            <Square size={16} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

// ─── MAIN ESTUDIO COMPONENT ───────────────────────────────────────────────────
const Estudio = () => {
    const { id } = useParams();
    const livroId = parseInt(id, 10);
    const navigate = useNavigate();

    // Book & chapters
    const [livro, setLivro] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [hasApiToc, setHasApiToc] = useState(false);
    const [chaptersLoading, setChaptersLoading] = useState(true);

    // Chapter selection
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [manualChapters, setManualChapters] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newChapter, setNewChapter] = useState({ title: '', page_start: '', page_end: '' });

    // UI state
    const [tab, setTab] = useState('chat');          // 'chat' | 'artifacts'
    const [sidebarOpen, setSidebarOpen] = useState(true);

    // Chat state
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const bottomRef = useRef(null);

    // Artifact state: { tipo: { loading, result, error } }
    const [artifacts, setArtifacts] = useState({});
    const [expandedArtifacts, setExpandedArtifacts] = useState(new Set());
    // { tipo: { saved_at: "ISO" } }
    const [savedInfo, setSavedInfo] = useState({});
    const [savingArtifact, setSavingArtifact] = useState(new Set());

    const toggleArtifact = (id) =>
        setExpandedArtifacts((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    // ─── Carrega artefatos salvos no banco ao abrir ──────────────────────────
    useEffect(() => {
        api.get(`/ai/estudio/${livroId}/artifacts`)
            .then((r) => {
                if (!r.data.length) return;
                const info = {};
                const restored = {};
                r.data.forEach(({ tipo, conteudo, saved_at }) => {
                    info[tipo] = { saved_at };
                    restored[tipo] = { result: conteudo, loading: false, error: null };
                });
                setSavedInfo(info);
                setArtifacts(restored);
                setExpandedArtifacts(new Set(Object.keys(restored)));
            })
            .catch(() => {});
    }, [livroId]);

    const handleSaveArtifact = async (tipo) => {
        const state = artifacts[tipo];
        if (!state?.result) return;
        setSavingArtifact((p) => new Set([...p, tipo]));
        try {
            const { data } = await api.post(`/ai/estudio/${livroId}/artifacts/${tipo}`, {
                conteudo: state.result,
            });
            setSavedInfo((p) => ({ ...p, [tipo]: { saved_at: data.saved_at } }));
        } catch {
            toast.error('Erro ao salvar artefato.');
        } finally {
            setSavingArtifact((p) => { const n = new Set(p); n.delete(tipo); return n; });
        }
    };

    const handleDeleteArtifact = async (tipo) => {
        try {
            await api.delete(`/ai/estudio/${livroId}/artifacts/${tipo}`);
            setSavedInfo((p) => { const n = { ...p }; delete n[tipo]; return n; });
        } catch {
            toast.error('Erro ao remover.');
        }
    };

    const formatSavedAt = (iso) => {
        try {
            return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        } catch { return ''; }
    };

    // ─── Derived ────────────────────────────────────────────────────────────
    const allChapters = [...chapters, ...manualChapters];
    const selectedList = allChapters.filter((c) => selectedIds.has(c.id));
    const totalSelectedPages = selectedList.reduce(
        (sum, c) => sum + Math.max(0, c.page_end - c.page_start + 1),
        0
    );
    const pageRanges = selectedList.map((c) => ({ start: c.page_start, end: c.page_end }));

    // ─── Load book info ──────────────────────────────────────────────────────
    useEffect(() => {
        api.get(`/documents/${livroId}/details`)
            .then((r) => setLivro(r.data))
            .catch(() => navigate('/'));
    }, [livroId, navigate]);

    // ─── Load chapters ───────────────────────────────────────────────────────
    useEffect(() => {
        setChaptersLoading(true);
        api.get(`/ai/estudio/${livroId}/chapters`)
            .then((r) => {
                setChapters(r.data.chapters || []);
                setHasApiToc(r.data.has_toc || false);
            })
            .catch(() => setChapters([]))
            .finally(() => setChaptersLoading(false));
    }, [livroId]);

    // Auto-scroll chat
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ─── Chapter helpers ─────────────────────────────────────────────────────
    const toggleSelect = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const selectAll = () => setSelectedIds(new Set(allChapters.map((c) => c.id)));
    const clearAll  = () => setSelectedIds(new Set());
    const allSelected = allChapters.length > 0 && selectedIds.size === allChapters.length;

    const addManualChapter = () => {
        const title = newChapter.title.trim();
        const ps = parseInt(newChapter.page_start, 10);
        const pe = parseInt(newChapter.page_end, 10);
        if (!title || isNaN(ps) || isNaN(pe) || ps > pe) return;
        const id = 10000 + Date.now();
        setManualChapters((prev) => [...prev, { id, title, level: 1, page_start: ps, page_end: pe }]);
        setSelectedIds((prev) => new Set([...prev, id]));
        setNewChapter({ title: '', page_start: '', page_end: '' });
        setShowAddForm(false);
    };

    const removeManualChapter = (id) => {
        setManualChapters((prev) => prev.filter((c) => c.id !== id));
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    // ─── Send chat message ────────────────────────────────────────────────────
    const sendMessage = async () => {
        if (!input.trim() || chatLoading) return;
        const userMsg = { role: 'user', content: input.trim() };
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '', loading: true }]);
        setInput('');
        setChatLoading(true);

        try {
            const response = await fetch(
                `${api.defaults.baseURL}/ai/chat/${livroId}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${localStorage.getItem('token')}`,
                    },
                    body: JSON.stringify({
                        message: userMsg.content,
                        history,
                        page_ranges: pageRanges,
                    }),
                }
            );

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantText = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error)       assistantText = parsed.error;
                        else if (parsed.token)  assistantText += parsed.token;
                        setMessages((prev) => {
                            const updated = [...prev];
                            updated[updated.length - 1] = { role: 'assistant', content: assistantText, loading: false };
                            return updated;
                        });
                    } catch {}
                }
            }
        } catch (e) {
            setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: `Erro: ${e.message}`, loading: false };
                return updated;
            });
        } finally {
            setChatLoading(false);
        }
    };

    // ─── Generate artifact ────────────────────────────────────────────────────
    const generateArtifact = async (tipo) => {
        setArtifacts((prev) => ({ ...prev, [tipo]: { loading: true, result: null, error: null } }));
        // Auto-expand when starting generation
        setExpandedArtifacts((prev) => new Set([...prev, tipo]));

        if (tipo === 'audio_resumo') {
            // SSE stream
            try {
                const response = await fetch(
                    `${api.defaults.baseURL}/ai/estudio/${livroId}/artifact`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${localStorage.getItem('token')}`,
                        },
                        body: JSON.stringify({ tipo, page_ranges: pageRanges }),
                    }
                );
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let text = '';
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const data = line.slice(6);
                        if (data === '[DONE]') break;
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.error)      { setArtifacts((p) => ({ ...p, [tipo]: { loading: false, result: null, error: parsed.error } })); return; }
                            if (parsed.token)      text += parsed.token;
                            setArtifacts((p) => ({ ...p, [tipo]: { loading: false, result: text, error: null } }));
                        } catch {}
                    }
                }
            } catch (e) {
                setArtifacts((prev) => ({ ...prev, [tipo]: { loading: false, result: null, error: e.message } }));
            }
        } else {
            // Non-streaming JSON
            try {
                const { data } = await api.post(`/ai/estudio/${livroId}/artifact`, { tipo, page_ranges: pageRanges });
                if (data.error) {
                    setArtifacts((prev) => ({ ...prev, [tipo]: { loading: false, result: null, error: data.error } }));
                } else {
                    setArtifacts((prev) => ({ ...prev, [tipo]: { loading: false, result: data.content, error: null } }));
                }
            } catch (e) {
                setArtifacts((prev) => ({ ...prev, [tipo]: { loading: false, result: null, error: e.message } }));
            }
        }
    };

    // ─── RENDER ───────────────────────────────────────────────────────────────
    return (
        <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">

            {/* ── Header ── */}
            <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition"
                >
                    <ArrowLeft size={20} />
                </button>
                <button
                    onClick={() => setSidebarOpen((v) => !v)}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition md:hidden"
                >
                    <Menu size={20} />
                </button>
                <GraduationCap size={22} className="text-purple-600" />
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Estúdio</p>
                    <p className="text-sm font-bold text-gray-800 truncate">
                        {livro ? livro.titulo : 'Carregando…'}
                    </p>
                </div>
            </header>

            {/* ── Body (sidebar + main) ── */}
            <div className="flex flex-1 min-h-0 overflow-hidden relative">

                {/* ── Sidebar — Chapters ── */}
                <aside
                    className={`
                        flex-shrink-0 bg-white border-r border-gray-200 flex flex-col
                        transition-all duration-200
                        ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}
                        md:w-72
                        absolute md:relative z-20 h-full md:h-auto
                    `}
                >
                    {/* Sidebar header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
                        <p className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <BookOpen size={16} className="text-purple-500" />
                            Capítulos
                        </p>
                        <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-gray-400 hover:text-gray-600">
                            <X size={16} />
                        </button>
                    </div>

                    {/* Select all / clear */}
                    {allChapters.length > 0 && (
                        <div className="px-4 py-2 border-b border-gray-100 flex-shrink-0">
                            <button
                                onClick={allSelected ? clearAll : selectAll}
                                className="text-xs text-purple-600 hover:text-purple-800 font-semibold"
                            >
                                {allSelected ? 'Limpar seleção' : 'Selecionar todos'}
                            </button>
                        </div>
                    )}

                    {/* Chapter list */}
                    <div className="flex-1 overflow-y-auto">
                        {chaptersLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 size={24} className="animate-spin text-purple-500" />
                            </div>
                        ) : allChapters.length === 0 ? (
                            <div className="px-4 py-4 text-xs text-gray-400 text-center">
                                <BookOpen size={28} className="mx-auto mb-2 opacity-20" />
                                <p>Este PDF não possui índice.</p>
                                <p className="mt-1">Adicione capítulos manualmente abaixo.</p>
                            </div>
                        ) : (
                            <ul className="py-2">
                                {allChapters.map((c) => {
                                    const isManual = c.id >= 10000;
                                    return (
                                        <li
                                            key={c.id}
                                            className={`flex items-start gap-2 px-4 py-2 hover:bg-gray-50 ${
                                                c.level === 2 ? 'pl-8' : ''
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(c.id)}
                                                onChange={() => toggleSelect(c.id)}
                                                className="mt-1 accent-purple-600 flex-shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-gray-800 leading-tight truncate">
                                                    {c.title}
                                                </p>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    p. {c.page_start}–{c.page_end}
                                                </p>
                                            </div>
                                            {isManual && (
                                                <button
                                                    onClick={() => removeManualChapter(c.id)}
                                                    className="flex-shrink-0 p-1 text-red-400 hover:text-red-600"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* Add chapter button / form */}
                    <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
                        {!showAddForm ? (
                            <button
                                onClick={() => setShowAddForm(true)}
                                className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-purple-400 hover:text-purple-600 transition"
                            >
                                <Plus size={14} /> Adicionar Capítulo
                            </button>
                        ) : (
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    placeholder="Título do capítulo"
                                    value={newChapter.title}
                                    onChange={(e) => setNewChapter((p) => ({ ...p, title: e.target.value }))}
                                    className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-purple-400"
                                />
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        placeholder="Pág. início"
                                        value={newChapter.page_start}
                                        onChange={(e) => setNewChapter((p) => ({ ...p, page_start: e.target.value }))}
                                        className="w-1/2 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-purple-400"
                                    />
                                    <input
                                        type="number"
                                        placeholder="Pág. fim"
                                        value={newChapter.page_end}
                                        onChange={(e) => setNewChapter((p) => ({ ...p, page_end: e.target.value }))}
                                        className="w-1/2 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-purple-400"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setShowAddForm(false); setNewChapter({ title: '', page_start: '', page_end: '' }); }}
                                        className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={addManualChapter}
                                        className="flex-1 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                                    >
                                        Adicionar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer — selection summary */}
                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex-shrink-0">
                        <p className="text-xs text-gray-500">
                            <span className="font-semibold text-purple-700">{selectedIds.size}</span> capítulo{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
                            {totalSelectedPages > 0 && (
                                <span className="text-gray-400"> · ~{totalSelectedPages} páginas</span>
                            )}
                        </p>
                    </div>
                </aside>

                {/* Mobile sidebar backdrop */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/30 z-10 md:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* ── Main panel ── */}
                <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

                    {/* Tab bar */}
                    <div className="bg-white border-b border-gray-200 flex px-4 gap-1 flex-shrink-0">
                        {[
                            { id: 'chat', label: 'Chat', icon: <Bot size={15} /> },
                            { id: 'artifacts', label: 'Artefatos', icon: <GraduationCap size={15} /> },
                        ].map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition ${
                                    tab === t.id
                                        ? 'border-purple-600 text-purple-700'
                                        : 'border-transparent text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                {t.icon}
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* ── CHAT TAB ── */}
                    {tab === 'chat' && (
                        <div className="flex-1 flex flex-col min-h-0 p-4">
                            {selectedIds.size === 0 ? (
                                /* Nenhum capítulo selecionado */
                                <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-gray-400 px-4">
                                    <BookOpen size={40} className="opacity-20" />
                                    <p className="text-sm font-medium text-gray-500">Selecione capítulos para começar</p>
                                    <p className="text-xs max-w-xs">
                                        Marque os capítulos na barra lateral. O conteúdo dessas páginas será enviado como contexto para o chat.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Badge de contexto */}
                                    <div className="flex-shrink-0 mb-3 flex items-center gap-1.5 text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
                                        <CheckCircle size={12} className="flex-shrink-0" />
                                        <span>
                                            Contexto: <strong>{selectedIds.size} capítulo{selectedIds.size !== 1 ? 's' : ''}</strong> · ~{totalSelectedPages} páginas · leitura direta do PDF
                                        </span>
                                    </div>

                                    {/* Mensagens */}
                                    <div className="flex-1 min-h-0 overflow-y-auto space-y-3 mb-3 custom-scrollbar">
                                        {messages.length === 0 && (
                                            <div className="text-center text-gray-400 text-xs mt-8">
                                                <Bot size={28} className="mx-auto mb-2 opacity-30" />
                                                <p>Faça uma pergunta sobre os capítulos selecionados.</p>
                                            </div>
                                        )}
                                        {messages.map((msg, i) => (
                                            <div
                                                key={i}
                                                className={`text-sm rounded-xl px-3 py-2 max-w-[90%] ${
                                                    msg.role === 'user'
                                                        ? 'bg-purple-600 text-white ml-auto'
                                                        : 'bg-gray-100 text-gray-800'
                                                }`}
                                            >
                                                {msg.loading ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <span className="whitespace-pre-wrap">{msg.content}</span>
                                                )}
                                            </div>
                                        ))}
                                        <div ref={bottomRef} />
                                    </div>

                                    {/* Input */}
                                    <div className="flex gap-2 flex-shrink-0">
                                        <textarea
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    sendMessage();
                                                }
                                            }}
                                            placeholder="Pergunte sobre os capítulos selecionados…"
                                            rows={2}
                                            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-800"
                                        />
                                        <button
                                            onClick={sendMessage}
                                            disabled={!input.trim() || chatLoading}
                                            className="p-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-40 transition self-end"
                                        >
                                            <Send size={16} />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── ARTIFACTS TAB ── */}
                    {tab === 'artifacts' && (
                        <div className="flex-1 overflow-y-auto p-4">
                            {selectedIds.size === 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-700 flex items-center gap-2">
                                    <AlertCircle size={16} />
                                    Selecione ao menos 1 capítulo na barra lateral para gerar artefatos.
                                </div>
                            )}

                            <div className="space-y-2">
                                {ARTIFACT_TYPES.map((art) => {
                                    const state = artifacts[art.id];
                                    const isLoading = state?.loading;
                                    const hasResult = !!state?.result;
                                    const hasError = !!state?.error;
                                    const isExpanded = expandedArtifacts.has(art.id);
                                    const Icon = art.icon;

                                    return (
                                        <div key={art.id} className={`rounded-xl border overflow-hidden ${COLOR_MAP[art.color]}`}>
                                            {/* ── Cabeçalho do accordion ── */}
                                            <div className="flex items-center gap-3 px-4 py-3">
                                                {/* Ícone + título — clicável para expandir se houver resultado */}
                                                <button
                                                    onClick={() => (hasResult || hasError) && toggleArtifact(art.id)}
                                                    disabled={!hasResult && !hasError}
                                                    className="flex-1 flex items-center gap-2.5 text-left disabled:cursor-default"
                                                >
                                                    <Icon size={20} className="flex-shrink-0" />
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold leading-tight">{art.label}</p>
                                                        <p className="text-xs opacity-60 mt-0.5">{art.desc}</p>
                                                    </div>
                                                </button>

                                                {/* Botão Gerar / Regerar */}
                                                <button
                                                    onClick={() => generateArtifact(art.id)}
                                                    disabled={isLoading || selectedIds.size === 0}
                                                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-50 ${BTN_COLOR_MAP[art.color]}`}
                                                >
                                                    {isLoading ? (
                                                        <><Loader2 size={12} className="animate-spin" /> Gerando…</>
                                                    ) : hasResult ? (
                                                        <><RefreshCw size={12} /> Regerar</>
                                                    ) : (
                                                        'Gerar'
                                                    )}
                                                </button>

                                                {/* Salvar / Salvo */}
                                                {hasResult && (
                                                    savedInfo[art.id] ? (
                                                        <div className="flex-shrink-0 flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 rounded-lg px-2 py-1 text-xs font-semibold">
                                                            <CheckCircle size={11} />
                                                            <span>{formatSavedAt(savedInfo[art.id].saved_at)}</span>
                                                            <button
                                                                onClick={() => handleDeleteArtifact(art.id)}
                                                                className="ml-0.5 text-gray-400 hover:text-red-500 transition leading-none"
                                                                title="Remover do banco"
                                                            >×</button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleSaveArtifact(art.id)}
                                                            disabled={savingArtifact.has(art.id)}
                                                            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 text-gray-500 rounded-lg text-xs hover:border-purple-400 hover:text-purple-600 disabled:opacity-50 transition"
                                                            title="Salvar no banco"
                                                        >
                                                            {savingArtifact.has(art.id) ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                                                            {savingArtifact.has(art.id) ? '…' : 'Salvar'}
                                                        </button>
                                                    )
                                                )}

                                                {/* Chevron de toggle */}
                                                {(hasResult || hasError) && (
                                                    <button onClick={() => toggleArtifact(art.id)} className="flex-shrink-0 p-1">
                                                        <ChevronDown
                                                            size={16}
                                                            className={`transition-transform duration-200 opacity-60 ${isExpanded ? 'rotate-180' : ''}`}
                                                        />
                                                    </button>
                                                )}
                                            </div>

                                            {/* ── Conteúdo expansível ── */}
                                            {isExpanded && (hasResult || hasError) && (
                                                <div className="px-4 pb-4 border-t border-black/5">
                                                    {hasError ? (
                                                        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-3 mt-3">
                                                            <AlertCircle size={15} />
                                                            {state.error}
                                                        </div>
                                                    ) : art.id === 'quiz' ? (
                                                        <div className="mt-3">
                                                            <QuizResult questions={Array.isArray(state.result) ? state.result : []} />
                                                        </div>
                                                    ) : art.id === 'flashcards' ? (
                                                        <div className="mt-3">
                                                            <FlashcardsResult cards={Array.isArray(state.result) ? state.result : []} />
                                                        </div>
                                                    ) : art.id === 'mindmap' ? (
                                                        <div className="mt-3 bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-mono">
                                                            {state.result}
                                                        </div>
                                                    ) : art.id === 'audio_resumo' ? (
                                                        <div className="mt-3">
                                                            <AudioResumoResult text={state.result} />
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default Estudio;
