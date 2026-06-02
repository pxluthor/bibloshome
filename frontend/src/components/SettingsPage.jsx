import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Bot, Key, Check, Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import api from '../services/api';
import { toast } from '../utils/toast';
import AppHeader from './AppHeader';

export default function SettingsPage() {
    const navigate = useNavigate();
    const userName  = localStorage.getItem('userName')  || '';
    const isAdmin   = localStorage.getItem('isAdmin') === 'true';

    // ── Estado dos providers / modelos ─────────────────────────────────────
    const [providers, setProviders]     = useState(null);   // { ollama: {...}, openai: {...} }
    const [loadingProviders, setLoadingProviders] = useState(true);

    // ── Estado do form ────────────────────────────────────────────────────
    const [provider,  setProvider]  = useState('ollama');
    const [model,     setModel]     = useState('');
    const [apiKey,    setApiKey]    = useState('');
    const [hasApiKey, setHasApiKey] = useState(false);
    const [saving,    setSaving]    = useState(false);
    const [loaded,    setLoaded]    = useState(false);

    // ── Carrega providers + settings atuais ───────────────────────────────
    const fetchAll = async () => {
        setLoadingProviders(true);
        try {
            const [provRes, settRes] = await Promise.all([
                api.get('/ai/providers'),
                api.get('/ai/settings'),
            ]);
            setProviders(provRes.data);
            setProvider(settRes.data.provider  || 'ollama');
            setModel(settRes.data.chat_model    || '');
            setHasApiKey(settRes.data.has_openai_key || false);
            setLoaded(true);
        } catch {
            toast.error('Erro ao carregar configurações de IA.');
        } finally {
            setLoadingProviders(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);

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
            </main>
        </div>
    );
}
