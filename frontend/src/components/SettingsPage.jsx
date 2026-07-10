import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Bot, Key, Check, Loader2, RefreshCw, ChevronDown, Link2, Link2Off, Zap, BarChart2 } from 'lucide-react';
import api from '../services/api';
import { toast } from '../utils/toast';
import AppHeader from './AppHeader';
import UsageChart from './UsageChart';

export default function SettingsPage() {
    const navigate = useNavigate();
    const userName  = localStorage.getItem('userName')  || '';
    const isAdmin   = localStorage.getItem('isAdmin') === 'true';

    // ── Estado dos providers / modelos ─────────────────────────────────────
    const [providers, setProviders]     = useState(null);
    const [loadingProviders, setLoadingProviders] = useState(true);

    // ── Estado do form principal ──────────────────────────────────────────
    const [provider,  setProvider]  = useState('ollama');
    const [model,     setModel]     = useState('');
    const [apiKey,    setApiKey]    = useState('');
    const [hasApiKey, setHasApiKey] = useState(false);
    const [saving,    setSaving]    = useState(false);
    const [loaded,    setLoaded]    = useState(false);

    // ── Estado OAuth Codex ────────────────────────────────────────────────
    const [codexConnecting, setCodexConnecting] = useState(false);
    const [codexUsage, setCodexUsage]           = useState(null);
    const [codexUsageLoading, setCodexUsageLoading] = useState(false);
    const [codexModel, setCodexModel]           = useState('gpt-5.5');

    // ── Estado OAuth Claude ───────────────────────────────────────────────
    const [claudeConnecting, setClaudeConnecting] = useState(false);
    const [claudeUsage, setClaudeUsage]           = useState(null);
    const [claudeUsageLoading, setClaudeUsageLoading] = useState(false);
    const [claudeModel, setClaudeModel]           = useState('claude-sonnet-5');

    // ── Carrega providers + settings atuais ───────────────────────────────
    const fetchAll = useCallback(async () => {
        setLoadingProviders(true);
        try {
            const [provRes, settRes] = await Promise.all([
                api.get('/ai/providers'),
                api.get('/ai/settings'),
            ]);
            setProviders(provRes.data);
            const activeProvider = settRes.data.provider || 'ollama';
            const activeModel = settRes.data.chat_model || '';
            setProvider(activeProvider);
            setModel(activeModel);
            if (activeProvider === 'codex' && activeModel) setCodexModel(activeModel);
            if (activeProvider === 'claude' && activeModel) setClaudeModel(activeModel);
            setHasApiKey(settRes.data.has_openai_key || false);
            setLoaded(true);
        } catch {
            toast.error('Erro ao carregar configurações de IA.');
        } finally {
            setLoadingProviders(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ── Modelos disponíveis para o provider selecionado ────────────────────
    const availableModels = providers
        ? (provider === 'ollama'
            ? providers.ollama?.models || []
            : providers.openai?.models || [])
        : [];

    const ollamaOnline = providers?.ollama?.available ?? false;

    // ── Salvar ─────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!model.trim()) { toast.error('Selecione ou informe um modelo.'); return; }
        setSaving(true);
        try {
            await api.put('/ai/settings', {
                provider,
                chat_model: model,
                openai_api_key: provider === 'openai' ? (apiKey || null) : null,
            });
            toast.success('Configurações de IA salvas!');
            if (apiKey) setHasApiKey(true);
        } catch {
            toast.error('Erro ao salvar configurações.');
        } finally {
            setSaving(false);
        }
    };

    // ── Ativar um provedor OAuth (Codex/Claude) como provider de IA ────────
    const activateOAuthProvider = async (providerName, chosenModel) => {
        if (!chosenModel) { toast.error('Selecione um modelo primeiro.'); return; }
        try {
            await api.put('/ai/settings', {
                provider: providerName,
                chat_model: chosenModel,
                openai_api_key: null,
            });
            setProvider(providerName);
            setModel(chosenModel);
            toast.success(`${providerName === 'codex' ? 'Codex Pro' : 'Claude'} ativado para IA!`);
        } catch {
            toast.error('Erro ao ativar provedor.');
        }
    };

    // ── OAuth: Codex ─────────────────────────────────────────────────────
    const handleCodexConnect = async () => {
        setCodexConnecting(true);
        try {
            const { data } = await api.post('/api/codex-oauth/start');
            const popup = window.open(data.auth_url, 'codex-oauth', 'width=520,height=700');
            const poll = setInterval(async () => {
                try {
                    const res = await api.get('/api/codex-oauth/status');
                    if (res.data.authenticated) {
                        clearInterval(poll);
                        popup?.close();
                        setCodexConnecting(false);
                        toast.success('Codex Pro conectado!');
                        fetchAll();
                    }
                } catch { /* continua polling */ }
            }, 2000);
            // para o polling após 3 minutos mesmo sem sucesso
            setTimeout(() => { clearInterval(poll); setCodexConnecting(false); }, 180_000);
        } catch {
            toast.error('Erro ao iniciar autenticação Codex.');
            setCodexConnecting(false);
        }
    };

    const handleCodexDisconnect = async () => {
        try {
            await api.post('/api/codex-oauth/logout');
            toast.success('Codex desconectado.');
            fetchAll();
        } catch {
            toast.error('Erro ao desconectar Codex.');
        }
    };

    const fetchCodexUsage = async () => {
        setCodexUsageLoading(true);
        try {
            const { data } = await api.get('/api/codex-oauth/usage');
            setCodexUsage(data);
        } catch {
            toast.error('Erro ao buscar uso do Codex.');
        } finally {
            setCodexUsageLoading(false);
        }
    };

    // ── OAuth: Claude ─────────────────────────────────────────────────────
    const handleClaudeConnect = async () => {
        setClaudeConnecting(true);
        try {
            const { data } = await api.post('/api/claude-oauth/start');
            const popup = window.open(data.auth_url, 'claude-oauth', 'width=520,height=700');
            const poll = setInterval(async () => {
                try {
                    const res = await api.get('/api/claude-oauth/status');
                    if (res.data.authenticated) {
                        clearInterval(poll);
                        popup?.close();
                        setClaudeConnecting(false);
                        toast.success('Claude conectado!');
                        fetchAll();
                    }
                } catch { /* continua polling */ }
            }, 2000);
            setTimeout(() => { clearInterval(poll); setClaudeConnecting(false); }, 180_000);
        } catch {
            toast.error('Erro ao iniciar autenticação Claude.');
            setClaudeConnecting(false);
        }
    };

    const handleClaudeDisconnect = async () => {
        try {
            await api.post('/api/claude-oauth/logout');
            toast.success('Claude desconectado.');
            fetchAll();
        } catch {
            toast.error('Erro ao desconectar Claude.');
        }
    };

    const fetchClaudeUsage = async () => {
        setClaudeUsageLoading(true);
        try {
            const { data } = await api.get('/api/claude-oauth/usage');
            setClaudeUsage(data);
        } catch {
            toast.error('Erro ao buscar uso do Claude.');
        } finally {
            setClaudeUsageLoading(false);
        }
    };

    const codexInfo   = providers?.codex  || {};
    const claudeInfo  = providers?.claude || {};

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <AppHeader userName={userName} isAdmin={isAdmin} />

            <main className="max-w-2xl mx-auto px-4 py-8">
                <div className="flex items-center gap-3 mb-6">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 rounded-lg hover:bg-gray-200 transition text-gray-500"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Settings size={22} /> Configurações
                    </h1>
                </div>

                {/* ── Seção IA ───────────────────────────────────────────── */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                            <Bot size={18} className="text-purple-600" /> Inteligência Artificial
                        </h2>
                        <button
                            onClick={fetchAll}
                            disabled={loadingProviders}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition"
                            title="Recarregar modelos"
                        >
                            <RefreshCw size={15} className={loadingProviders ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {/* Provider toggle */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
                        <div className="flex gap-2">
                            {/* Ollama */}
                            <button
                                onClick={() => { setProvider('ollama'); setModel(''); }}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition ${
                                    provider === 'ollama'
                                        ? 'bg-blue-600 border-blue-600 text-white shadow'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                                }`}
                            >
                                🦙 Ollama
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                                    ollamaOnline
                                        ? (provider === 'ollama' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700')
                                        : (provider === 'ollama' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600')
                                }`}>
                                    {ollamaOnline ? 'online' : 'offline'}
                                </span>
                            </button>

                            {/* OpenAI */}
                            <button
                                onClick={() => { setProvider('openai'); setModel(''); }}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition ${
                                    provider === 'openai'
                                        ? 'bg-blue-600 border-blue-600 text-white shadow'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                                }`}
                            >
                                🤖 OpenAI
                            </button>
                        </div>

                        {provider === 'ollama' && !ollamaOnline && (
                            <p className="mt-2 text-xs text-red-500">
                                Ollama não detectado em host.docker.internal:11434. Certifique-se que o Ollama está rodando no seu PC.
                            </p>
                        )}
                    </div>

                    {/* Seleção de modelo */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Modelo
                            {loaded && model && (
                                <span className="ml-2 text-xs text-gray-400 font-normal">atual: {model}</span>
                            )}
                        </label>

                        {loadingProviders ? (
                            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                                <Loader2 size={16} className="animate-spin" /> Carregando modelos...
                            </div>
                        ) : availableModels.length > 0 ? (
                            <div className="space-y-1 max-h-56 overflow-y-auto border border-gray-200 rounded-xl p-1.5">
                                {availableModels.map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setModel(m)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${
                                            model === m
                                                ? 'bg-blue-50 text-blue-700 font-medium'
                                                : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        <span className="font-mono">{m}</span>
                                        {model === m && <Check size={14} className="text-blue-600 flex-shrink-0" />}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            /* Input manual se não houver modelos listados */
                            <div className="relative">
                                <input
                                    type="text"
                                    value={model}
                                    onChange={e => setModel(e.target.value)}
                                    placeholder={provider === 'ollama' ? 'ex: llama3.1:8b' : 'ex: gpt-4o-mini'}
                                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                                />
                            </div>
                        )}

                        {/* Input manual adicional quando há lista (para digitar modelo custom) */}
                        {availableModels.length > 0 && (
                            <div className="mt-2">
                                <input
                                    type="text"
                                    value={model}
                                    onChange={e => setModel(e.target.value)}
                                    placeholder="Ou digite um modelo manualmente..."
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-700 font-mono"
                                />
                            </div>
                        )}
                    </div>

                    {/* Chave OpenAI */}
                    {provider === 'openai' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                                <Key size={14} />
                                Chave da API OpenAI
                                {hasApiKey && <span className="text-xs text-green-600 font-normal">✓ configurada</span>}
                            </label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                                placeholder={hasApiKey ? 'Deixe vazio para manter a atual' : 'sk-...'}
                                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    )}

                    {/* Botão salvar */}
                    <button
                        onClick={handleSave}
                        disabled={saving || !model.trim()}
                        className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        {saving ? 'Salvando...' : 'Salvar Configurações'}
                    </button>
                </div>

                {/* ── Seção Provedores Premium (OAuth) ──────────────────── */}
                <div className="mt-6 space-y-4">
                    <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2">
                        <Zap size={17} className="text-yellow-500" /> Provedores Premium
                    </h2>

                    {/* ── Card Codex Pro ─────────────────────────────────── */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">⚡</span>
                                <h3 className="font-semibold text-gray-900">Codex Pro</h3>
                                {codexInfo.authenticated ? (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">conectado</span>
                                ) : (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">desconectado</span>
                                )}
                            </div>
                            {codexInfo.authenticated ? (
                                <button
                                    onClick={handleCodexDisconnect}
                                    className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 transition hover:bg-red-50"
                                >
                                    <Link2Off size={13} /> Desconectar
                                </button>
                            ) : (
                                <button
                                    onClick={handleCodexConnect}
                                    disabled={codexConnecting}
                                    className="inline-flex items-center gap-1.5 text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 transition disabled:opacity-60"
                                >
                                    {codexConnecting ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                                    {codexConnecting ? 'Aguardando...' : 'Conectar'}
                                </button>
                            )}
                        </div>

                        {codexInfo.accountId && (
                            <p className="text-xs text-gray-400">Account: <span className="font-mono text-gray-600">{codexInfo.accountId}</span></p>
                        )}

                        {codexInfo.authenticated && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Modelo</label>
                                    <div className="space-y-1 border border-gray-200 rounded-xl p-1.5 max-h-40 overflow-y-auto">
                                        {(codexInfo.models || []).map(m => (
                                            <button
                                                key={m}
                                                onClick={() => setCodexModel(m)}
                                                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition flex items-center justify-between ${
                                                    codexModel === m ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                                                }`}
                                            >
                                                <span className="font-mono">{m}</span>
                                                {codexModel === m && <Check size={13} className="text-blue-600" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    onClick={() => activateOAuthProvider('codex', codexModel)}
                                    disabled={provider === 'codex'}
                                    className={`w-full py-2.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 ${
                                        provider === 'codex'
                                            ? 'bg-green-100 text-green-700 cursor-default'
                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                >
                                    {provider === 'codex'
                                        ? <><Check size={15} /> Ativo para IA</>
                                        : <><Zap size={15} /> Usar para IA</>}
                                </button>

                                <div>
                                    <button
                                        onClick={fetchCodexUsage}
                                        disabled={codexUsageLoading}
                                        className="inline-flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                                    >
                                        {codexUsageLoading ? <Loader2 size={13} className="animate-spin" /> : <BarChart2 size={13} />}
                                        Ver consumo
                                    </button>
                                    {codexUsage && <UsageChart data={codexUsage} />}
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── Card Claude ────────────────────────────────────── */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">🧠</span>
                                <h3 className="font-semibold text-gray-900">Claude (Anthropic)</h3>
                                {claudeInfo.authenticated ? (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">conectado</span>
                                ) : (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">desconectado</span>
                                )}
                            </div>
                            {claudeInfo.authenticated ? (
                                <button
                                    onClick={handleClaudeDisconnect}
                                    className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 transition hover:bg-red-50"
                                >
                                    <Link2Off size={13} /> Desconectar
                                </button>
                            ) : (
                                <button
                                    onClick={handleClaudeConnect}
                                    disabled={claudeConnecting}
                                    className="inline-flex items-center gap-1.5 text-xs bg-purple-600 text-white rounded-lg px-3 py-1.5 hover:bg-purple-700 transition disabled:opacity-60"
                                >
                                    {claudeConnecting ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                                    {claudeConnecting ? 'Aguardando...' : 'Conectar'}
                                </button>
                            )}
                        </div>

                        {claudeInfo.accountEmail && (
                            <p className="text-xs text-gray-400">
                                Conta: <span className="text-gray-600">{claudeInfo.accountEmail}</span>
                                {claudeInfo.subscriptionType && (
                                    <span className="ml-2 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">{claudeInfo.subscriptionType}</span>
                                )}
                            </p>
                        )}

                        {claudeInfo.authenticated && !claudeInfo.hasInferenceScope && (
                            <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                                ⚠️ Conta sem escopo de inferência. Reconecte para habilitar o uso de IA.
                            </p>
                        )}

                        {claudeInfo.authenticated && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Modelo</label>
                                    <div className="space-y-1 border border-gray-200 rounded-xl p-1.5 max-h-40 overflow-y-auto">
                                        {(claudeInfo.models || []).map(m => (
                                            <button
                                                key={m}
                                                onClick={() => setClaudeModel(m)}
                                                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition flex items-center justify-between ${
                                                    claudeModel === m ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                                                }`}
                                            >
                                                <span className="font-mono">{m}</span>
                                                {claudeModel === m && <Check size={13} className="text-purple-600" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    onClick={() => activateOAuthProvider('claude', claudeModel)}
                                    disabled={provider === 'claude' || !claudeInfo.hasInferenceScope}
                                    className={`w-full py-2.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 ${
                                        provider === 'claude'
                                            ? 'bg-green-100 text-green-700 cursor-default'
                                            : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50'
                                    }`}
                                >
                                    {provider === 'claude'
                                        ? <><Check size={15} /> Ativo para IA</>
                                        : <><Zap size={15} /> Usar para IA</>}
                                </button>

                                <div>
                                    <button
                                        onClick={fetchClaudeUsage}
                                        disabled={claudeUsageLoading}
                                        className="inline-flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                                    >
                                        {claudeUsageLoading ? <Loader2 size={13} className="animate-spin" /> : <BarChart2 size={13} />}
                                        Ver consumo
                                    </button>
                                    {claudeUsage && <UsageChart data={claudeUsage} />}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
