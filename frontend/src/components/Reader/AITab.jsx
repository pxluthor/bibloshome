import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Bot, Send, FileText, Volume2, Loader2, AlertCircle,
    CheckCircle, RefreshCw, Settings, Mic, MicOff, Play, Pause, Square,
    GraduationCap, ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from '../../utils/toast';
import ChatMarkdown from '../ChatMarkdown';
import ArtifactActionCard from '../ArtifactActionCard';

// ─── SUB-ABA: CHAT ────────────────────────────────────────────────────────────
// Answers from the saved summary of the chapter being read (+ word search); when that is not
// enough it escalates to the whole book: word search and, once the book is indexed, semantic RAG.
// Indexing starts on demand the first time the chat is opened and never blocks the chat.
const NEIGHBOR_PAGES = 10; // context window when the book has no table of contents

const chapterFor = (chapters, page) => {
    const containing = chapters.filter((c) => c.page_start <= page && page <= c.page_end);
    if (!containing.length) return null;
    return containing.reduce((best, c) => (c.page_end - c.page_start < best.page_end - best.page_start ? c : best));
};

const ChatSubTab = ({ livroId, pageNumber }) => {
    const navigate = useNavigate();
    const [chapters, setChapters] = useState(null);
    const [index, setIndex] = useState(null); // {status, pages_indexed, total_pages, error_msg}
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef(null);
    const indexRequested = useRef(false);

    useEffect(() => {
        api.get(`/ai/estudio/${livroId}/chapters`)
            .then((r) => setChapters(r.data.chapters || []))
            .catch(() => setChapters([]));
    }, [livroId]);

    const fetchIndex = useCallback(async () => {
        try {
            const { data } = await api.get(`/ai/chat/${livroId}/status`);
            setIndex(data);
            return data;
        } catch {
            return null;
        }
    }, [livroId]);

    // On-demand indexing for semantic search: start it once, then poll while it runs
    useEffect(() => {
        fetchIndex().then((data) => {
            if (data?.status === 'not_indexed' && !indexRequested.current) {
                indexRequested.current = true;
                api.post(`/ai/chat/${livroId}/index`, {}).then(fetchIndex).catch(() => {});
            }
        });
    }, [livroId, fetchIndex]);

    useEffect(() => {
        if (index?.status !== 'indexing') return;
        const timer = setInterval(fetchIndex, 4000);
        return () => clearInterval(timer);
    }, [index?.status, fetchIndex]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const page = pageNumber || 1;
    const chapter = chapters ? chapterFor(chapters, page) : null;
    const range = chapter
        ? { start: chapter.page_start, end: chapter.page_end }
        : { start: Math.max(1, page - NEIGHBOR_PAGES), end: page + NEIGHBOR_PAGES };
    const contextLabel = chapter ? `${chapter.title} (p. ${range.start}–${range.end})` : `p. ${range.start}–${range.end}`;

    const sendMessage = async () => {
        if (!input.trim() || loading) return;
        const userMsg = { role: 'user', content: input.trim() };
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '', loading: true }]);
        setInput('');
        setLoading(true);

        try {
            const response = await fetch(`${api.defaults.baseURL}/ai/estudio/${livroId}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ message: userMsg.content, history, page_ranges: [range], rag_scope: 'book' }),
            });
            if (!response.ok) {
                let detail = `Erro ${response.status}`;
                try { detail = (await response.json()).detail || detail; } catch {}
                throw new Error(detail);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantText = '';
            let buffer = '';
            let action = null; // agent asked to generate an artifact (needs confirmation)
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep incomplete trailing line
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error) assistantText = parsed.error;
                        else if (parsed.token) assistantText += parsed.token;
                        if (parsed.action?.type === 'gerar_artefato') action = { tipo: parsed.action.tipo, state: 'pending' };
                        const status = parsed.status && !assistantText ? parsed.status : null;
                        setMessages((prev) => {
                            const updated = [...prev];
                            updated[updated.length - 1] = { role: 'assistant', content: assistantText, loading: !!status, status, action };
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
            setLoading(false);
        }
    };

    const setActionState = (index, state) =>
        setMessages((prev) => prev.map((m, i) => (i === index && m.action ? { ...m, action: { ...m.action, state } } : m)));

    // Generates in the background with the same chapter range the chat used; it is saved for the Estúdio
    const generateFromChat = async (index, tipo) => {
        setActionState(index, 'running');
        try {
            const response = await fetch(`${api.defaults.baseURL}/ai/estudio/${livroId}/artifact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ tipo, page_ranges: [range] }),
            });
            const text = await response.text(); // JSON, or the SSE stream of audio_resumo read to the end
            if (!response.ok || /"error"\s*:/.test(text)) throw new Error(text.slice(0, 200));
            setActionState(index, 'done');
        } catch {
            setActionState(index, 'error');
        }
    };

    const indexPct = index?.status === 'indexing' && index.total_pages > 0
        ? Math.round((index.pages_indexed / index.total_pages) * 100)
        : null;

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-start justify-between gap-2 mb-2 px-1">
                <div className="min-w-0 text-xs text-gray-500 space-y-0.5">
                    <p className="truncate" title={contextLabel}>
                        <span className="font-semibold text-gray-700">Contexto:</span> {chapters ? contextLabel : 'carregando…'}
                    </p>
                    <p className="flex items-center gap-1">
                        {index?.status === 'ready' && <><CheckCircle size={11} className="text-green-600" /> Busca no livro todo pronta</>}
                        {index?.status === 'indexing' && <><Loader2 size={11} className="animate-spin" /> Preparando busca no livro todo{indexPct !== null ? ` (${indexPct}%)` : '…'}</>}
                        {index?.status === 'error' && (
                            <span title={index.error_msg || ''} className="flex items-center gap-1 text-amber-700">
                                <AlertCircle size={11} /> Busca por significado indisponível; usando busca por palavras
                            </span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => navigate(`/estudio/${livroId}`)}
                    className="flex-shrink-0 flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-1 rounded-lg transition font-semibold"
                    title="Abrir Estúdio de Estudos"
                >
                    <GraduationCap size={13} />
                    Estúdio
                    <ExternalLink size={11} />
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-3 custom-scrollbar">
                {messages.length === 0 && (
                    <div className="text-center text-gray-400 text-xs mt-8 px-4">
                        <Bot size={28} className="mx-auto mb-2 opacity-30" />
                        <p>Pergunte sobre o capítulo que você está lendo — ou sobre o livro todo.</p>
                    </div>
                )}
                {messages.map((msg, i) => (
                    msg.role === 'user' ? (
                        <div key={i} className="flex justify-end">
                            <div className="text-sm rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%] bg-blue-600 text-white whitespace-pre-wrap leading-relaxed shadow-sm">
                                {msg.content}
                            </div>
                        </div>
                    ) : (
                        <div key={i} className="flex gap-2.5 items-start">
                            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center mt-0.5">
                                <Bot size={15} className="text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0 text-sm text-gray-800 bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                                {msg.loading && !msg.content ? (
                                    <span className="inline-flex gap-1 items-center py-1">
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                        {msg.status && <span className="ml-2 text-xs text-gray-500">{msg.status}</span>}
                                    </span>
                                ) : (
                                    <>
                                    <ChatMarkdown content={msg.content} />
                                    {msg.action && (
                                        <ArtifactActionCard
                                            tipo={msg.action.tipo}
                                            state={msg.action.state}
                                            onCancel={() => setActionState(i, 'cancelled')}
                                            onConfirm={() => generateFromChat(i, msg.action.tipo)}
                                            onOpen={() => navigate(`/estudio/${livroId}`)}
                                        />
                                    )}
                                    </>
                                )}
                            </div>
                        </div>
                    )
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    }}
                    placeholder="Pergunte sobre o livro…"
                    rows={2}
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
                />
                <button
                    onClick={sendMessage}
                    disabled={!input.trim() || loading || !chapters}
                    aria-label="Enviar pergunta"
                    className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition self-end"
                >
                    <Send size={16} />
                </button>
            </div>
        </div>
    );
};

