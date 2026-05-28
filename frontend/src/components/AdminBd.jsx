import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Database, Loader2, Search } from 'lucide-react';
import api from '../services/api';

const tabs = [
    { id: 'diagnostico', label: 'Diagnóstico' },
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

const FolderSelect = ({ value, onChange, folders, loading, id }) => (
    <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:bg-gray-100"
    >
        <option value="">{loading ? 'Carregando pastas...' : 'Biblioteca completa'}</option>
        {folders.map((f) => (
            <option value={f.rel} key={f.rel}>
                {'  '.repeat(f.depth) + f.nome}
            </option>
        ))}
    </select>
);

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
            const response = await api.get('/admin/bd/search-books', {
                params: { q: searchQuery },
            });
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
                            id="diagnostico-folder"
                            value={selectedFolder}
                            onChange={setSelectedFolder}
                            folders={folders}
                            loading={foldersLoading}
                        />
                        {foldersLoading && <Loader2 size={18} className="absolute right-3 top-2.5 animate-spin text-gray-400" />}
                    </div>
                    <button
                        type="button"
                        onClick={handleScan}
                        disabled={scanning || foldersLoading}
                        className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {scanning ? <Loader2 size={18} className="animate-spin" /> : 'Analisar Diferenças'}
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
                                    <th className="border-b bg-gray-50 px-3 py-2 text-left">Título</th>
                                    <th className="border-b bg-gray-50 px-3 py-2 text-left">Área</th>
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
                                    <th className="border-b bg-gray-50 px-3 py-2 text-left">Título</th>
                                    <th className="border-b bg-gray-50 px-3 py-2 text-left">Área</th>
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
                        id="sync-folder"
                        value={syncFolder}
                        onChange={setSyncFolder}
                        folders={folders}
                        loading={foldersLoading}
                    />
                    {foldersLoading && <Loader2 size={18} className="absolute right-3 top-2.5 animate-spin text-gray-400" />}
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
                    Confirmo que quero aplicar alterações no banco
                </label>

                <button
                    type="button"
                    onClick={handleSync}
                    disabled={!syncConfirm || syncing}
                    className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {syncing && <Loader2 size={18} className="animate-spin" />}
                    {syncing ? 'Sincronizando...' : 'Executar Sincronização'}
                </button>
            </div>

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
                    Gera capas automaticamente para livros que ainda não possuem imagem cadastrada.
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
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSearch();
                            }}
                            placeholder="Buscar por título"
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
                                onClick={() => {
                                    setSelectedBook(book);
                                    setMoveResult(null);
                                }}
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
                        <p className="text-sm text-gray-500">{selectedBook.caminho || selectedBook.path || 'Caminho atual indisponível'}</p>
                    </div>

                    <div className="relative">
                        <FolderSelect
                            id="move-folder"
                            value={destFolder}
                            onChange={setDestFolder}
                            folders={folders}
                            loading={foldersLoading}
                        />
                        {foldersLoading && <Loader2 size={18} className="absolute right-3 top-2.5 animate-spin text-gray-400" />}
                    </div>

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
                        onClick={() => {
                            setActiveTab(tab.id);
                            setError('');
                        }}
                        className={`px-4 py-3 text-sm transition-colors ${activeTab === tab.id
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
