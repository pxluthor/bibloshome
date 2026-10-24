import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, BookOpen, Bot, Send, Loader2, AlertCircle,
    CheckCircle, GraduationCap, FileQuestion, Layers, Map,
    Headphones, Plus, Trash2, Play, Pause, Square, Volume2,
    RefreshCw, Menu, X, ChevronLeft, ChevronRight, RotateCcw,
    ChevronDown, Save, FileText, Lightbulb, HelpCircle, List
} from 'lucide-react';
import api from '../services/api';
import { toast } from '../utils/toast';
import ChatMarkdown from './ChatMarkdown';

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
    { id: 'podcast',  label: 'Podcast a Dois',        desc: 'Ana e Beto conversam sobre o conteúdo',  icon: Headphones, color: 'indigo' },
    { id: 'video',    label: 'Vídeo Explicativo',     desc: 'Slides narrados gerados do conteúdo',    icon: Play,       color: 'cyan' },
    { id: 'resumo', label: 'Resumo Didático',       desc: 'Visão geral + conceitos-chave',          icon: FileText,   color: 'teal' },
    { id: 'insights', label: 'Ideias-chave',          desc: 'As ideias mais importantes em tópicos',  icon: Lightbulb,  color: 'amber' },
    { id: 'reflexao', label: 'Perguntas de Reflexão', desc: 'Perguntas para pensar e aplicar',        icon: HelpCircle, color: 'rose' },
    { id: 'sumario',  label: 'Sumário Comentado',     desc: 'Tópicos na ordem em que aparecem',       icon: List,       color: 'slate' },
    { id: 'videos',   label: 'Vídeos de Reforço',     desc: 'Videoaulas do YouTube sobre o conteúdo', icon: Play,       color: 'red' },
];

// Text artifacts rendered as Markdown
const MARKDOWN_TIPOS = new Set(['resumo', 'insights', 'reflexao', 'sumario']);

