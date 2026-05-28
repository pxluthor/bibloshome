import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Bot, Send, FileText, Volume2, Loader2, AlertCircle,
    CheckCircle, RefreshCw, Settings, Mic, MicOff, Play, Pause, Square,
    GraduationCap, ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from '../../utils/toast';

// ─── SUB-ABA: CHAT ────────────────────────────────────────────────────────────
const ChatSubTab = ({ livroId }) => {
    const navigate = useNavigate();
    const [status, setStatus] = useState(null); // null | {status, pages_indexed}
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef(null);

    const fetchStatus = useCallback(async () => {
        try {
            const { data } = await api.get(`/ai/chat/${livroId}/status`);
            setStatus(data);
            return data.status;
        } catch {
            return 'error';
        }
    }, [livroId]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    // Poll while indexing
    useEffect(() => {
        if (status?.status !== 'indexing') return;
        const interval = setInterval(async () => {
            const s = await fetchStatus();
            if (s !== 'indexing') clearInterval(interval);
        }, 3000);
        return () => clearInterval(interval);
    }, [status?.status, fetchStatus]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || loading) return;
        const userMsg = { role: 'user', content: input.trim() };
        const history = messages.map(m => ({ role: m.role, content: m.content }));

        setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '', loading: true }]);
        setInput('');
        setLoading(true);

        try {
            const response = await fetch(
                `${api.defaults.baseURL}/ai/chat/${livroId}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${localStorage.getItem('token')}`,
                    },
                    body: JSON.stringify({ message: userMsg.content, history }),
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
                buffer = lines.pop(); // keep incomplete trailing line
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error) {
                            assistantText = parsed.error;
                        } else if (parsed.token) {
                            assistantText += parsed.token;
                        }
                        setMessages(prev => {
                            const updated = [...prev];
                            updated[updated.length - 1] = {
                                role: 'assistant',
                                content: assistantText,
                                loading: false,
                            };
                            return updated;
                        });
                    } catch {}
                }
            }
        } catch (e) {
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                    role: 'assistant',
                    content: `Erro: ${e.message}`,
                    loading: false,
                };
                return updated;
            });
        } finally {
            setLoading(false);
        }
    };

    if (!status) {
        return (
            <div className="flex items-center justify-center h-40">
                <Loader2 className="animate-spin text-blue-500" size={24} />
            </div>
        );
    }

    if (status.status === 'not_indexed' || status.status === 'error') {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
                <GraduationCap size={40} className="text-purple-300" />
                <p className="text-sm text-gray-700 font-semibold">
                    {status.status === 'error' ? 'Erro na indexação anterior.' : 'Este livro não está indexado.'}
                </p>
                {status.status === 'error' && status.error_msg && (
                    <div className="w-full bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-left">
                        <p className="text-xs font-semibold text-red-600 mb-1 flex items-center gap-1">
                            <AlertCircle size={12} /> Detalhe do erro:
                        </p>
                        <p className="text-xs text-red-700 font-mono break-all">{status.error_msg}</p>
                    </div>
                )}
                <p className="text-xs text-gray-400 max-w-[200px]">
                    Abra o Estúdio, selecione os capítulos e indexe — o chat ficará disponível aqui.
                </p>
                <button
                    onClick={() => navigate(`/estudio/${livroId}`)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition"
                >
                    <GraduationCap size={16} />
                    Abrir Estúdio
                    <ExternalLink size={13} />
                </button>
            </div>
        );
    }

    if (status.status === 'indexing') {
        const pct = status.total_pages > 0
            ? Math.round((status.pages_indexed / status.total_pages) * 100)
            : null;
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
                <Loader2 size={40} className="text-blue-500 animate-spin" />
                <p className="text-sm text-gray-700 font-semibold">Indexando livro…</p>
                {pct !== null ? (
                    <div className="w-full max-w-xs">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{status.pages_indexed} / {status.total_pages} páginas</span>
                            <span className="font-semibold">{pct}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-blue-500 h-2.5 rounded-full transition-all duration-700"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-gray-400">
                        {status.pages_indexed > 0 ? `${status.pages_indexed} páginas processadas` : 'Iniciando…'}
                    </p>
                )}
                <p className="text-xs text-gray-400">Esta aba atualizará automaticamente.</p>
            </div>
        );
    }

    // status === 'ready'
    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2 px-1">
                <div className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle size={12} />
                    <span>{status.pages_indexed} páginas indexadas</span>
                </div>
                <button
                    onClick={() => navigate(`/estudio/${livroId}`)}
                    className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-1 rounded-lg transition font-semibold"
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
                    <div className="text-center text-gray-400 text-xs mt-8">
                        <Bot size={28} className="mx-auto mb-2 opacity-30" />
                        <p>Faça uma pergunta sobre o livro.</p>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`text-sm rounded-xl px-3 py-2 max-w-[90%] ${
                            msg.role === 'user'
                                ? 'bg-blue-600 text-white ml-auto'
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
            <div className="flex gap-2">
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
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
                    disabled={!input.trim() || loading}
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
                    <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-xl p-4 border border-gray-200">
                        {summary}
                        {loading && (
                            <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1 rounded" />
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
    const [providers, setProviders] = useState(null);
    const [settings, setSettings] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ provider: 'ollama', chat_model: '', openai_api_key: '' });

    useEffect(() => {
        const load = async () => {
            const [p, s] = await Promise.all([
                api.get('/ai/providers'),
                api.get('/ai/settings'),
            ]);
            setProviders(p.data);
            setSettings(s.data);
            setForm({
                provider: s.data.provider,
                chat_model: s.data.chat_model,
                openai_api_key: '',
            });
        };
        load();
    }, []);

    const save = async () => {
        setSaving(true);
        try {
            await api.put('/ai/settings', form);
            onClose();
        } catch (e) {
            toast.error('Erro ao salvar: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const currentModels =
        form.provider === 'openai'
            ? providers?.openai?.models || []
            : providers?.ollama?.models || [];

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Settings size={18} /> Configurações de IA
                </h3>

                {!providers ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="animate-spin text-blue-500" size={24} />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Provider */}
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase">Provider</label>
                            <div className="flex gap-2 mt-1">
                                {['ollama', 'openai'].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setForm(f => ({ ...f, provider: p, chat_model: '' }))}
                                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                                            form.provider === p
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                                        }`}
                                    >
                                        {p === 'ollama' ? '🦙 Ollama' : '🤖 OpenAI'}
                                        {p === 'ollama' && (
                                            <span
                                                className={`ml-1 text-xs ${
                                                    providers.ollama.available
                                                        ? 'text-green-400'
                                                        : 'text-red-400'
                                                }`}
                                            >
                                                {providers.ollama.available ? '●' : '○'}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Model */}
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase">Modelo</label>
                            {currentModels.length > 0 ? (
                                <select
                                    value={form.chat_model}
                                    onChange={e => setForm(f => ({ ...f, chat_model: e.target.value }))}
                                    className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Selecionar modelo…</option>
                                    {currentModels.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    value={form.chat_model}
                                    onChange={e => setForm(f => ({ ...f, chat_model: e.target.value }))}
                                    placeholder={form.provider === 'openai' ? 'gpt-4o-mini' : 'llama3.1:8b'}
                                    className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            )}
                        </div>

                        {/* OpenAI Key */}
                        {form.provider === 'openai' && (
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase">
                                    OpenAI API Key {settings?.has_openai_key && <span className="text-green-500">(configurada)</span>}
                                </label>
                                <input
                                    type="password"
                                    value={form.openai_api_key}
                                    onChange={e => setForm(f => ({ ...f, openai_api_key: e.target.value }))}
                                    placeholder={settings?.has_openai_key ? '••••••• (manter atual)' : 'sk-...'}
                                    className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        )}

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={onClose}
                                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={save}
                                disabled={saving}
                                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Salvar'}
                            </button>
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
                {subTab === 'chat' && <ChatSubTab livroId={livroId} />}
                {subTab === 'resumo' && <ResumoSubTab livroId={livroId} />}
                {subTab === 'voz' && (
                    <VozSubTab pageText={pageText} pageNumber={pageNumber} />
                )}
            </div>
        </div>
    );
};

export default AITab;
