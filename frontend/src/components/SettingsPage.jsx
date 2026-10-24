import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, BarChart2, Bot, Check, ChevronRight, CirclePower, Key,
    Link2, Link2Off, Loader2, Pencil, Plus, RefreshCw, Server, Settings,
    ShieldCheck, Trash2, Unplug, Zap,
} from 'lucide-react';
import api from '../services/api';
import { toast } from '../utils/toast';
import AppHeader from './AppHeader';
import UsageChart from './UsageChart';

const EMPTY_ACCOUNT = {
    name: '', base_url: '', api_key: '', default_model: '',
    temperature: '', top_p: '', max_tokens: '', reasoning_effort: '', enabled: true,
};
const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function errorMessage(error, fallback) {
    return error?.response?.data?.detail || fallback;
}

function StatusBadge({ active, children }) {
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{children}</span>;
}

function ModelList({ models, value, onChange, accent = 'blue' }) {
    const selectedClass = accent === 'purple' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700';
    return (
        <div className="border border-gray-200 rounded-lg p-1 max-h-44 overflow-y-auto">
            {models.map(item => (
                <button type="button" key={item} onClick={() => onChange(item)} className={`w-full min-w-0 px-3 py-2 rounded-md text-sm text-left flex items-center justify-between gap-3 ${value === item ? `${selectedClass} font-medium` : 'text-gray-700 hover:bg-gray-50'}`}>
                    <span className="font-mono truncate">{item}</span>
                    {value === item && <Check size={14} className="shrink-0" />}
                </button>
            ))}
        </div>
    );
}