const COLOR_MAP = {
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    green:  'bg-green-100 text-green-700 border-green-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    blue:   'bg-blue-100 text-blue-700 border-blue-200',
    teal:   'bg-teal-100 text-teal-700 border-teal-200',
    amber:  'bg-amber-100 text-amber-800 border-amber-200',
    rose:   'bg-rose-100 text-rose-700 border-rose-200',
    slate:  'bg-slate-100 text-slate-700 border-slate-200',
    red:    'bg-red-100 text-red-700 border-red-200',
    indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    cyan:   'bg-cyan-100 text-cyan-800 border-cyan-200',
};
const BTN_COLOR_MAP = {
    purple: 'bg-purple-600 hover:bg-purple-700',
    green:  'bg-green-600 hover:bg-green-700',
    orange: 'bg-orange-500 hover:bg-orange-600',
    blue:   'bg-blue-600 hover:bg-blue-700',
    teal:   'bg-teal-600 hover:bg-teal-700',
    amber:  'bg-amber-600 hover:bg-amber-700',
    rose:   'bg-rose-600 hover:bg-rose-700',
    slate:  'bg-slate-600 hover:bg-slate-700',
    red:    'bg-red-600 hover:bg-red-700',
    indigo: 'bg-indigo-600 hover:bg-indigo-700',
    cyan:   'bg-cyan-700 hover:bg-cyan-800',
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
// ─── VIDEOS RESULT ────────────────────────────────────────────────────────────
const VideosResult = ({ videos }) => {
    const [playing, setPlaying] = useState(null);
    if (!videos.length) return <p className="text-sm text-gray-500">Nenhum vídeo encontrado.</p>;
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {videos.map((v) => (
                <div key={v.video_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {playing === v.video_id ? (
                        <iframe
                            className="w-full aspect-video"
                            src={`https://www.youtube-nocookie.com/embed/${v.video_id}?autoplay=1`}
                            title={v.title}
                            allow="autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                        />
                    ) : (
                        <button onClick={() => setPlaying(v.video_id)} className="relative w-full block" title="Assistir aqui">
                            <img src={v.thumbnail} alt="" className="w-full aspect-video object-cover" loading="lazy" />
                            <Play size={36} className="absolute inset-0 m-auto text-white drop-shadow-lg" />
                        </button>
                    )}
                    <div className="p-2.5">
                        <a
                            href={`https://www.youtube.com/watch?v=${v.video_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-gray-800 hover:text-red-600 line-clamp-2"
                        >
                            {v.title}
                        </a>
                        <p className="text-xs text-gray-500 mt-0.5">{v.channel} · busca: “{v.query}”</p>
                    </div>
                </div>
            ))}
        </div>
    );
};

// ─── VIDEO RESULT ─────────────────────────────────────────────────────────────
const VideoResult = ({ scenes }) => {
    const [videoUrl, setVideoUrl] = useState(null);
    const [rendering, setRendering] = useState(false);

    useEffect(() => () => videoUrl && URL.revokeObjectURL(videoUrl), [videoUrl]);

    const render = async () => {
        setRendering(true);
        try {
            // LLM output may carry nulls or oversized fields; match the backend's VideoScene limits.
            const str = (v, max) => (typeof v === 'string' ? v : '').slice(0, max);
            const payload = scenes.slice(0, 15).map((s) => ({
                layout: str(s.layout, 20) || 'topicos',
                title: str(s.title, 200),
                subtitle: str(s.subtitle, 300),
                bullets: (Array.isArray(s.bullets) ? s.bullets : []).filter((b) => typeof b === 'string').slice(0, 8),
                text: str(s.text, 600),
                code: str(s.code, 2000),
                narration: str(s.narration, 2000),
            }));
            const { data } = await api.post('/ai/estudio/video/mp4', { scenes: payload }, { responseType: 'blob', timeout: 600000 });
            setVideoUrl(URL.createObjectURL(data));
        } catch (e) {
            let detail = null;
            try { detail = JSON.parse(await e.response.data.text()).detail; } catch {}
            toast.error(detail || e.message);
        } finally {
            setRendering(false);
        }
    };

    if (!scenes.length) return <p className="text-sm text-gray-500">Roteiro vazio. Tente regerar.</p>;

    return (
        <div className="space-y-3">
            {videoUrl ? (
                <div className="space-y-2">
                    <video src={videoUrl} controls className="w-full rounded-xl bg-black aspect-video" />
                    <a href={videoUrl} download="video-explicativo.mp4" className="inline-flex items-center gap-2 px-4 py-2 border border-cyan-300 text-cyan-800 rounded-xl text-sm font-semibold hover:bg-cyan-50 transition">
                        <Save size={16} /> Baixar MP4
                    </a>
                </div>
            ) : (
                <button onClick={render} disabled={rendering} className="flex items-center gap-2 px-4 py-2 bg-cyan-700 text-white rounded-xl text-sm font-semibold hover:bg-cyan-800 disabled:opacity-60 transition">
                    {rendering ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    {rendering ? 'Renderizando vídeo… (pode levar 1-2 min)' : 'Renderizar vídeo'}
                </button>
            )}
            <ol className="space-y-2">
                {scenes.map((s, i) => (
                    <li key={i} className="bg-white rounded-xl border border-gray-200 p-3 text-sm">
                        <p className="font-semibold text-gray-800">
                            {i + 1}. {s.title} <span className="text-xs font-normal text-gray-400">({s.layout})</span>
                        </p>
                        <p className="text-gray-600 mt-1 leading-relaxed">{s.narration}</p>
                    </li>
                ))}
            </ol>
        </div>
    );
};

// ─── PODCAST RESULT ───────────────────────────────────────────────────────────
const PODCAST_VOICES = { Ana: 'Francisca', Beto: 'Antonio' };

const PodcastResult = ({ lines }) => {
    const [current, setCurrent] = useState(-1);   // index of line playing, -1 = idle
    const [loading, setLoading] = useState(false);
    const [paused, setPaused] = useState(false);
    const audioRef = useRef(null);
    const cacheRef = useRef(new Map());           // index -> Promise<objectURL>
    const runRef = useRef(0);                     // bumps on stop to cancel pending playback

    const fetchLine = (i) => {
        if (!cacheRef.current.has(i)) {
            const line = lines[i];
            const p = fetch(`${api.defaults.baseURL}/ai/tts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ text: line.text, voice: PODCAST_VOICES[line.speaker] || 'Francisca', rate: 1.05 }),
            }).then((res) => {
                if (!res.ok) throw new Error('Erro ao gerar áudio');
                return res.blob();
            }).then((blob) => URL.createObjectURL(blob));
            cacheRef.current.set(i, p);
        }
        return cacheRef.current.get(i);
    };

    const stop = () => {
        runRef.current += 1;
        audioRef.current?.pause();
        audioRef.current = null;
        cacheRef.current.forEach((p) => p.then(URL.revokeObjectURL, () => {}));
        cacheRef.current.clear();
        setCurrent(-1);
        setLoading(false);
        setPaused(false);
    };

    const playFrom = async (i, run) => {
        if (i >= lines.length) { stop(); return; }
        setCurrent(i);
        setLoading(true);
        try {
            const url = await fetchLine(i);
            if (run !== runRef.current) return;
            if (i + 1 < lines.length) fetchLine(i + 1).catch(() => {}); // prefetch next line
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => playFrom(i + 1, run);
            await audio.play();
            setLoading(false);
            setPaused(false);
        } catch (e) {
            if (run === runRef.current) { stop(); toast.error(e.message); }
        }
    };

    const start = (i = 0) => {
        stop();
        playFrom(i, runRef.current);
    };

    const togglePause = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) { audio.play(); setPaused(false); } else { audio.pause(); setPaused(true); }
    };

    useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

    const [downloading, setDownloading] = useState(false);
    const downloadMp3 = async () => {
        setDownloading(true);
        try {
            const { data } = await api.post('/ai/estudio/podcast/mp3', { lines }, { responseType: 'blob', timeout: 300000 });
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'podcast.mp3';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            let detail = null;
            try { detail = JSON.parse(await e.response.data.text()).detail; } catch {}
            toast.error(detail || e.message);
        } finally {
            setDownloading(false);
        }
    };

    if (!lines.length) return <p className="text-sm text-gray-500">Roteiro vazio. Tente regerar.</p>;

    return (
        <div className="space-y-3">
            <div className="flex gap-2">
                {current === -1 ? (
                    <button onClick={() => start(0)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition">
                        <Volume2 size={16} /> Ouvir Podcast
                    </button>
                ) : null}
                {current === -1 ? (
                    <button onClick={downloadMp3} disabled={downloading} className="flex items-center gap-2 px-4 py-2 border border-indigo-300 text-indigo-700 rounded-xl text-sm font-semibold hover:bg-indigo-50 disabled:opacity-60 transition">
                        {downloading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {downloading ? 'Compondo MP3…' : 'Baixar MP3'}
                    </button>
                ) : (
                    <>
                        <button onClick={togglePause} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-xl text-sm font-semibold hover:bg-yellow-600 disabled:opacity-60 transition">
                            {loading ? <Loader2 size={16} className="animate-spin" /> : paused ? <Play size={16} /> : <Pause size={16} />}
                            {loading ? 'Carregando…' : paused ? 'Continuar' : 'Pausar'}
                        </button>
                        <button onClick={stop} className="px-3 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition" title="Parar">
                            <Square size={16} />
                        </button>
                    </>
                )}
            </div>
            <div className="space-y-2">
                {lines.map((line, i) => (
                    <button
                        key={i}
                        onClick={() => start(i)}
                        title="Ouvir a partir daqui"
                        className={`w-full text-left flex gap-2 rounded-xl p-3 text-sm transition border ${
                            i === current ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:border-indigo-200'
                        } ${line.speaker === 'Beto' ? 'pl-8' : ''}`}
                    >
                        <span className={`font-bold flex-shrink-0 ${line.speaker === 'Beto' ? 'text-emerald-700' : 'text-indigo-700'}`}>
                            {line.speaker}:
                        </span>
                        <span className="text-gray-800 leading-relaxed">{line.text}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

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
                setArtifacts((prev) => ({ ...prev, [tipo]: { loading: false, result: null, error: e.response?.data?.detail || e.message } }));
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
                                            msg.role === 'user' ? (
                                                <div key={i} className="flex justify-end">
                                                    <div className="text-sm rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%] bg-purple-600 text-white whitespace-pre-wrap leading-relaxed shadow-sm">
                                                        {msg.content}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div key={i} className="flex gap-2.5 items-start">
                                                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center mt-0.5">
                                                        <Bot size={15} className="text-purple-600" />
                                                    </div>
                                                    <div className="flex-1 min-w-0 text-sm text-gray-800 bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                                                        {msg.loading && !msg.content ? (
                                                            <span className="inline-flex gap-1 items-center py-1">
                                                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                            </span>
                                                        ) : (
                                                            <ChatMarkdown content={msg.content} />
                                                        )}
                                                    </div>
                                                </div>
                                            )
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
                                                    ) : art.id === 'podcast' ? (
                                                        <div className="mt-3">
                                                            <PodcastResult
                                                                lines={Array.isArray(state.result)
                                                                    ? state.result.filter((l) => l && typeof l.text === 'string' && l.text.trim())
                                                                    : []}
                                                            />
                                                        </div>
                                                    ) : art.id === 'video' ? (
                                                        <div className="mt-3">
                                                            <VideoResult
                                                                scenes={Array.isArray(state.result)
                                                                    ? state.result.filter((s) => s && typeof s.narration === 'string' && s.narration.trim())
                                                                    : []}
                                                            />
                                                        </div>
                                                    ) : art.id === 'videos' ? (
                                                        <div className="mt-3">
                                                            <VideosResult videos={Array.isArray(state.result) ? state.result : []} />
                                                        </div>
                                                    ) : MARKDOWN_TIPOS.has(art.id) ? (
                                                        <div className="mt-3 bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-800">
                                                            <ChatMarkdown content={state.result} />
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
