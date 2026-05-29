import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Database, Loader2, Search, ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import api from '../services/api';

const tabs = [
    { id: 'diagnostico', label: 'Diagnostico' },
    { id: 'sincronizar', label: 'Sincronizar' },
    { id: 'capas', label: 'Gerar Capas' },
    { id: 'mover', label: 'Mover Livro' },
];

const getErrorMessage = (err) => (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    'Ocorreu um erro inesperado.'
);

// Constroi arvore a partir da lista plana ordenada por rel
function buildTree(folders) {
    const map = {};
    const roots = [];
    for (const f of folders) {
        map[f.rel] = { ...f, children: [] };
    }
    for (const f of folders) {
        const lastSlash = f.rel.lastIndexOf('/');
        const parentRel = lastSlash === -1 ? null : f.rel.substring(0, lastSlash);
        if (parentRel !== null && map[parentRel]) {
            map[parentRel].children.push(map[f.rel]);
        } else {
            roots.push(map[f.rel]);
        }
    }
    return roots;
}

const FolderSelect = ({ value, onChange, folders, loading }) => {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState({});
    const dropdownRef = useRef(null);

    const tree = useMemo(() => buildTree(folders), [folders]);

    // Fecha ao clicar fora
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Auto-expande ate o item selecionado
    useEffect(() => {
        if (!value) return;
        const parts = value.split('/');
        const toExpand = {};
        for (let i = 1; i <= parts.length - 1; i++) {
            toExpand[parts.slice(0, i).join('/')] = true;
        }
        setExpanded(prev => ({ ...prev, ...toExpand }));
    }, [value]);

    const selectedLabel = value === ''
        ? 'Biblioteca completa'
        : folders.find(f => f.rel === value)?.nome || value;

    const toggle = (rel, e) => {
        e.stopPropagation();
        setExpanded(prev => ({ ...prev, [rel]: !prev[rel] }));
    };

    const select = (rel) => {
        onChange(rel);
        setOpen(false);
    };

    const renderNode = (node, level = 0) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = !!expanded[node.rel];
        const isSelected = value === node.rel;

        return (
            <div key={node.rel}>
                <div
                    onClick={() => select(node.rel)}
                    className={`flex items-center gap-1.5 cursor-pointer py-1.5 pr-3 text-sm transition-colors ${
                        isSelected
                            ? 'bg-purple-50 text-purple-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    style={{ paddingLeft: `${level * 16 + 10}px` }}
                >
                    {hasChildren ? (
                        <button
                            onClick={(e) => toggle(node.rel, e)}
                            className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 transition-colors"
                        >
                            <ChevronRight
                                size={14}
                                className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                            />
                        </button>
                    ) : (
                        <span className="w-5 flex-shrink-0" />
                    )}
                    {isExpanded || isSelected
                        ? <FolderOpen size={14} className="flex-shrink-0 text-yellow-500" />
                        : <Folder size={14} className="flex-shrink-0 text-gray-400" />
                    }
                    <span className="truncate">{node.nome}</span>
                </div>
                {hasChildren && isExpanded && (
                    <div>
                        {node.children.map(child => renderNode(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                disabled={loading}
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:bg-gray-100"
            >
                <span className="flex items-center gap-2 truncate">
                    <Folder size={15} className="flex-shrink-0 text-yellow-500" />
                    {loading ? 'Carregando pastas...' : selectedLabel}
                </span>
                <ChevronDown size={15} className={`flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && !loading && (
                <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden">
                    <div
                        onClick={() => select('')}
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-b border-gray-100 ${
                            value === '' ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <FolderOpen size={14} className="text-yellow-500 flex-shrink-0" />
                        Biblioteca completa
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1">
                        {tree.map(node => renderNode(node, 0))}
                    </div>
                </div>
            )}
        </div>
    );
};

const ErrorAlert = ({ message }) => {
    if (!message) return null;
    return (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <span>{message}</span>
        </div>
    );
};

const MetricCard = ({ label, value }) => (
    <div className="rounded-xl border bg-white p-4 text-center">
        <div className="text-2xl font-bold text-gray-900">{value ?? 0}</div>
        <div className="mt-1 text-sm text-gray-500">{label}</div>
    </div>
);

const AdminBd = () => {
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('diagnostico');
    const [error, setError] = useState('');

    const [folders, setFolders] = useState([]);
    const [foldersLoading, setFoldersLoading] = useState(false);

    const [selectedFolder, setSelectedFolder] = useState('');
    const [scanResult, setScanResult] = useState(null);
    const [scanning, setScanning] = useState(false);

    const [syncFolder, setSyncFolder] = useState('');
    const [syncGerCapas, setSyncGerCapas] = useState(false);
    const [syncConfirm, setSyncConfirm] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);
    const [smartSyncing, setSmartSyncing] = useState(false);
    const [smartSyncResult, setSmartSyncResult] = useState(null);

    const [coverLoading, setCoverLoading] = useState(false);
    const [coverResult, setCoverResult] = useState(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedBook, setSelectedBook] = useState(null);
    const [destFolder, setDestFolder] = useState('');
    const [moving, setMoving] = useState(false);
    const [moveResult, setMoveResult] = useState(null);

    useEffect(() => {
        const loadFolders = async () => {
            setFoldersLoading(true);
            setError('');
            try {
                const response = await api.get('/admin/bd/folders');
                setFolders(Array.isArray(response.data) ? response.data : response.data?.folders || []);
            } catch (err) {
                setError(getErrorMessage(err));
            } finally {
                setFoldersLoading(false);
            }
        };
        loadFolders();
    }, []);

    const handleScan = async () => {
        setScanning(true);
        setScanResult(null);
        setError('');
        try {
            const response = await api.post('/admin/bd/scan', { subpasta: selectedFolder });
            setScanResult(response.data);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setScanning(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        setError('');
        try {
            const response = await api.post('/admin/bd/sync', {
                subpasta: syncFolder,
                gerar_capas: syncGerCapas,
            });
            setSyncResult(response.data);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setSyncing(false);
        }
    };

    const handleSmartSync = async () => {
        setSmartSyncing(true);
        setSmartSyncResult(null);
        setError('');
        try {
            const response = await api.post('/admin/bd/smart-sync', {
                subpasta: syncFolder,
                gerar_capas: syncGerCapas,
            });
            setSmartSyncResult(response.data);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setSmartSyncing(false);
        }
    };

    const handleGenerateCovers = async () => {
        setCoverLoading(true);
        setCoverResult(null);
        setError('');
        try {
            const response = await api.post('/admin/bd/generate-covers');
            setCoverResult(response.data);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setCoverLoading(false);
        }
    };

    const handleSearch = async () => {
        setSearchLoading(true);
        setSearchResults([]);
        setSelectedBook(null);
        setMoveResult(null);
        setError('');
        try {
            const response = await api.get('/admin/bd/search-books', { params: { q: searchQuery } });
            const results = Array.isArray(response.data) ? response.data : response.data?.results || [];
            setSearchResults(results.slice(0, 20));
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setSearchLoading(false);
        }
    };

    const handleMove = async () => {
        if (!selectedBook) return;
        setMoving(true);
        setMoveResult(null);
        setError('');
        try {
            const response = await api.post('/admin/bd/move', {
                livro_id: selectedBook.id,
                pasta_destino: destFolder,
            });
            setMoveResult(response.data);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setMoving(false);
        }
    };

    const renderDiagnostico = () => (
        <div className="space-y-6">
            <div className="rounded-xl border bg-white p-5">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">Selecionar Escopo</h2>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div className="relative">
                        <FolderSelect
                            value={selectedFolder}
                            onChange={setSelectedFolder}
                            folders={folders}
                            loading={foldersLoading}
                        />
                        {foldersLoading && <Loader2 size={18} className="absolute right-8 top-2.5 animate-spin text-gray-400" />}
                    </div>
                    <button
                        type="button"
                        onClick={handleScan}
                        disabled={scanning || foldersLoading}
                        className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {scanning ? <Loader2 size={18} className="animate-spin" /> : 'Analisar Diferencas'}
                    </button>
                </div>
            </div>

            {scanResult && (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        <MetricCard label="Total Pasta" value={scanResult.total_pasta} />
                        <MetricCard label="Total Banco" value={scanResult.total_banco} />
                        <MetricCard label="Para Inserir" value={scanResult.para_inserir?.length ?? scanResult.para_inserir} />
                        <MetricCard label="Para Excluir" value={scanResult.para_excluir?.length ?? scanResult.para_excluir} />
                    </div>

                    <div className="rounded-xl border bg-white p-5">
                        <h3 className="mb-4 font-semibold text-gray-900">Arquivos para Inserir</h3>
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr>
                                    <th className="border-b bg-gray-50 px-3 py-2 text-left">Titulo</th>
                                    <th className="border-b bg-gray-50 px-3 py-2 text-left">Area</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(scanResult.arquivos_para_inserir || scanResult.para_inserir || []).map((item, index) => (
                                    <tr key={`${item.titulo || item.nome || index}-${index}`}>
                                        <td className="border-b px-3 py-2">{item.titulo || item.nome || '-'}</td>
                                        <td className="border-b px-3 py-2">{item.area || item.pasta || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="rounded-xl border bg-white p-5">
                        <h3 className="mb-4 font-semibold text-gray-900">Registros para Excluir</h3>
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr>
                                    <th className="border-b bg-gray-50 px-3 py-2 text-left">ID</th>
                                    <th className="border-b bg-gray-50 px-3 py-2 text-left">Titulo</th>
                                    <th className="border-b bg-gray-50 px-3 py-2 text-left">Area</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(scanResult.registros_para_excluir || scanResult.para_excluir || []).map((item, index) => (
                                    <tr key={item.id || index} className="bg-red-50">
                                        <td className="border-b px-3 py-2">{item.id || '-'}</td>
                                        <td className="border-b px-3 py-2">{item.titulo || item.nome || '-'}</td>
                                        <td className="border-b px-3 py-2">{item.area || item.pasta || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );

    const renderSincronizar = () => (
        <div className="space-y-6">
            <div className="space-y-4 rounded-xl border bg-white p-5">
                <div className="relative">
                    <FolderSelect
                        value={syncFolder}
                        onChange={setSyncFolder}
                        folders={folders}
                        loading={foldersLoading}
                    />
                    {foldersLoading && <Loader2 size={18} className="absolute right-8 top-2.5 animate-spin text-gray-400" />}
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={syncGerCapas}
                        onChange={(e) => setSyncGerCapas(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    Gerar capas ao final
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={syncConfirm}
                        onChange={(e) => setSyncConfirm(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    Confirmo que quero aplicar alteracoes no banco
                </label>

                {/* Smart Sync — recomendado quando pastas foram reorganizadas */}
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
                    <div>
                        <p className="text-sm font-semibold text-green-800">Smart Sync — Recomendado</p>
                        <p className="text-xs text-green-700 mt-0.5">
                            Compara por nome de arquivo antes de deletar. Livros que mudaram de pasta
                            têm apenas o caminho atualizado — preservando capa, progresso e anotações.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleSmartSync}
                        disabled={!syncConfirm || smartSyncing || syncing}
                        className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {smartSyncing && <Loader2 size={18} className="animate-spin" />}
                        {smartSyncing ? 'Processando...' : 'Executar Smart Sync'}
                    </button>
                </div>

                {/* Sync normal — destrutivo */}
                <div className="rounded-lg border border-red-100 bg-red-50 p-4 space-y-3">
                    <div>
                        <p className="text-sm font-semibold text-red-800">Sync Normal — Destrutivo</p>
                        <p className="text-xs text-red-700 mt-0.5">
                            Deleta e reinseride livros que mudaram de pasta. Perde capas, progresso e anotações.
                            Use apenas quando quiser reset completo.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleSync}
                        disabled={!syncConfirm || syncing || smartSyncing}
                        className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {syncing && <Loader2 size={18} className="animate-spin" />}
                        {syncing ? 'Sincronizando...' : 'Executar Sync Normal'}
                    </button>
                </div>
            </div>

            {/* Resultado Smart Sync */}
            {smartSyncResult && (
                <div className="rounded-xl border border-green-200 bg-white p-5 space-y-4">
                    <h3 className="font-semibold text-green-800">Resultado Smart Sync</h3>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-green-50 p-3 text-center">
                            <p className="text-2xl font-bold text-green-700">{smartSyncResult.atualizados}</p>
                            <p className="text-xs text-green-600 mt-1">Atualizados (caminho)</p>
                        </div>
                        <div className="rounded-lg bg-blue-50 p-3 text-center">
                            <p className="text-2xl font-bold text-blue-700">{smartSyncResult.inseridos}</p>
                            <p className="text-xs text-blue-600 mt-1">Inseridos (novos)</p>
                        </div>
                        <div className="rounded-lg bg-red-50 p-3 text-center">
                            <p className="text-2xl font-bold text-red-700">{smartSyncResult.excluidos}</p>
                            <p className="text-xs text-red-600 mt-1">Excluídos (sumidos)</p>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500">
                        De {smartSyncResult.total_para_excluir_original} registros para excluir e {smartSyncResult.total_para_inserir_original} para inserir detectados no diagnóstico,
                        {' '}{smartSyncResult.atualizados} foram identificados como movidos e preservados.
                    </p>
                    {smartSyncResult.capas && (
                        <div className="mt-2 text-xs text-gray-600">
                            Capas: {smartSyncResult.capas.geradas} geradas / {smartSyncResult.capas.erros} erros
                        </div>
                    )}
                </div>
            )}

            {/* Resultado Sync Normal */}
            {syncResult && (
                <pre className="overflow-auto rounded-xl border bg-gray-900 p-4 text-sm text-gray-100">
                    {JSON.stringify(syncResult, null, 2)}
                </pre>
            )}
        </div>
    );

    const renderCapas = () => (
        <div className="space-y-6">
            <div className="space-y-4 rounded-xl border bg-white p-5">
                <p className="text-sm text-gray-600">
                    Gera capas automaticamente para livros que ainda nao possuem imagem cadastrada.
                </p>
                <button
                    type="button"
                    onClick={handleGenerateCovers}
                    disabled={coverLoading}
                    className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {coverLoading && <Loader2 size={18} className="animate-spin" />}
                    Gerar Capas Automaticamente
                </button>
            </div>

            {coverResult && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <MetricCard label="Total sem capa" value={coverResult.total_sem_capa} />
                    <MetricCard label="Geradas" value={coverResult.geradas} />
                    <MetricCard label="Ignorados" value={coverResult.ignorados} />
                    <MetricCard label="Erros" value={coverResult.erros} />
                </div>
            )}
        </div>
    );

    const renderMover = () => (
        <div className="space-y-6">
            <div className="rounded-xl border bg-white p-5">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                            placeholder="Buscar por titulo"
                            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handleSearch}
                        disabled={searchLoading}
                        className="flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {searchLoading && <Loader2 size={18} className="animate-spin" />}
                        Buscar
                    </button>
                </div>

                {searchResults.length > 0 && (
                    <div className="mt-4 divide-y rounded-lg border">
                        {searchResults.map((book) => (
                            <button
                                type="button"
                                key={book.id}
                                onClick={() => { setSelectedBook(book); setMoveResult(null); }}
                                className="block w-full px-4 py-3 text-left hover:bg-gray-50"
                            >
                                <div className="font-medium text-gray-900">{book.titulo || book.title}</div>
                                <div className="text-sm text-gray-500">{book.caminho || book.path || book.area}</div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {selectedBook && (
                <div className="space-y-4 rounded-xl border bg-white p-5">
                    <div>
                        <h3 className="font-semibold text-gray-900">{selectedBook.titulo || selectedBook.title}</h3>
                        <p className="text-sm text-gray-500">{selectedBook.caminho || selectedBook.path || 'Caminho atual indisponivel'}</p>
                    </div>

                    <FolderSelect
                        value={destFolder}
                        onChange={setDestFolder}
                        folders={folders}
                        loading={foldersLoading}
                    />

                    <button
                        type="button"
                        onClick={handleMove}
                        disabled={moving || foldersLoading}
                        className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {moving && <Loader2 size={18} className="animate-spin" />}
                        Mover
                    </button>
                </div>
            )}

            {moveResult && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    Livro movido com sucesso. Novo caminho: {moveResult.novo_caminho || moveResult.caminho || destFolder}
                </div>
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="border-b bg-white px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Database className="text-purple-600" size={26} />
                        <h1 className="text-xl font-semibold text-gray-900">AdminBd — Gerenciamento de Biblioteca</h1>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        <ArrowLeft size={16} />
                        Voltar
                    </button>
                </div>
            </header>

            <nav className="flex gap-1 border-b bg-white px-4">
                {tabs.map((tab) => (
                    <button
                        type="button"
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setError(''); }}
                        className={`px-4 py-3 text-sm transition-colors ${
                            activeTab === tab.id
                                ? 'border-b-2 border-purple-600 font-semibold text-purple-600'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            <main className="mx-auto max-w-4xl p-6">
                <div className="mb-6">
                    <ErrorAlert message={error} />
                </div>
                {activeTab === 'diagnostico' && renderDiagnostico()}
                {activeTab === 'sincronizar' && renderSincronizar()}
                {activeTab === 'capas' && renderCapas()}
                {activeTab === 'mover' && renderMover()}
            </main>
        </div>
    );
};

export default AdminBd;