export default function SettingsPage() {
    const navigate = useNavigate();
    const userName = localStorage.getItem('userName') || '';
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    const [section, setSection] = useState('general');
    const [providers, setProviders] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [provider, setProvider] = useState('ollama');
    const [model, setModel] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [hasApiKey, setHasApiKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [codexConnecting, setCodexConnecting] = useState(false);
    const [codexUsage, setCodexUsage] = useState(null);
    const [codexUsageLoading, setCodexUsageLoading] = useState(false);
    const [codexModel, setCodexModel] = useState('gpt-5.5');
    const [claudeConnecting, setClaudeConnecting] = useState(false);
    const [claudeUsage, setClaudeUsage] = useState(null);
    const [claudeUsageLoading, setClaudeUsageLoading] = useState(false);
    const [claudeModel, setClaudeModel] = useState('claude-sonnet-5');
    const [editingId, setEditingId] = useState(null);
    const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT);
    const [accountSaving, setAccountSaving] = useState(false);
    const [testingId, setTestingId] = useState(null);
    const [testModels, setTestModels] = useState([]);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [providerResponse, settingsResponse, accountsResponse] = await Promise.all([
                api.get('/ai/providers'), api.get('/ai/settings'), api.get('/ai/provider-accounts'),
            ]);
            const currentProvider = settingsResponse.data.provider || 'ollama';
            const currentModel = settingsResponse.data.chat_model || '';
            setProviders(providerResponse.data);
            setAccounts(accountsResponse.data);
            setProvider(currentProvider);
            setModel(currentModel);
            setHasApiKey(settingsResponse.data.has_openai_key || false);
            if (currentProvider === 'codex' && currentModel) setCodexModel(currentModel);
            if (currentProvider === 'claude' && currentModel) setClaudeModel(currentModel);
        } catch (error) {
            toast.error(errorMessage(error, 'Erro ao carregar configurações de IA.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const activeAccount = useMemo(() => accounts.find(account => account.selected), [accounts]);
    const ollamaOnline = providers?.ollama?.available ?? false;
    const codexInfo = providers?.codex || {};
    const claudeInfo = providers?.claude || {};
    const standardProvider = provider === 'openai' || provider === 'ollama' ? provider : null;
    const availableModels = standardProvider === 'ollama'
        ? providers?.ollama?.models || []
        : standardProvider === 'openai'
            ? providers?.openai?.models || []
            : [];

    const handleSave = async () => {
        if (!standardProvider) return toast.error('Selecione Ollama ou OpenAI.');
        if (!model.trim()) return toast.error('Selecione ou informe um modelo.');
        setSaving(true);
        try {
            await api.put('/ai/settings', { provider: standardProvider, chat_model: model.trim(), openai_api_key: standardProvider === 'openai' ? (apiKey || null) : null });
            setProvider(standardProvider);
            if (apiKey) setHasApiKey(true);
            toast.success('Configurações de IA salvas.');
            await fetchAll();
        } catch (error) {
            toast.error(errorMessage(error, 'Erro ao salvar configurações.'));
        } finally { setSaving(false); }
    };

    const activateOAuthProvider = async (providerName, chosenModel) => {
        if (!chosenModel) return;
        try {
            await api.put('/ai/settings', { provider: providerName, chat_model: chosenModel, openai_api_key: null });
            toast.success(`${providerName === 'codex' ? 'Codex Pro' : 'Claude'} ativado.`);
            await fetchAll();
        } catch (error) { toast.error(errorMessage(error, 'Erro ao ativar provedor.')); }
    };

    const startOAuth = async kind => {
        const isCodex = kind === 'codex';
        const setConnecting = isCodex ? setCodexConnecting : setClaudeConnecting;
        setConnecting(true);
        try {
            const { data } = await api.post(`/api/${kind}-oauth/start`);
            const popup = window.open(data.auth_url, `${kind}-oauth`, 'width=520,height=700');
            const poll = setInterval(async () => {
                try {
                    const response = await api.get(`/api/${kind}-oauth/status`);
                    if (response.data.authenticated) {
                        clearInterval(poll); popup?.close(); setConnecting(false);
                        toast.success(`${isCodex ? 'Codex Pro' : 'Claude'} conectado.`); fetchAll();
                    }
                } catch { /* mantém o polling enquanto a janela OAuth está aberta */ }
            }, 2000);
            setTimeout(() => { clearInterval(poll); setConnecting(false); }, 180000);
        } catch (error) {
            setConnecting(false);
            toast.error(errorMessage(error, `Erro ao conectar ${isCodex ? 'Codex' : 'Claude'}.`));
        }
    };

    const disconnectOAuth = async kind => {
        try {
            await api.post(`/api/${kind}-oauth/logout`);
            toast.success(`${kind === 'codex' ? 'Codex' : 'Claude'} desconectado.`);
            await fetchAll();
        } catch (error) { toast.error(errorMessage(error, 'Erro ao desconectar provedor.')); }
    };

    const fetchUsage = async kind => {
        const setUsageLoading = kind === 'codex' ? setCodexUsageLoading : setClaudeUsageLoading;
        const setUsage = kind === 'codex' ? setCodexUsage : setClaudeUsage;
        setUsageLoading(true);
        try { const { data } = await api.get(`/api/${kind}-oauth/usage`); setUsage(data); }
        catch (error) { toast.error(errorMessage(error, 'Erro ao buscar consumo.')); }
        finally { setUsageLoading(false); }
    };

    const newAccount = () => { setEditingId(null); setAccountForm(EMPTY_ACCOUNT); setTestModels([]); };
    const editAccount = account => {
        setEditingId(account.id);
        setAccountForm({
            name: account.name,
            base_url: account.base_url,
            api_key: '',
            default_model: account.default_model,
            temperature: account.temperature ?? '',
            top_p: account.top_p ?? '',
            max_tokens: account.max_tokens ?? '',
            reasoning_effort: account.reasoning_effort ?? '',
            enabled: account.enabled,
        });
        setTestModels([]);
    };

    const saveAccount = async event => {
        event.preventDefault();
        if (!accountForm.name.trim() || !accountForm.base_url.trim() || !accountForm.default_model.trim()) return toast.error('Preencha nome, URL base e modelo padrão.');
        if (!editingId && !accountForm.api_key.trim()) return toast.error('Informe a chave da API.');
        setAccountSaving(true);
        try {
            const payload = {
                ...accountForm,
                name: accountForm.name.trim(),
                base_url: accountForm.base_url.trim(),
                default_model: accountForm.default_model.trim(),
                api_key: accountForm.api_key || (editingId ? null : ''),
                temperature: accountForm.temperature === '' ? null : Number(accountForm.temperature),
                top_p: accountForm.top_p === '' ? null : Number(accountForm.top_p),
                max_tokens: accountForm.max_tokens === '' ? null : Number(accountForm.max_tokens),
                reasoning_effort: accountForm.reasoning_effort || null,
            };
            const response = editingId ? await api.put(`/ai/provider-accounts/${editingId}`, payload) : await api.post('/ai/provider-accounts', payload);
            toast.success(editingId ? 'Conta atualizada.' : 'Conta adicionada.');
            setEditingId(response.data.id);
            setAccountForm(form => ({ ...form, api_key: '' }));
            await fetchAll();
        } catch (error) { toast.error(errorMessage(error, 'Erro ao salvar conta.')); }
        finally { setAccountSaving(false); }
    };

    // Testa URL + chave do formulário (antes de salvar) e carrega os modelos para escolha.
    const discoverModels = async () => {
        if (!accountForm.base_url.trim()) return toast.error('Informe a URL base.');
        if (!editingId && !accountForm.api_key.trim()) return toast.error('Informe a chave da API.');
        setTestingId(editingId ?? 'new');
        try {
            const { data } = await api.post('/ai/provider-accounts/discover', {
                base_url: accountForm.base_url.trim(),
                api_key: accountForm.api_key || null,
                account_id: editingId,
            });
            const models = data.models || [];
            setTestModels(models);
            if (models.length && !models.includes(accountForm.default_model)) {
                setAccountForm(form => ({ ...form, default_model: models[0] }));
            }
            toast.success(`Conexão validada: ${models.length} modelo(s).`);
        } catch (error) { toast.error(errorMessage(error, 'Falha ao conectar ao provedor.')); }
        finally { setTestingId(null); }
    };

    const activateAccount = async account => {
        if (!account) return;
        try {
            await api.post(`/ai/provider-accounts/${account.id}/activate`, { chat_model: accountForm.default_model || account.default_model });
            toast.success(`${account.name} agora é o provedor ativo.`);
            await fetchAll();
        } catch (error) { toast.error(errorMessage(error, 'Erro ao ativar conta.')); }
    };

    const deleteAccount = async account => {
        if (!account || !window.confirm(`Excluir a conta "${account.name}"?`)) return;
        try {
            await api.delete(`/ai/provider-accounts/${account.id}`);
            if (editingId === account.id) newAccount();
            toast.success('Conta excluída.');
            await fetchAll();
        } catch (error) { toast.error(errorMessage(error, 'Erro ao excluir conta.')); }
    };

    const selectedAccount = accounts.find(item => item.id === editingId);
    const navItems = [{ id: 'general', label: 'IA principal', icon: Bot }, { id: 'accounts', label: 'Contas de provedor', icon: Server }];

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <AppHeader userName={userName} isAdmin={isAdmin} />
            <main className="max-w-6xl mx-auto px-4 py-7">
                <div className="flex items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3 min-w-0">
                        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-200 text-gray-500" title="Voltar"><ArrowLeft size={20} /></button>
                        <div className="min-w-0"><h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Settings size={22} /> Configurações</h1><p className="text-sm text-gray-500 mt-0.5">Gerencie como a inteligência artificial é usada na biblioteca.</p></div>
                    </div>
                    <button onClick={fetchAll} disabled={loading} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50" title="Atualizar"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-6 items-start">
                    <aside className="bg-white border border-gray-200 rounded-lg p-2 md:sticky md:top-4" aria-label="Seções das configurações">
                        <nav className="grid grid-cols-2 md:flex md:flex-col gap-1">
                            {navItems.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setSection(item.id)} className={`w-full min-w-0 flex items-center gap-2 px-2.5 md:px-3 py-2.5 rounded-md text-sm font-medium text-left ${section === item.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}><Icon size={17} className="shrink-0" /><span className="flex-1 truncate">{item.label}</span><ChevronRight size={15} className="hidden md:block" /></button>; })}
                        </nav>
                    </aside>

                    {section === 'general' ? (
                        <section className="space-y-6 min-w-0">
                            {activeAccount && <div className="border border-emerald-200 bg-emerald-50 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"><ShieldCheck size={20} className="text-emerald-600 shrink-0" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-emerald-900">{activeAccount.name} está em uso</p><p className="text-xs text-emerald-700 truncate">{model} · {activeAccount.base_url}</p></div><button onClick={() => setSection('accounts')} className="text-sm font-medium text-emerald-800 hover:text-emerald-950">Gerenciar</button></div>}

                            <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 space-y-5">
                                <div><h2 className="text-base font-semibold text-gray-900">Provedor padrão</h2><p className="text-sm text-gray-500 mt-1">Use uma instalação local ou sua conta direta da OpenAI.</p></div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <button onClick={() => { setProvider('ollama'); setModel(''); }} className={`border rounded-lg px-4 py-3 text-left ${standardProvider === 'ollama' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}><span className="flex items-center justify-between gap-2"><strong className="text-sm text-gray-900">Ollama</strong><StatusBadge active={ollamaOnline}>{ollamaOnline ? 'online' : 'offline'}</StatusBadge></span><span className="text-xs text-gray-500 mt-1 block">Execução local</span></button>
                                    <button onClick={() => { setProvider('openai'); setModel(''); }} className={`border rounded-lg px-4 py-3 text-left ${standardProvider === 'openai' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}><span className="flex items-center justify-between gap-2"><strong className="text-sm text-gray-900">OpenAI</strong>{provider === 'openai' && <Check size={16} className="text-blue-600" />}</span><span className="text-xs text-gray-500 mt-1 block">API oficial</span></button>
                                </div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Modelo</label>{loading ? <div className="flex items-center gap-2 text-sm text-gray-400 py-3"><Loader2 size={16} className="animate-spin" /> Carregando modelos...</div> : availableModels.length ? <ModelList models={availableModels} value={model} onChange={setModel} /> : null}<input value={standardProvider ? model : ''} onChange={event => setModel(event.target.value)} disabled={!standardProvider} placeholder={!standardProvider ? 'Selecione um provedor padrão acima' : standardProvider === 'ollama' ? 'Ex.: llama3.1:8b' : 'Ex.: gpt-4o-mini'} className={`${inputClass} mt-2 font-mono disabled:bg-gray-50 disabled:text-gray-400`} /></div>
                                {standardProvider === 'openai' && <div><label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2"><Key size={14} /> Chave da API {hasApiKey && <span className="text-xs text-emerald-600 font-normal">configurada</span>}</label><input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={hasApiKey ? 'Deixe vazio para manter a atual' : 'sk-...'} className={inputClass} autoComplete="new-password" /></div>}
                                <button onClick={handleSave} disabled={saving || !standardProvider || !model.trim()} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Salvar e usar</button>
                            </div>

                            <div><div className="mb-3"><h2 className="text-base font-semibold text-gray-900">Contas conectadas</h2><p className="text-sm text-gray-500 mt-1">Provedores autenticados por assinatura.</p></div>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
                                        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 min-w-0"><Zap size={18} className="text-blue-600" /><h3 className="font-semibold text-gray-900">Codex Pro</h3><StatusBadge active={codexInfo.authenticated}>{codexInfo.authenticated ? 'conectado' : 'desconectado'}</StatusBadge></div><button onClick={() => codexInfo.authenticated ? disconnectOAuth('codex') : startOAuth('codex')} disabled={codexConnecting} className={`p-2 rounded-lg border ${codexInfo.authenticated ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-blue-200 text-blue-600 hover:bg-blue-50'}`} title={codexInfo.authenticated ? 'Desconectar' : 'Conectar'}>{codexConnecting ? <Loader2 size={16} className="animate-spin" /> : codexInfo.authenticated ? <Link2Off size={16} /> : <Link2 size={16} />}</button></div>
                                        {codexInfo.authenticated && <><ModelList models={codexInfo.models || []} value={codexModel} onChange={setCodexModel} /><button onClick={() => activateOAuthProvider('codex', codexModel)} disabled={provider === 'codex'} className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-emerald-100 disabled:text-emerald-700">{provider === 'codex' ? 'Ativo para IA' : 'Usar para IA'}</button><button onClick={() => fetchUsage('codex')} disabled={codexUsageLoading} className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900">{codexUsageLoading ? <Loader2 size={13} className="animate-spin" /> : <BarChart2 size={13} />} Ver consumo</button>{codexUsage && <UsageChart data={codexUsage} />}</>}
                                    </div>
                                    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
                                        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 min-w-0"><CirclePower size={18} className="text-purple-600" /><h3 className="font-semibold text-gray-900">Claude</h3><StatusBadge active={claudeInfo.authenticated}>{claudeInfo.authenticated ? 'conectado' : 'desconectado'}</StatusBadge></div><button onClick={() => claudeInfo.authenticated ? disconnectOAuth('claude') : startOAuth('claude')} disabled={claudeConnecting} className={`p-2 rounded-lg border ${claudeInfo.authenticated ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-purple-200 text-purple-600 hover:bg-purple-50'}`} title={claudeInfo.authenticated ? 'Desconectar' : 'Conectar'}>{claudeConnecting ? <Loader2 size={16} className="animate-spin" /> : claudeInfo.authenticated ? <Link2Off size={16} /> : <Link2 size={16} />}</button></div>
                                        {claudeInfo.authenticated && <><ModelList models={claudeInfo.models || []} value={claudeModel} onChange={setClaudeModel} accent="purple" /><button onClick={() => activateOAuthProvider('claude', claudeModel)} disabled={provider === 'claude' || !claudeInfo.hasInferenceScope} className="w-full py-2.5 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:bg-emerald-100 disabled:text-emerald-700">{provider === 'claude' ? 'Ativo para IA' : 'Usar para IA'}</button><button onClick={() => fetchUsage('claude')} disabled={claudeUsageLoading} className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900">{claudeUsageLoading ? <Loader2 size={13} className="animate-spin" /> : <BarChart2 size={13} />} Ver consumo</button>{claudeUsage && <UsageChart data={claudeUsage} />}</>}
                                    </div>
                                </div>
                            </div>
                        </section>
                    ) : (
                        <section className="min-w-0">
                            <div className="mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-gray-900">Contas OpenAI-compatible</h2><p className="text-sm text-gray-500 mt-1">Cadastre serviços que implementam a API da OpenAI, cada um com sua própria URL, chave e modelo.</p></div><button onClick={newAccount} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"><Plus size={16} /> Nova conta</button></div>
                            <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
                                <div className="bg-white border border-gray-200 rounded-lg p-2 space-y-1">
                                    {accounts.length === 0 ? <div className="px-4 py-8 text-center"><Unplug size={24} className="mx-auto text-gray-300 mb-2" /><p className="text-sm font-medium text-gray-700">Nenhuma conta cadastrada</p><p className="text-xs text-gray-500 mt-1">Adicione o primeiro provedor ao lado.</p></div> : accounts.map(account => <button key={account.id} onClick={() => editAccount(account)} className={`w-full text-left px-3 py-3 rounded-md border ${editingId === account.id ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:bg-gray-50'}`}><span className="flex items-center justify-between gap-2"><strong className="text-sm text-gray-900 truncate">{account.name}</strong>{account.selected && <StatusBadge active>em uso</StatusBadge>}</span><span className="block text-xs text-gray-500 font-mono truncate mt-1">{account.default_model}</span>{!account.enabled && <span className="block text-xs text-amber-600 mt-1">desativada</span>}</button>)}
                                </div>
                                <form onSubmit={saveAccount} className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 space-y-5 min-w-0">
                                    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{editingId ? 'Editar conta' : 'Nova conta'}</h3><p className="text-xs text-gray-500 mt-1">A URL deve incluir o prefixo da API, normalmente <span className="font-mono">/v1</span>.</p></div>{editingId && <button type="button" onClick={() => deleteAccount(selectedAccount)} className="p-2 rounded-lg text-red-600 hover:bg-red-50" title="Excluir conta"><Trash2 size={17} /></button>}</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Nome da conta</label><input value={accountForm.name} onChange={event => setAccountForm(form => ({ ...form, name: event.target.value }))} placeholder="Ex.: NVIDIA NIM" className={inputClass} maxLength={120} /></div><div><label className="block text-sm font-medium text-gray-700 mb-1.5">Modelo padrão</label><input value={accountForm.default_model} onChange={event => setAccountForm(form => ({ ...form, default_model: event.target.value }))} placeholder="Ex.: openai/gpt-oss-20b" className={`${inputClass} font-mono`} list="provider-models" /><datalist id="provider-models">{testModels.map(item => <option value={item} key={item} />)}</datalist></div></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1.5">URL base</label><input type="url" value={accountForm.base_url} onChange={event => setAccountForm(form => ({ ...form, base_url: event.target.value }))} placeholder="https://integrate.api.nvidia.com/v1" className={`${inputClass} font-mono`} /></div>
                                    <div><label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5"><Key size={14} /> Chave da API</label><input type="password" value={accountForm.api_key} onChange={event => setAccountForm(form => ({ ...form, api_key: event.target.value }))} placeholder={editingId ? 'Deixe vazio para manter a chave atual' : 'Informe a chave do provedor'} className={inputClass} autoComplete="new-password" /></div>
                                    <div className="flex flex-col gap-2">
                                        <button type="button" onClick={discoverModels} disabled={testingId !== null} className="inline-flex items-center gap-2 w-fit px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">{testingId !== null ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Testar conexão e buscar modelos</button>
                                        {testModels.length > 0 && <ModelList models={testModels} value={accountForm.default_model} onChange={item => setAccountForm(form => ({ ...form, default_model: item }))} />}
                                    </div>
                                    <fieldset className="border-t border-gray-200 pt-5">
                                        <legend className="text-sm font-semibold text-gray-900 pr-2">Parâmetros de inferência</legend>
                                        <p className="text-xs text-gray-500 mb-4">Campos vazios usam o padrão definido pelo provedor.</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Temperature</label><input type="number" min="0" max="2" step="0.1" value={accountForm.temperature} onChange={event => setAccountForm(form => ({ ...form, temperature: event.target.value }))} placeholder="Padrão do provedor" className={inputClass} /></div>
                                            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Top P</label><input type="number" min="0" max="1" step="0.05" value={accountForm.top_p} onChange={event => setAccountForm(form => ({ ...form, top_p: event.target.value }))} placeholder="Padrão do provedor" className={inputClass} /></div>
                                            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Max tokens</label><input type="number" min="1" max="131072" step="1" value={accountForm.max_tokens} onChange={event => setAccountForm(form => ({ ...form, max_tokens: event.target.value }))} placeholder="Padrão do provedor" className={inputClass} /></div>
                                            <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Raciocínio</label><select value={accountForm.reasoning_effort} onChange={event => setAccountForm(form => ({ ...form, reasoning_effort: event.target.value }))} className={inputClass}><option value="">Padrão do provedor</option><option value="low">Baixo</option><option value="medium">Médio</option><option value="high">Alto</option></select></div>
                                        </div>
                                    </fieldset>
                                    <label className="flex items-center gap-3 cursor-pointer w-fit"><input type="checkbox" checked={accountForm.enabled} onChange={event => setAccountForm(form => ({ ...form, enabled: event.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><span><span className="block text-sm font-medium text-gray-800">Conta ativa</span><span className="block text-xs text-gray-500">Permite selecionar esta conta para inferência.</span></span></label>
                                    <div className="flex flex-wrap items-center gap-2 pt-1"><button type="submit" disabled={accountSaving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">{accountSaving ? <Loader2 size={16} className="animate-spin" /> : editingId ? <Pencil size={16} /> : <Plus size={16} />}{editingId ? 'Salvar alterações' : 'Adicionar conta'}</button>{editingId && <><button type="button" onClick={() => activateAccount(selectedAccount)} disabled={!accountForm.enabled || selectedAccount?.selected} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-300 text-emerald-700 text-sm font-medium hover:bg-emerald-50 disabled:opacity-50"><Zap size={16} />{selectedAccount?.selected ? 'Em uso' : 'Usar esta conta'}</button></>}</div>
                                </form>
                            </div>
                        </section>
                    )}
                </div>
            </main>
        </div>
    );
}