// ─── SUB-ABA: RESUMO ──────────────────────────────────────────────────────────
const ResumoSubTab = ({ livroId }) => {
    const [summary, setSummary] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const generateSummary = async () => {
        setLoading(true);
        setSummary('');
        setError('');

        try {
            const response = await fetch(
                `${api.defaults.baseURL}/ai/summarize/${livroId}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${localStorage.getItem('token')}`,
                    },
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
                buffer = lines.pop(); // keep incomplete trailing line
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error) {
                            setError(parsed.error);
                            break;
                        }
                        if (parsed.token) {
                            text += parsed.token;
                            setSummary(text);
                        }
                    } catch {}
                }
            }
        } catch (e) {
            setError(`Erro: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto mb-3">
                {loading && !summary && (
                    <div className="flex items-center gap-2 text-blue-600 text-sm mt-4">
                        <Loader2 size={16} className="animate-spin" />
                        Gerando resumo…
                    </div>
                )}
                {error && (
                    <div className="flex items-center gap-2 text-red-500 text-sm mt-4">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}
                {summary && (
                    <div className="text-sm text-gray-800 leading-relaxed bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <ChatMarkdown content={summary} />
                        {loading && (
                            <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1 rounded align-middle" />
                        )}
                    </div>
                )}
                {!loading && !summary && !error && (
                    <div className="text-center text-gray-400 text-xs mt-8">
                        <FileText size={28} className="mx-auto mb-2 opacity-30" />
                        <p>Clique no botão para gerar um resumo do livro.</p>
                    </div>
                )}
            </div>

            <button
                onClick={generateSummary}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition"
            >
                {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                ) : (
                    <RefreshCw size={16} />
                )}
                {summary ? 'Gerar Novo Resumo' : 'Gerar Resumo'}
            </button>
        </div>
    );
};

// ─── SUB-ABA: VOZ (TTS) ───────────────────────────────────────────────────────
const VOICES = ['Francisca', 'Antonio', 'Thalita'];
const VOICE_LABELS = { Francisca: 'Francisca (F)', Antonio: 'Antonio (M)', Thalita: 'Thalita (F)' };

const VozSubTab = ({ pageText, pageNumber }) => {
    const [voice, setVoice] = useState('Francisca');
    const [rate, setRate] = useState(1.0);
    const [translate, setTranslate] = useState(false);
    const [loading, setLoading] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [paused, setPaused] = useState(false);
    const [error, setError] = useState('');
    const audioRef = useRef(null);
    const abortRef = useRef(null);

    const stopAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current = null;
        }
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
        setPlaying(false);
        setPaused(false);
        setLoading(false);
    };

    // Parar ao trocar de página
    useEffect(() => { stopAudio(); }, [pageNumber]);
    // Limpar ao desmontar
    useEffect(() => () => stopAudio(), []);

    const speak = async () => {
        if (!pageText?.trim() || loading || playing) return;
        setError('');
        stopAudio();
        setLoading(true);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch(`${api.defaults.baseURL}/ai/tts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ text: pageText, voice, rate, translate }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Erro ao gerar áudio');
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;

            audio.onplay   = () => { setPlaying(true); setPaused(false); setLoading(false); };
            audio.onpause  = () => setPaused(true);
            audio.onended  = () => { setPlaying(false); setPaused(false); URL.revokeObjectURL(url); };
            audio.onerror  = () => { setPlaying(false); setPaused(false); setLoading(false); URL.revokeObjectURL(url); };

            await audio.play();
        } catch (e) {
            if (e.name !== 'AbortError') {
                setError(e.message || 'Erro ao gerar áudio');
                setLoading(false);
            }
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
        <div className="flex flex-col h-full gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                <p className="font-semibold mb-1">Leitura em Voz — Página {pageNumber}</p>
                <p className="text-blue-500">Vozes neurais pt-BR via Microsoft Edge TTS.</p>
            </div>

            {/* Seletor de voz */}
            <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Voz</label>
                <div className="flex gap-2 mt-1">
                    {VOICES.map(v => (
                        <button
                            key={v}
                            onClick={() => setVoice(v)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${
                                voice === v
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                            }`}
                        >
                            {VOICE_LABELS[v]}
                        </button>
                    ))}
                </div>
            </div>

            {/* Velocidade */}
            <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Velocidade: {rate.toFixed(1)}x
                </label>
                <input
                    type="range" min="0.5" max="2.0" step="0.1" value={rate}
                    onChange={e => setRate(parseFloat(e.target.value))}
                    className="mt-1 w-full accent-blue-600"
                />
            </div>

            {/* Toggle traduzir para PT */}
            <button
                onClick={() => setTranslate(t => !t)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition w-full ${
                    translate
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-green-400 hover:text-green-600'
                }`}
            >
                <span className="text-base">{translate ? '🇧🇷' : '🌐'}</span>
                {translate ? 'Traduzir para PT ativado' : 'Traduzir para PT'}
            </button>

            {error && (
                <div className="flex items-center gap-2 text-red-500 text-xs">
                    <AlertCircle size={14} /> {error}
                </div>
            )}

            {/* Controles */}
            <div className="flex gap-2 mt-auto">
                {!playing && !loading && (
                    <button
                        onClick={speak}
                        disabled={!pageText?.trim()}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 disabled:opacity-40 transition"
                    >
                        <Play size={18} /> Ler Página
                    </button>
                )}
                {loading && (
                    <button disabled className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl font-semibold text-sm opacity-70">
                        <Loader2 size={18} className="animate-spin" /> Gerando…
                    </button>
                )}
                {playing && (
                    <>
                        <button
                            onClick={togglePause}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-yellow-500 text-white rounded-xl font-semibold text-sm hover:bg-yellow-600 transition"
                        >
                            {paused ? <Play size={18} /> : <Pause size={18} />}
                            {paused ? 'Continuar' : 'Pausar'}
                        </button>
                        <button
                            onClick={stopAudio}
                            className="px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition"
                        >
                            <Square size={18} />
                        </button>
                    </>
                )}
            </div>

            {playing && (
                <div className="flex items-center gap-2 text-green-600 text-xs">
                    <Volume2 size={14} className={paused ? '' : 'animate-pulse'} />
                    {paused ? 'Pausado' : 'Lendo…'}
                </div>
            )}
        </div>
    );
};

// ─── PAINEL DE CONFIGURAÇÕES ──────────────────────────────────────────────────
const AISettingsPanel = ({ onClose }) => {
    const navigate = useNavigate();
    const [settings, setSettings] = useState(null);
    const [accounts, setAccounts] = useState([]);

    useEffect(() => {
        const load = async () => {
            const [s, a] = await Promise.all([
                api.get('/ai/settings'),
                api.get('/ai/provider-accounts'),
            ]);
            setSettings(s.data);
            setAccounts(a.data);
        };
        load();
    }, []);

    const activeAccount = accounts.find(account => account.selected);
    const providerNames = { ollama: 'Ollama', openai: 'OpenAI', codex: 'Codex Pro', claude: 'Claude' };
    const providerName = activeAccount?.name || providerNames[settings?.provider] || 'Provedor personalizado';

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Settings size={18} /> Configurações de IA
                </h3>

                {!settings ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="animate-spin text-blue-500" size={24} />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase">Provedor ativo</p>
                                <p className="text-sm font-semibold text-gray-900 mt-1">{providerName}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase">Modelo</p>
                                <p className="text-sm font-mono text-gray-800 mt-1 break-all">{settings.chat_model}</p>
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">Fechar</button>
                            <button onClick={() => navigate('/configuracoes')} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition">Gerenciar</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── COMPONENTE PRINCIPAL: AITab ──────────────────────────────────────────────
const AITab = ({ livroId, pageNumber, pageText }) => {
    const [subTab, setSubTab] = useState('chat');
    const [showSettings, setShowSettings] = useState(false);

    const subTabs = [
        { id: 'chat', label: 'Chat', icon: <Bot size={14} /> },
        { id: 'resumo', label: 'Resumo', icon: <FileText size={14} /> },
        { id: 'voz', label: 'Voz', icon: <Volume2 size={14} /> },
    ];

    return (
        <div className="flex flex-col h-full text-gray-800">
            {showSettings && <AISettingsPanel onClose={() => setShowSettings(false)} />}

            {/* Sub-tab header */}
            <div className="flex items-center gap-1 mb-4 border-b border-gray-200 pb-2 flex-shrink-0">
                {subTabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setSubTab(tab.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                            subTab === tab.id
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
                <button
                    onClick={() => setShowSettings(true)}
                    className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                    title="Configurações de IA"
                >
                    <Settings size={14} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {subTab === 'chat' && <ChatSubTab livroId={livroId} pageNumber={pageNumber} />}
                {subTab === 'resumo' && <ResumoSubTab livroId={livroId} />}
                {subTab === 'voz' && (
                    <VozSubTab pageText={pageText} pageNumber={pageNumber} />
                )}
            </div>
        </div>
    );
};

export default AITab;
