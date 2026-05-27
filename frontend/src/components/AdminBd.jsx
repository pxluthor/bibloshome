import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Library, Database, FolderSearch, RefreshCw, Image,
    MoveRight, Search, CheckCircle, Loader2, X,
    ChevronRight, ChevronDown, Folder, FilePlus, Save, FileText
} from 'lucide-react';
import api from '../services/api';
import UserMenu from './UserMenu';

// ── Árvore de pastas expansível ───────────────────────────────────────────────
function buildTree(folders) {
    const root = {};
    for (const f of folders) {
        const parts = f.rel.split('/');
        let node = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!node[part]) node[part] = { _meta: null, _children: {} };
            if (i === parts.length - 1) node[part]._meta = f;
            node = node[part]._children;
        }
    }
    return root;
}

const TreeNode = ({ name, node, selectedRel, onSelect, depth = 0 }) => {
    const hasChildren = Object.keys(node._children).length > 0;
    const rel = node._meta?.rel ?? name;
    const isSelected = selectedRel === rel;
    const [open, setOpen] = useState(depth < 1); // raiz expandida por padrão

    return (
        <div>
            <div
                className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer text-sm transition-all hover:bg-gray-100 ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                style={{ paddingLeft: `${8 + depth * 16}px` }}
                onClick={() => { onSelect(rel); if (hasChildren) setOpen(o => !o); }}
            >
                {hasChildren ? (
                    open ? <ChevronDown size={14} className="flex-shrink-0 text-gray-400" /> : <ChevronRight size={14} className="flex-shrink-0 text-gray-400" />
                ) : (
                    <span className="w-3.5 flex-shrink-0" />
                )}
                <Folder size={14} className={`flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-amber-400'}`} />
                <span className="truncate">{name}</span>
            </div>
            {open && hasChildren && (
                <div>
                    {Object.entries(node._children).sort(([a], [b]) => a.localeCompare(b)).map(([childName, childNode]) => (
                        <TreeNode
                            key={childNode._meta?.rel ?? childName}
                            name={childName}
                            node={childNode}
                            selectedRel={selectedRel}
                            onSelect={onSelect}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const FolderTree = ({ selectedSubpasta, onSelect, folders, loading }) => {
    const [filter, setFilter] = useState('');

    const filtered = filter
        ? folders.filter(f => f.rel.toLowerCase().includes(filter.toLowerCase()))
        : folders;

    const tree = buildTree(filtered);

    return (
        <div className="space-y-2">
            <input
                type="text"
                placeholder="Filtrar pasta..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg py-1">
                {loading ? (
                    <div className="p-3 text-gray-400 text-center text-sm">Carregando pastas...</div>
                ) : (
                    <>
                        <div
                            className={`flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer text-sm transition hover:bg-gray-100 mx-1 ${selectedSubpasta === '' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                            onClick={() => onSelect('')}
                        >
                            <Folder size={14} className="text-blue-400 flex-shrink-0" />
                            (raiz completa)
                        </div>
                        {Object.entries(tree).sort(([a], [b]) => a.localeCompare(b)).map(([name, node]) => (
                            <TreeNode
                                key={node._meta?.rel ?? name}
                                name={name}
                                node={node}
                                selectedRel={selectedSubpasta}
                                onSelect={onSelect}
                                depth={0}
                            />
                        ))}
                        {filtered.length === 0 && (
                            <div className="p-3 text-gray-400 text-center text-sm">Nenhuma pasta encontrada</div>
                        )}
                    </>
                )}
            </div>
            {selectedSubpasta && (
                <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
                    <Folder size={12} /> {selectedSubpasta}
                </p>
            )}
        </div>
    );
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const MetricCard = ({ label, value, color = 'blue' }) => {
    const colors = { blue: 'bg-blue-50 text-blue-700 border-blue-200', green: 'bg-green-50 text-green-700 border-green-200', red: 'bg-red-50 text-red-700 border-red-200', gray: 'bg-gray-50 text-gray-700 border-gray-200' };
    return (
        <div className={`rounded-xl border p-4 ${colors[color]}`}>
            <div className="text-2xl font-bold">{value ?? '—'}</div>
            <div className="text-sm mt-0.5">{label}</div>
        </div>
    );
};

const SimpleTable = ({ rows, columns, emptyMsg }) => (
    rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">{emptyMsg}</p>
    ) : (
        <div className="overflow-auto max-h-64 border border-gray-200 rounded-lg">
            <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                    <tr>{columns.map(c => <th key={c.key} className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200">{c.label}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                            {columns.map(c => <td key={c.key} className="px-3 py-2 text-gray-700 truncate max-w-xs" title={row[c.key]}>{row[c.key] ?? '—'}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
);

const InputField = ({ label, name, value, onChange, type = 'text', placeholder, required, span2 }) => (
    <div className={span2 ? 'md:col-span-2' : ''}>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}{required && ' *'}</label>
        <input type={type} name={name} value={value} onChange={onChange} required={required}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            placeholder={placeholder} />
    </div>
);

// ── Componente principal ──────────────────────────────────────────────────────
const AdminBd = () => {
    const navigate = useNavigate();
    const userName = localStorage.getItem('userName') || 'Admin';
    const isAdmin = localStorage.getItem('isAdmin') === 'true';

    const [activeTab, setActiveTab] = useState('diagnostico');
    const [folders, setFolders] = useState([]);
    const [loadingFolders, setLoadingFolders] = useState(true);
    const [selectedSubpasta, setSelectedSubpasta] = useState('');

    // Diagnóstico
    const [diagnostico, setDiagnostico] = useState(null);
    const [loadingScan, setLoadingScan] = useState(false);
    const [scanError, setScanError] = useState('');

    // Sync
    const [confirmSync, setConfirmSync] = useState(false);
    const [gerarCapasSync, setGerarCapasSync] = useState(false);
    const [syncResult, setSyncResult] = useState(null);
    const [loadingSync, setLoadingSync] = useState(false);

    // Capas
    const [capasResult, setCapasResult] = useState(null);
    const [loadingCapas, setLoadingCapas] = useState(false);

    // Mover livro
    const [searchBook, setSearchBook] = useState('');
    const [bookResults, setBookResults] = useState([]);
    const [selectedBook, setSelectedBook] = useState(null);
    const [moveSubpasta, setMoveSubpasta] = useState('');
    const [moveResult, setMoveResult] = useState(null);
    const [loadingMove, setLoadingMove] = useState(false);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const searchDebounce = useRef(null);

    // Inserir livro
    const [stagingFiles, setStagingFiles] = useState([]);
    const [loadingStaging, setLoadingStaging] = useState(false);
    const [stagingFilter, setStagingFilter] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [insertDestino, setInsertDestino] = useState('');
    const [moverArquivo, setMoverArquivo] = useState(true);
    const [insertResult, setInsertResult] = useState(null);
    const [loadingInsert, setLoadingInsert] = useState(false);
    const [loadingExtract, setLoadingExtract] = useState(false);
    const [bookForm, setBookForm] = useState({ titulo: '', autor: '', editora: '', ano: '', paginas: '', genero: '', idioma: '', area: '', sinopse: '' });

    useEffect(() => {
        api.get('/admin/bd/folders')
            .then(r => setFolders(Array.isArray(r.data) ? r.data : []))
            .catch(() => {})
            .finally(() => setLoadingFolders(false));
    }, []);

    const fetchStaging = () => {
        setLoadingStaging(true);
        api.get('/admin/bd/staging-files')
            .then(r => setStagingFiles(Array.isArray(r.data) ? r.data : []))
            .catch(() => setStagingFiles([]))
            .finally(() => setLoadingStaging(false));
    };

    useEffect(() => {
        if (activeTab === 'inserir') fetchStaging();
    }, [activeTab]);

    useEffect(() => {
        clearTimeout(searchDebounce.current);
        if (searchBook.length < 2) { setBookResults([]); return; }
        searchDebounce.current = setTimeout(async () => {
            setLoadingSearch(true);
            try {
                const r = await api.get('/admin/bd/search-books', { params: { q: searchBook } });
                setBookResults(Array.isArray(r.data) ? r.data : []);
            } catch { setBookResults([]); }
            finally { setLoadingSearch(false); }
        }, 400);
        return () => clearTimeout(searchDebounce.current);
    }, [searchBook]);

    const handleScan = async () => {
        setLoadingScan(true); setScanError(''); setDiagnostico(null);
        try { const r = await api.post('/admin/bd/scan', { subpasta: selectedSubpasta }); setDiagnostico(r.data); }
        catch (e) { setScanError(e.response?.data?.detail || 'Erro ao analisar.'); }
        finally { setLoadingScan(false); }
    };

    const handleSync = async () => {
        setLoadingSync(true); setSyncResult(null);
        try { const r = await api.post('/admin/bd/sync', { subpasta: selectedSubpasta, gerar_capas: gerarCapasSync }); setSyncResult(r.data); setConfirmSync(false); }
        catch (e) { alert(e.response?.data?.detail || 'Erro ao sincronizar.'); }
        finally { setLoadingSync(false); }
    };

    const handleGenerateCovers = async () => {
        setLoadingCapas(true); setCapasResult(null);
        try { const r = await api.post('/admin/bd/generate-covers'); setCapasResult(r.data); }
        catch (e) { alert(e.response?.data?.detail || 'Erro ao gerar capas.'); }
        finally { setLoadingCapas(false); }
    };

    const handleMove = async () => {
        if (!selectedBook) return;
        setLoadingMove(true); setMoveResult(null);
        try { const r = await api.post('/admin/bd/move', { livro_id: selectedBook.id, pasta_destino: moveSubpasta }); setMoveResult(r.data); setSelectedBook(null); setMoveSubpasta(''); setSearchBook(''); }
        catch (e) { alert(e.response?.data?.detail || 'Erro ao mover livro.'); }
        finally { setLoadingMove(false); }
    };

    const handleSelectFile = (file) => {
        setSelectedFile(file);
        setInsertResult(null);
        // Pré-preencher título com o nome do arquivo sem extensão
        const nomeBase = file.nome.replace(/\.[^.]+$/, '');
        setBookForm(f => ({ ...f, titulo: nomeBase, area: '' }));
    };

    const handleFormChange = e => {
        const { name, value } = e.target;
        setBookForm(f => ({ ...f, [name]: value }));
    };

    const handleExtractMetadata = async () => {
        if (!selectedFile) return;
        setLoadingExtract(true);
        try {
            const r = await api.post('/ai/extract-metadata', { caminho: selectedFile.caminho_abs });
            if (r.data.error) { alert('IA não conseguiu extrair metadados: ' + r.data.error); return; }
            const d = r.data;
            setBookForm(f => ({
                ...f,
                titulo: d.titulo || f.titulo,
                autor: d.autor || f.autor,
                editora: d.editora || f.editora,
                ano: d.ano ? String(d.ano) : f.ano,
                paginas: d.paginas ? String(d.paginas) : f.paginas,
                genero: d.genero || f.genero,
                idioma: d.idioma || f.idioma,
                sinopse: d.sinopse || f.sinopse,
            }));
        } catch (e) {
            alert('Erro ao extrair metadados: ' + (e.response?.data?.detail || e.message));
        } finally {
            setLoadingExtract(false);
        }
    };

    const handleInsert = async e => {
        e.preventDefault();
        if (!selectedFile) return;
        setLoadingInsert(true); setInsertResult(null);
        try {
            const payload = {
                caminho_origem: selectedFile.caminho_abs,
                pasta_destino: insertDestino,
                mover_arquivo: moverArquivo,
                titulo: bookForm.titulo,
                autor: bookForm.autor,
                editora: bookForm.editora,
                ano: bookForm.ano ? parseInt(bookForm.ano) : null,
                paginas: bookForm.paginas ? parseInt(bookForm.paginas) : null,
                genero: bookForm.genero,
                idioma: bookForm.idioma,
                area: bookForm.area,
                sinopse: bookForm.sinopse,
            };
            const r = await api.post('/admin/bd/insert-book', payload);
            setInsertResult(r.data);
            setSelectedFile(null);
            setBookForm({ titulo: '', autor: '', editora: '', ano: '', paginas: '', genero: '', idioma: '', area: '', sinopse: '' });
            fetchStaging(); // atualizar lista de staging
        } catch (e) { alert(e.response?.data?.detail || 'Erro ao inserir livro.'); }
        finally { setLoadingInsert(false); }
    };

    const TABS = [
        { id: 'diagnostico', label: 'Diagnóstico', icon: <FolderSearch size={15} /> },
        { id: 'sync', label: 'Sincronizar', icon: <RefreshCw size={15} /> },
        { id: 'capas', label: 'Gerar Capas', icon: <Image size={15} /> },
        { id: 'mover', label: 'Mover Livro', icon: <MoveRight size={15} /> },
        { id: 'inserir', label: 'Inserir Livro', icon: <FilePlus size={15} /> },
    ];

    const stagingFiltered = stagingFiles.filter(f =>
        !stagingFilter || f.nome.toLowerCase().includes(stagingFilter.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <header className="bg-white shadow-sm sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
                        <div className="bg-blue-600 text-white p-2 rounded-lg"><Library size={24} /></div>
                        <h1 className="text-xl font-bold tracking-tight">Library<span className="text-green-600">Anywhere</span></h1>
                    </div>
                    <UserMenu userName={userName} isAdmin={isAdmin} pedidosPendentes={0} adminPendentes={0} />
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="bg-purple-100 text-purple-700 p-2 rounded-lg"><Database size={22} /></div>
                    <h2 className="text-2xl font-bold text-gray-900">AdminBd — Gerenciamento da Biblioteca</h2>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6 flex-wrap">
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-700 hover:border-blue-400'}`}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── DIAGNÓSTICO ── */}
                {activeTab === 'diagnostico' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h3 className="font-semibold text-gray-900 mb-4">Escopo de análise</h3>
                            <FolderTree selectedSubpasta={selectedSubpasta} onSelect={setSelectedSubpasta} folders={folders} loading={loadingFolders} />
                            <button onClick={handleScan} disabled={loadingScan}
                                className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50">
                                {loadingScan ? <Loader2 size={16} className="animate-spin" /> : <FolderSearch size={16} />}
                                Analisar Diferenças
                            </button>
                            {scanError && <p className="mt-3 text-sm text-red-600">{scanError}</p>}
                        </div>
                        {diagnostico && (<>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <MetricCard label="Total na pasta" value={diagnostico.total_pasta} color="blue" />
                                <MetricCard label="Total no banco" value={diagnostico.total_banco} color="gray" />
                                <MetricCard label="Para inserir" value={diagnostico.total_inserir} color="green" />
                                <MetricCard label="Para excluir" value={diagnostico.total_excluir} color="red" />
                            </div>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <h3 className="font-semibold text-green-700 mb-3">Para inserir ({diagnostico.total_inserir})</h3>
                                <SimpleTable rows={diagnostico.para_inserir} columns={[{ key: 'titulo', label: 'Título' }, { key: 'area', label: 'Área' }, { key: 'relativo', label: 'Caminho' }]} emptyMsg="Nenhum arquivo novo." />
                            </div>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <h3 className="font-semibold text-red-700 mb-3">Para excluir ({diagnostico.total_excluir})</h3>
                                <SimpleTable rows={diagnostico.para_excluir} columns={[{ key: 'id', label: 'ID' }, { key: 'titulo', label: 'Título' }, { key: 'area', label: 'Área' }, { key: 'relativo', label: 'Caminho' }]} emptyMsg="Nenhum registro para excluir." />
                            </div>
                        </>)}
                    </div>
                )}

                {/* ── SINCRONIZAR ── */}
                {activeTab === 'sync' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h3 className="font-semibold text-gray-900 mb-4">Escopo</h3>
                            <FolderTree selectedSubpasta={selectedSubpasta} onSelect={setSelectedSubpasta} folders={folders} loading={loadingFolders} />
                            <div className="mt-5 space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={confirmSync} onChange={e => setConfirmSync(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                                    <span className="text-sm font-medium text-gray-700">Confirmo que quero aplicar alterações no banco</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={gerarCapasSync} onChange={e => setGerarCapasSync(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                                    <span className="text-sm text-gray-700">Gerar capas ao final</span>
                                </label>
                            </div>
                            <button onClick={handleSync} disabled={!confirmSync || loadingSync}
                                className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-40">
                                {loadingSync ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                Executar Sincronização
                            </button>
                        </div>
                        {syncResult && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <div className="flex items-center gap-2 text-green-700 mb-4"><CheckCircle size={18} /><h3 className="font-semibold">Concluído</h3></div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <MetricCard label="Excluídos" value={syncResult.excluidos} color="red" />
                                    <MetricCard label="Inseridos" value={syncResult.inseridos} color="green" />
                                    <MetricCard label="Banco antes" value={syncResult.antes_banco} color="gray" />
                                    <MetricCard label="Banco depois" value={syncResult.depois_banco} color="blue" />
                                </div>
                                {syncResult.capas && <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <MetricCard label="Sem capa" value={syncResult.capas.total_sem_capa} color="gray" />
                                    <MetricCard label="Geradas" value={syncResult.capas.geradas} color="green" />
                                    <MetricCard label="Ignorados" value={syncResult.capas.ignorados} color="gray" />
                                    <MetricCard label="Erros" value={syncResult.capas.erros} color="red" />
                                </div>}
                            </div>
                        )}
                    </div>
                )}

                {/* ── GERAR CAPAS ── */}
                {activeTab === 'capas' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                        <p className="text-sm text-gray-600">Gera capas para livros sem imagem de capa, extraindo a primeira página do PDF.</p>
                        <button onClick={handleGenerateCovers} disabled={loadingCapas}
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50">
                            {loadingCapas ? <Loader2 size={16} className="animate-spin" /> : <Image size={16} />}
                            Gerar Capas Automaticamente
                        </button>
                        {capasResult && <div>
                            <div className="flex items-center gap-2 text-green-700 mb-3"><CheckCircle size={18} /><span className="font-semibold">Concluído</span></div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <MetricCard label="Sem capa" value={capasResult.total_sem_capa} color="gray" />
                                <MetricCard label="Geradas" value={capasResult.geradas} color="green" />
                                <MetricCard label="Ignorados" value={capasResult.ignorados} color="gray" />
                                <MetricCard label="Erros" value={capasResult.erros} color="red" />
                            </div>
                        </div>}
                    </div>
                )}

                {/* ── MOVER LIVRO ── */}
                {activeTab === 'mover' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h3 className="font-semibold text-gray-900 mb-4">1. Selecionar livro</h3>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-3 text-gray-400" />
                                <input type="text" placeholder="Buscar por título ou autor..." value={searchBook} onChange={e => setSearchBook(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                                {loadingSearch && <Loader2 size={14} className="absolute right-3 top-3 text-gray-400 animate-spin" />}
                            </div>
                            {bookResults.length > 0 && !selectedBook && (
                                <ul className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                    {bookResults.map(b => (
                                        <li key={b.id}>
                                            <button onClick={() => { setSelectedBook(b); setBookResults([]); setSearchBook(''); }} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition">
                                                <p className="text-sm font-medium text-gray-900 truncate">{b.titulo}</p>
                                                <p className="text-xs text-gray-500">{b.area || '—'} · {b.autor || '—'}</p>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {selectedBook && (
                                <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-semibold text-gray-900 truncate">{selectedBook.titulo}</p>
                                        <p className="text-xs text-gray-500 mt-0.5 truncate">{selectedBook.caminho}</p>
                                    </div>
                                    <button onClick={() => setSelectedBook(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={16} /></button>
                                </div>
                            )}
                        </div>
                        {selectedBook && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <h3 className="font-semibold text-gray-900 mb-4">2. Pasta de destino</h3>
                                <FolderTree selectedSubpasta={moveSubpasta} onSelect={setMoveSubpasta} folders={folders} loading={loadingFolders} />
                                <button onClick={handleMove} disabled={loadingMove}
                                    className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition disabled:opacity-50">
                                    {loadingMove ? <Loader2 size={16} className="animate-spin" /> : <MoveRight size={16} />}
                                    Mover Livro
                                </button>
                            </div>
                        )}
                        {moveResult && (
                            <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-6">
                                <div className="flex items-center gap-2 text-green-700 mb-3"><CheckCircle size={18} /><h3 className="font-semibold">Movido com sucesso</h3></div>
                                <div className="space-y-2 text-sm">
                                    <div><span className="text-gray-500 font-medium">De:</span><span className="ml-2 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{moveResult.caminho_antigo}</span></div>
                                    <div><span className="text-gray-500 font-medium">Para:</span><span className="ml-2 font-mono text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">{moveResult.caminho_novo}</span></div>
                                </div>
                                <button onClick={() => setMoveResult(null)} className="mt-3 text-sm text-gray-400 hover:text-gray-600">Mover outro</button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── INSERIR LIVRO ── */}
                {activeTab === 'inserir' && (
                    <div className="space-y-6">
                        {insertResult && (
                            <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-start gap-3">
                                <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-green-800">Livro inserido com sucesso! ID: {insertResult.id}</p>
                                    <p className="text-sm text-green-700 mt-0.5">{insertResult.titulo}</p>
                                    <p className="text-xs text-green-600 mt-0.5 font-mono">{insertResult.caminho}</p>
                                    <button onClick={() => setInsertResult(null)} className="mt-2 text-xs text-green-600 hover:text-green-800">Inserir outro</button>
                                </div>
                            </div>
                        )}

                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-gray-900">1. Selecionar arquivo (E:\for_insert)</h3>
                                <button onClick={fetchStaging} disabled={loadingStaging} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                                    <RefreshCw size={13} className={loadingStaging ? 'animate-spin' : ''} /> Atualizar
                                </button>
                            </div>
                            <input type="text" placeholder="Filtrar arquivos..." value={stagingFilter} onChange={e => setStagingFilter(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-2" />
                            {loadingStaging ? (
                                <div className="flex items-center gap-2 text-gray-400 py-6 justify-center"><Loader2 size={18} className="animate-spin" /> Carregando...</div>
                            ) : stagingFiltered.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6">Nenhum arquivo encontrado em E:\for_insert</p>
                            ) : (
                                <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                                    {stagingFiltered.map(f => (
                                        <button key={f.rel} onClick={() => handleSelectFile(f)}
                                            className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 transition flex items-center gap-3 ${selectedFile?.rel === f.rel ? 'bg-blue-50' : ''}`}>
                                            <FileText size={16} className="text-blue-400 flex-shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">{f.nome}</p>
                                                <p className="text-xs text-gray-400">{f.rel !== f.nome ? f.rel + ' · ' : ''}{f.tamanho_mb} MB · {f.ext}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {selectedFile && (
                            <form onSubmit={handleInsert} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center gap-3">
                                    <FileText size={16} className="text-blue-500 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-blue-800 truncate">{selectedFile.nome}</p>
                                        <p className="text-xs text-blue-500">{selectedFile.tamanho_mb} MB</p>
                                    </div>
                                    <button type="button" onClick={() => setSelectedFile(null)} className="ml-auto text-blue-400 hover:text-blue-600"><X size={16} /></button>
                                </div>

                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-gray-900">2. Metadados do livro</h3>
                                    <button type="button" onClick={handleExtractMetadata} disabled={loadingExtract}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition">
                                        {loadingExtract ? <Loader2 size={13} className="animate-spin" /> : <span>✨</span>}
                                        Extrair com IA
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <InputField label="Título" name="titulo" value={bookForm.titulo} onChange={handleFormChange} placeholder="Título do livro" required span2 />
                                    <InputField label="Autor" name="autor" value={bookForm.autor} onChange={handleFormChange} placeholder="Nome do autor" />
                                    <InputField label="Editora" name="editora" value={bookForm.editora} onChange={handleFormChange} placeholder="Nome da editora" />
                                    <InputField label="Ano" name="ano" value={bookForm.ano} onChange={handleFormChange} type="number" placeholder="Ex: 2024" />
                                    <InputField label="Páginas" name="paginas" value={bookForm.paginas} onChange={handleFormChange} type="number" placeholder="Ex: 250" />
                                    <InputField label="Gênero" name="genero" value={bookForm.genero} onChange={handleFormChange} placeholder="Ex: Ficção, Direito" />
                                    <InputField label="Idioma" name="idioma" value={bookForm.idioma} onChange={handleFormChange} placeholder="Ex: Português, Inglês" />
                                    <InputField label="Área" name="area" value={bookForm.area} onChange={handleFormChange} placeholder="Preenchida automaticamente pela pasta destino" />
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Sinopse</label>
                                        <textarea name="sinopse" value={bookForm.sinopse} onChange={handleFormChange} rows={4}
                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
                                            placeholder="Sinopse do livro..." />
                                    </div>
                                </div>

                                <div>
                                    <h3 className="font-semibold text-gray-900 mb-3">3. Destino na biblioteca</h3>
                                    <label className="flex items-center gap-3 mb-3 cursor-pointer">
                                        <input type="checkbox" checked={moverArquivo} onChange={e => setMoverArquivo(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                                        <span className="text-sm text-gray-700">Mover arquivo para E:\BIBLIOTECA após inserir</span>
                                    </label>
                                    {moverArquivo && (
                                        <FolderTree selectedSubpasta={insertDestino} onSelect={p => { setInsertDestino(p); setBookForm(f => ({ ...f, area: p ? p.replace(/\//g, ' / ') : '' })); }} folders={folders} loading={loadingFolders} />
                                    )}
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <button type="button" onClick={() => setSelectedFile(null)}
                                        className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-50 transition">
                                        Cancelar
                                    </button>
                                    <button type="submit" disabled={loadingInsert}
                                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-50 text-sm">
                                        {loadingInsert ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        Salvar no Banco
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default AdminBd;
