import React, { useEffect, useState, useMemo, useRef } from 'react';
import { cleanTitle } from '../utils/bookTitle';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Search, Library, ChevronLeft, ChevronRight,
    Filter, ChevronDown, LayoutGrid, List, Bookmark,
    FolderPlus, BookOpen, Edit2, Trash2, Check, X, Clock,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import BookCardSkeleton from './BookCardSkeleton';
import AppHeader from './AppHeader';
import BookCard from './BookCard';
import BookListRow from './BookListRow';
import FilterPanel from './FilterPanel';
import CollectionPortalMenu from './CollectionPortalMenu';
import BookDetailsModal from './BookDetailsModal';
import { toast } from '../utils/toast';

// --- Cache localStorage para genres/tags (TTL 30 min) ---
const _CACHE_TTL_MS = 30 * 60 * 1000;
function getLocalCache(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts < _CACHE_TTL_MS) return parsed.data;
    } catch (_) {}
    return null;
}
function setLocalCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch (_) {}
}

const GRADIENTS = [
    'from-blue-500 to-blue-700', 'from-emerald-500 to-emerald-700',
    'from-purple-500 to-purple-700', 'from-rose-500 to-rose-700',
    'from-orange-500 to-orange-700', 'from-indigo-500 to-indigo-700',
];
const getGradient = (id) => GRADIENTS[id % GRADIENTS.length];

const ITEMS_PER_PAGE = 24;

const DocumentList = () => {
    // --- DADOS ---
    const [documents, setDocuments] = useState([]);
    const [myListIds, setMyListIds] = useState(new Set());
    const [myListData, setMyListData] = useState({});
    const [myListBooks, setMyListBooks] = useState([]);
    const [recentBooks, setRecentBooks] = useState([]);
    const [collections, setCollections] = useState([]);
    const [availableGenres, setAvailableGenres] = useState([]);
    const [availableTags, setAvailableTags] = useState([]);
    const [folders, setFolders] = useState([]);
    const [totalItems, setTotalItems] = useState(0);

    // --- FILTROS / NAVEGAÇÃO ---
    const location = useLocation();
    const viewMode = location.pathname.startsWith('/meus-livros')
        ? 'my_list'
        : location.pathname.startsWith('/recentes')
            ? 'recent'
            : location.pathname.startsWith('/colecoes')
                ? 'collections'
                : 'all';
    // Client-side paginated tabs share the same filter/search/pagination
    const isClientList = viewMode === 'my_list' || viewMode === 'recent';
    const [selectedCollectionId, setSelectedCollectionId] = useState(null);
    const [viewLayout, setViewLayout] = useState('grid');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGenre, setSelectedGenre] = useState(null);
    const [selectedTag, setSelectedTag] = useState(null);
    const [selectedArea, setSelectedArea] = useState('');
    const [expandedFolders, setExpandedFolders] = useState({});
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const sentinelRef = useRef(null);

    // --- LOADING ---
    const [loading, setLoading] = useState(true);
    const [listLoading, setListLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);

    // --- UI MODAIS ---
    const [detailsDoc, setDetailsDoc] = useState(null);
    const [collectionMenuDocId, setCollectionMenuDocId] = useState(null);
    const [collectionMenuPos, setCollectionMenuPos] = useState({ top: 0, left: 0 });
    const [collectionName, setCollectionName] = useState('');
    const [collectionLoading, setCollectionLoading] = useState(null);
    const [renamingCollId, setRenamingCollId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [deleteConfirmCollId, setDeleteConfirmCollId] = useState(null);

    // --- PEDIDOS ---
    const [pedidosPendentes, setPedidosPendentes] = useState(0);
    const [adminPendentes, setAdminPendentes] = useState(0);

    const navigate = useNavigate();
    const userName = localStorage.getItem('userName') || 'Estudante';
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    const searchDebounceRef = useRef(null);
    const filterEffectMounted = useRef(false);
    const searchEffectMounted = useRef(false); // guard separado para o debounce de busca

    // --- CÁLCULO DE POSIÇÃO DO MENU DE COLEÇÃO ---
    const calcMenuPos = (btnRect) => {
        const MENU_H = 340, MENU_W = 288;
        const spaceBelow = window.innerHeight - btnRect.bottom;
        const top = spaceBelow >= MENU_H
            ? btnRect.bottom + 6
            : Math.max(8, btnRect.top - MENU_H - 6);
        const left = Math.min(Math.max(8, btnRect.right - MENU_W), window.innerWidth - MENU_W - 8);
        return { top, left };
    };

    // =========================================================
    // EFEITOS
    // =========================================================

    useEffect(() => {
        fetchInitialData();
        fetchPedidosPendentes();
    }, []);

    // Filtros mudaram: re-fetch (pula primeiro render — fetchInitialData já carregou)
    useEffect(() => {
        if (!filterEffectMounted.current) { filterEffectMounted.current = true; return; }
        if (viewMode === 'all') {
            setCurrentPage(1); // reset síncrono ANTES do fetch para o observer não pular páginas
            fetchDocuments(1, searchTerm, selectedGenre, selectedTag, selectedArea, false);
        }
    }, [selectedGenre, selectedTag, selectedArea]);

    // Debounce de busca — pula o mount inicial (fetchInitialData já carregou)
    useEffect(() => {
        if (!searchEffectMounted.current) { searchEffectMounted.current = true; return; }
        if (viewMode !== 'all') return;
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => {
            setCurrentPage(1);
            fetchDocuments(1, searchTerm, selectedGenre, selectedTag, selectedArea, false);
        }, 400);
        return () => clearTimeout(searchDebounceRef.current);
    }, [searchTerm]);

    // Resetar página ao trocar aba
    useEffect(() => { setCurrentPage(1); }, [viewMode]);

    // Recentes: recarrega sempre que a aba é aberta (o usuário acabou de sair de um livro)
    useEffect(() => {
        if (viewMode !== 'recent') return;
        setListLoading(true);
        api.get('/recentes', { params: { limit: 60 } })
            .then(res => setRecentBooks(Array.isArray(res.data) ? res.data.map(r => r.livro) : []))
            .catch(() => setRecentBooks([]))
            .finally(() => setListLoading(false));
    }, [viewMode]);

    // Seleciona primeira coleção automaticamente ao entrar na aba
    useEffect(() => {
        if (viewMode === 'collections' && collections.length > 0 && !selectedCollectionId) {
            setSelectedCollectionId(collections[0].id);
        }
    }, [viewMode, collections]);

    // IntersectionObserver — scroll infinito (Acervo)
    useEffect(() => {
        if (viewMode !== 'all' || !sentinelRef.current) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !isLoadingMore && !loading && !listLoading) {
                const next = currentPage + 1;
                setCurrentPage(next);
                fetchDocuments(next, searchTerm, selectedGenre, selectedTag, selectedArea, true);
            }
        }, { threshold: 0.1 });
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [hasMore, isLoadingMore, loading, listLoading, currentPage, searchTerm, selectedGenre, selectedTag, selectedArea, viewMode]);

    // =========================================================
    // FETCH
    // =========================================================

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            const [docsRes, listRes] = await Promise.all([
                api.get('/documents', { params: { page: 1, limit: ITEMS_PER_PAGE } }),
                api.get('/my-list').catch(() => ({ data: [] })),
            ]);
            const docsData = docsRes.data;
            setDocuments(Array.isArray(docsData.items) ? docsData.items : []);
            setTotalItems(docsData.total ?? 0);
            setHasMore(1 * ITEMS_PER_PAGE < (docsData.total ?? 0));

            const ids = new Set(), listData = {}, listBooks = [];
            if (Array.isArray(listRes.data)) {
                listRes.data.forEach(item => {
                    if (item.livro?.id) {
                        ids.add(item.livro.id);
                        listData[item.livro.id] = {
                            status: item.status,
                            current_page: item.current_page || 1,
                            total_pages: item.total_pages,
                        };
                        listBooks.push(item.livro);
                    }
                });
            }
            setMyListIds(ids); setMyListData(listData); setMyListBooks(listBooks);
        } catch (err) {
            console.error('Erro ao buscar dados iniciais:', err);
        } finally {
            setLoading(false);
        }

        // Fase 2 — filtros em background
        try {
            const cachedGenres = getLocalCache('lib_genres');
            const cachedTags   = getLocalCache('lib_tags');
            const [colRes, foldersRes, genresRes, tagsRes] = await Promise.all([
                api.get('/collections').catch(() => ({ data: [] })),
                api.get('/documents/folders').catch(() => ({ data: [] })),
                cachedGenres ? Promise.resolve({ data: cachedGenres }) : api.get('/documents/genres').catch(() => ({ data: [] })),
                cachedTags   ? Promise.resolve({ data: cachedTags })   : api.get('/documents/tags').catch(() => ({ data: [] })),
            ]);
            setCollections(Array.isArray(colRes.data) ? colRes.data : []);
            setFolders(Array.isArray(foldersRes.data) ? foldersRes.data : []);
            const g = Array.isArray(genresRes.data) ? genresRes.data : [];
            const t = Array.isArray(tagsRes.data)   ? tagsRes.data   : [];
            setAvailableGenres(g); setAvailableTags(t);
            if (!cachedGenres && g.length) setLocalCache('lib_genres', g);
            if (!cachedTags   && t.length) setLocalCache('lib_tags',   t);
        } catch (err) {
            console.error('Erro ao buscar filtros:', err);
        }
    };

    const fetchDocuments = async (page, search, genre, tag, area, append = false) => {
        try {
            if (append) setIsLoadingMore(true); else setListLoading(true);
            const params = { page, limit: ITEMS_PER_PAGE };
            if (search) params.search = search;
            if (genre)  params.genre  = genre;
            if (tag)    params.tag    = tag;
            if (area)   params.area   = area;
            const res = await api.get('/documents', { params });
            const items = Array.isArray(res.data.items) ? res.data.items : [];
            const total = res.data.total ?? 0;
            if (append) setDocuments(prev => [...prev, ...items]); else setDocuments(items);
            setTotalItems(total);
            setHasMore(page * ITEMS_PER_PAGE < total);
        } catch (err) {
            console.error('Erro ao buscar livros:', err);
        } finally {
            setListLoading(false); setIsLoadingMore(false);
        }
    };

    const fetchPedidosPendentes = async () => {
        try {
            const res = await api.get('/pedidos/meus');
            setPedidosPendentes(res.data.filter(p => p.status === 'pendente').length);
            if (isAdmin) {
                const adminRes = await api.get('/pedidos');
                setAdminPendentes(adminRes.data.filter(p => p.status === 'pendente').length);
            }
        } catch (err) {
            console.error('Erro ao buscar pedidos pendentes:', err);
        }
    };

    const refreshCollections = async () => {
        const res = await api.get('/collections').catch(() => ({ data: [] }));
        setCollections(Array.isArray(res.data) ? res.data : []);
    };

    // =========================================================
    // AÇÕES
    // =========================================================

    const refreshMyList = async () => {
        const res = await api.get('/my-list').catch(() => ({ data: [] }));
        const ids = new Set(), listData = {}, listBooks = [];
        if (Array.isArray(res.data)) {
            res.data.forEach(item => {
                if (item.livro?.id) {
                    ids.add(item.livro.id);
                    listData[item.livro.id] = {
                        status: item.status,
                        current_page: item.current_page || 1,
                        total_pages: item.total_pages,
                    };
                    listBooks.push(item.livro);
                }
            });
        }
        setMyListIds(ids);
        setMyListData(listData);
        setMyListBooks(listBooks);
    };

    const handleAddToList = async (e, docId) => {
        e.stopPropagation();
        setActionLoading(docId);
        try {
            await api.post(`/my-list/add/${docId}`);
            await refreshMyList(); // só atualiza a lista — não reseta documentos nem filtros
        } catch (err) {
            console.error('Erro ao adicionar:', err);
            toast.error('Erro ao adicionar livro.');
        } finally { setActionLoading(null); }
    };

    const handleRemoveFromList = async (e, docId) => {
        e.stopPropagation();
        if (!window.confirm('Remover este livro da sua lista?')) return;
        setActionLoading(docId);
        try {
            await api.delete(`/my-list/remove/${docId}`);
            setMyListIds(prev => { const s = new Set(prev); s.delete(docId); return s; });
        } catch (err) {
            console.error('Erro ao remover:', err);
            toast.error('Erro ao remover livro.');
        } finally { setActionLoading(null); }
    };

    const handleRead = (docId) => {
        const doc = [...documents, ...myListBooks, ...recentBooks].find(d => d.id === docId);
        if (doc?.caminho?.toLowerCase().endsWith('.epub')) {
            navigate(`/epub/${docId}`);
            return;
        }
        navigate(`/document/${docId}`);
    };

    const handleToggleDuplicate = async (docId) => {
        try {
            const res = await api.patch(`/documents/${docId}/toggle-duplicate`);
            const { is_duplicate } = res.data;
            // Atualiza localmente sem refetch
            setDocuments(prev => prev.map(d => d.id === docId ? { ...d, is_duplicate } : d));
            setMyListBooks(prev => prev.map(d => d.id === docId ? { ...d, is_duplicate } : d));
            toast[is_duplicate ? 'error' : 'success'](
                is_duplicate ? 'Marcado como duplicado' : 'Desmarcado'
            );
        } catch (err) {
            toast.error('Erro ao marcar duplicado.');
        }
    };

    // --- AÇÕES DE COLEÇÕES (view integrada) ---
    const handleRenameCollection = async (id) => {
        const nome = renameValue.trim();
        if (!nome) return;
        try {
            await api.put(`/collections/${id}`, { nome });
            setCollections(prev => prev.map(c => c.id === id ? { ...c, nome } : c));
            setRenamingCollId(null);
        } catch { toast.error('Erro ao renomear coleção.'); }
    };

    const handleDeleteCollection = async (id) => {
        try {
            await api.delete(`/collections/${id}`);
            const updated = collections.filter(c => c.id !== id);
            setCollections(updated);
            setDeleteConfirmCollId(null);
            if (selectedCollectionId === id) setSelectedCollectionId(updated[0]?.id ?? null);
            toast.success('Coleção excluída.');
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Erro ao excluir coleção.');
        }
    };

    const handleRemoveBookFromCollection = async (collId, livroId) => {
        try {
            await api.delete(`/collections/${collId}/books/${livroId}`);
            setCollections(prev => prev.map(c => {
                if (c.id !== collId) return c;
                return { ...c, book_ids: c.book_ids.filter(id => id !== livroId), books: (c.books||[]).filter(b => b.id !== livroId), total_livros: Math.max((c.total_livros||0)-1,0) };
            }));
        } catch { toast.error('Erro ao remover livro.'); }
    };

    const handleCollectionClick = (e, docId) => {
        e.stopPropagation();
        if (collectionMenuDocId === docId) { setCollectionMenuDocId(null); return; }
        const rect = e.currentTarget.getBoundingClientRect();
        setCollectionMenuPos(calcMenuPos(rect));
        setCollectionMenuDocId(docId);
    };

    const handleAddToCollection = async (e, collectionId, docId) => {
        e.stopPropagation();
        setCollectionLoading(`${collectionId}-${docId}`);
        try {
            await api.post(`/collections/${collectionId}/books/${docId}`);
            await refreshCollections();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Erro ao adicionar livro à coleção.');
        } finally { setCollectionLoading(null); }
    };

    const handleCreateCollection = async (e, docId) => {
        e.stopPropagation();
        const name = collectionName.trim();
        if (!name) return;
        setCollectionLoading(`new-${docId}`);
        try {
            const res = await api.post('/collections', { nome: name });
            await api.post(`/collections/${res.data.id}/books/${docId}`);
            setCollectionName('');
            await refreshCollections();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Erro ao criar coleção.');
        } finally { setCollectionLoading(null); }
    };

    // =========================================================
    // PAGINAÇÃO — Meus Livros (client-side)
    // =========================================================

    const myListFiltered = useMemo(() => {
        let data = viewMode === 'recent' ? recentBooks : myListBooks;
        if (selectedGenre) data = data.filter(d => d.genero === selectedGenre);
        if (selectedTag)   data = data.filter(d => Array.isArray(d.tags) && d.tags.includes(selectedTag));
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            data = data.filter(d =>
                (d.titulo || '').toLowerCase().includes(q) ||
                (d.autor  || '').toLowerCase().includes(q)
            );
        }
        return data;
    }, [viewMode, recentBooks, myListBooks, selectedGenre, selectedTag, searchTerm]);

    const myListTotalPages  = Math.ceil(myListFiltered.length / ITEMS_PER_PAGE);
    const myListCurrentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return myListFiltered.slice(start, start + ITEMS_PER_PAGE);
    }, [myListFiltered, currentPage]);

    const currentItems  = isClientList ? myListCurrentItems : documents;
    const totalPages    = isClientList ? myListTotalPages   : Math.ceil(totalItems / ITEMS_PER_PAGE);
    const displayTotal  = isClientList ? myListFiltered.length : totalItems;
    const apiBaseUrl    = api.defaults.baseURL;

    // =========================================================
    // RENDER
    // =========================================================

    return (
        <div className="min-h-screen bg-gray-50 text-blue-600 font-sans pb-20 overflow-x-hidden">
            <AppHeader
                userName={userName}
                isAdmin={isAdmin}
                pedidosPendentes={pedidosPendentes}
                adminPendentes={adminPendentes}
            />

            <main className="max-w-7xl mx-auto px-4 py-4 sm:py-8">
                {/* ── CONTROLES ── */}
                <div className="flex flex-col gap-3 mb-6">
                    {/* Linha 1: Tabs + Toggle de layout */}
                    <div className="flex items-center gap-2">
                        <div className="flex flex-1 min-w-0 bg-white p-1 rounded-xl shadow-sm border border-gray-200">
                            <button
                                onClick={() => navigate('/acervo')}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${viewMode === 'all' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                                title="Acervo Completo"
                            >
                                <Library size={15} className="flex-shrink-0" />
                                <span className="hidden sm:inline">Acervo Completo</span>
                            </button>
                            <button
                                onClick={() => navigate('/recentes')}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${viewMode === 'recent' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                                title="Recentes"
                            >
                                <Clock size={15} className="flex-shrink-0" />
                                <span className="hidden sm:inline">Recentes</span>
                            </button>
                            <button
                                onClick={() => navigate('/meus-livros')}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${viewMode === 'my_list' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                                title="Meus Livros"
                            >
                                <Bookmark size={15} className="flex-shrink-0" />
                                <span className="hidden sm:inline">Meus Livros</span>
                                {myListIds.size > 0 && (
                                    <span className="bg-blue-600 text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full font-semibold leading-none">
                                        {myListIds.size}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => navigate('/colecoes')}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${viewMode === 'collections' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                                title="Coleções"
                            >
                                <FolderPlus size={15} className="flex-shrink-0" />
                                <span className="hidden sm:inline">Coleções</span>
                                {collections.length > 0 && (
                                    <span className="bg-violet-600 text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full font-semibold leading-none">
                                        {collections.length}
                                    </span>
                                )}
                            </button>
                        </div>

                        <div className="flex flex-shrink-0 bg-white p-1 rounded-xl shadow-sm border border-gray-200">
                            <button onClick={() => setViewLayout('grid')} className={`p-2 rounded-lg transition-all ${viewLayout === 'grid' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`} title="Modo Grade"><LayoutGrid size={18} /></button>
                            <button onClick={() => setViewLayout('list')} className={`p-2 rounded-lg transition-all ${viewLayout === 'list' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`} title="Modo Lista"><List size={18} /></button>
                        </div>
                    </div>

                    {/* Linha 2: Busca + botão Filtros */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1 group">
                            <Search size={16} className="absolute left-3 top-3.5 text-gray-400 group-focus-within:text-blue-500" />
                            <input
                                type="text"
                                placeholder="Buscar título ou autor..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                            />
                        </div>
                        {!loading && (
                            <button
                                onClick={() => setFiltersOpen(o => !o)}
                                className={`flex-shrink-0 flex items-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium transition-all ${
                                    filtersOpen ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                                }`}
                            >
                                <Filter size={14} />
                                Filtros
                                {((selectedGenre ? 1 : 0) + (selectedTag ? 1 : 0)) > 0 && (
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                                        {(selectedGenre ? 1 : 0) + (selectedTag ? 1 : 0)}
                                    </span>
                                )}
                                <ChevronDown size={14} className={`transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── FILTROS ── */}
                <FilterPanel
                    open={filtersOpen}
                    folders={folders}
                    selectedArea={selectedArea}
                    onAreaChange={setSelectedArea}
                    expandedFolders={expandedFolders}
                    onExpandToggle={rel => setExpandedFolders(prev => ({ ...prev, [rel]: !prev[rel] }))}
                    availableGenres={availableGenres}
                    availableTags={availableTags}
                    selectedGenre={selectedGenre}
                    onGenreChange={setSelectedGenre}
                    selectedTag={selectedTag}
                    onTagChange={setSelectedTag}
                    viewMode={viewMode}
                    loading={loading}
                />

                {/* ── VIEW DE COLEÇÕES ── */}
                {viewMode === 'collections' && (
                    <div>
                        {/* Chips de coleções */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            {collections.map(col => (
                                <div key={col.id} className="relative">
                                    {renamingCollId === col.id ? (
                                        <div className="flex items-center gap-1 px-3 py-1.5 bg-white border border-blue-400 rounded-full shadow-sm">
                                            <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                                                onKeyDown={e => { if(e.key==='Enter') handleRenameCollection(col.id); if(e.key==='Escape') setRenamingCollId(null); }}
                                                className="text-sm outline-none w-28" autoFocus />
                                            <button onClick={() => handleRenameCollection(col.id)} className="text-green-600"><Check size={13}/></button>
                                            <button onClick={() => setRenamingCollId(null)} className="text-gray-400"><X size={13}/></button>
                                        </div>
                                    ) : (
                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border cursor-pointer transition-all ${
                                            selectedCollectionId === col.id
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                                : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'
                                        }`}>
                                            <span onClick={() => setSelectedCollectionId(col.id)}>{col.nome}</span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${selectedCollectionId===col.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>{col.total_livros}</span>
                                            <button onClick={e => { e.stopPropagation(); setRenamingCollId(col.id); setRenameValue(col.nome); }} className={`hover:opacity-70 ${selectedCollectionId===col.id?'text-white':'text-gray-400'}`}><Edit2 size={11}/></button>
                                            <button onClick={e => { e.stopPropagation(); setDeleteConfirmCollId(col.id); }} className={`hover:opacity-70 ${selectedCollectionId===col.id?'text-white':'text-red-400'}`}><Trash2 size={11}/></button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {collections.length === 0 && (
                                <p className="text-sm text-gray-400 py-2">Nenhuma coleção criada. Adicione livros a coleções pelo acervo.</p>
                            )}
                        </div>

                        {/* Grid de livros da coleção selecionada */}
                        {selectedCollectionId && (() => {
                            const col = collections.find(c => c.id === selectedCollectionId);
                            const books = col?.books || [];
                            if (books.length === 0) return (
                                <div className="text-center py-16 text-gray-400">
                                    <BookOpen className="mx-auto mb-3 opacity-40" size={40}/>
                                    <p className="text-sm">Nenhum livro nesta coleção.</p>
                                </div>
                            );
                            return (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                                    {books.map(livro => (
                                        <div key={livro.id} className="relative group/book">
                                            <div className="aspect-[2/3] overflow-hidden rounded-lg bg-gray-100 cursor-pointer relative"
                                                onClick={() => handleRead(livro.id)}>
                                                <img src={`${apiBaseUrl}/documents/${livro.id}/cover`} alt={livro.titulo}
                                                    className="h-full w-full object-cover"
                                                    onError={e => { e.currentTarget.style.display='none'; }} />
                                                <div className="absolute inset-0 bg-black/0 group-hover/book:bg-black/40 transition-all" />
                                                <button onClick={e => { e.stopPropagation(); handleRemoveBookFromCollection(selectedCollectionId, livro.id); }}
                                                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-red-600 text-white items-center justify-center hidden group-hover/book:flex transition shadow"
                                                    title="Remover da coleção"><X size={12}/></button>
                                            </div>
                                            <p className="mt-1 text-xs text-gray-700 truncate">{cleanTitle(livro.titulo)}</p>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* ── RESULTADOS (Acervo / Meus Livros) ── */}
                {viewMode !== 'collections' && ((loading || listLoading) ? (
                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                        {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => <BookCardSkeleton key={i} />)}
                    </div>
                ) : (
                    <>
                        <div className="mb-4 flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-gray-500">
                                Mostrando {currentItems.length} de {displayTotal} livros encontrados
                            </span>
                            {isClientList && searchTerm && displayTotal === 0 && (
                                <button onClick={() => navigate('/acervo')} className="text-sm text-blue-600 hover:text-blue-700 font-medium underline underline-offset-2">
                                    Buscar no Acervo Completo →
                                </button>
                            )}
                        </div>

                        {currentItems.length > 0 ? (
                            <>
                                {viewLayout === 'grid' ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                                        {currentItems.map((doc, index) => (
                                            <BookCard
                                                key={doc.id}
                                                doc={doc}
                                                isInMyList={myListIds.has(doc.id)}
                                                myListItem={myListData[doc.id]}
                                                isAdmin={isAdmin}
                                                actionLoading={actionLoading}
                                                animationDelay={`${index * 40}ms`}
                                                onRead={handleRead}
                                                onAddToList={handleAddToList}
                                                onRemoveFromList={handleRemoveFromList}
                                                onCollectionClick={handleCollectionClick}
                                                onDetailsClick={setDetailsDoc}
                                                onToggleDuplicate={handleToggleDuplicate}
                                                apiBaseUrl={apiBaseUrl}
                                                getGradient={getGradient}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {currentItems.map((doc, index) => (
                                            <BookListRow
                                                key={doc.id}
                                                doc={doc}
                                                isInMyList={myListIds.has(doc.id)}
                                                myListItem={myListData[doc.id]}
                                                isAdmin={isAdmin}
                                                actionLoading={actionLoading}
                                                animationDelay={`${index * 30}ms`}
                                                onRead={handleRead}
                                                onAddToList={handleAddToList}
                                                onRemoveFromList={handleRemoveFromList}
                                                onCollectionClick={handleCollectionClick}
                                                onToggleDuplicate={handleToggleDuplicate}
                                                apiBaseUrl={apiBaseUrl}
                                                getGradient={getGradient}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-gray-300">
                                <div className="mx-auto h-16 w-16 text-gray-300 mb-4"><Search size={64} /></div>
                                <h3 className="text-lg font-medium text-gray-900">Nenhum livro encontrado</h3>
                                <p className="text-gray-500">Tente ajustar sua busca ou mudar o filtro.</p>
                            </div>
                        )}

                        {/* Paginação client-side — Meus Livros */}
                        {isClientList && displayTotal > ITEMS_PER_PAGE && (
                            <div className="mt-10 flex justify-center items-center gap-4">
                                <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="p-2 rounded-lg border border-gray-300 disabled:opacity-30 hover:bg-white transition shadow-sm"><ChevronLeft size={20} /></button>
                                <div className="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
                                    <span className="text-sm font-semibold text-gray-700">Página {currentPage} de {totalPages}</span>
                                </div>
                                <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="p-2 rounded-lg border border-gray-300 disabled:opacity-30 hover:bg-white transition shadow-sm"><ChevronRight size={20} /></button>
                            </div>
                        )}

                        {/* Sentinel — scroll infinito Acervo */}
                        {viewMode === 'all' && (
                            <div ref={sentinelRef} className="mt-8 flex justify-center items-center h-10">
                                {isLoadingMore && <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />}
                                {!hasMore && documents.length > 0 && !loading && (
                                    <p className="text-sm text-gray-400">Todos os {totalItems} livros carregados</p>
                                )}
                            </div>
                        )}
                    </>
                ))}
            </main>

            {/* ── MODAIS / PORTAIS ── */}
            {/* Confirmação delete coleção (view integrada) */}
            {deleteConfirmCollId !== null && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={() => setDeleteConfirmCollId(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold text-gray-900 text-base mb-2">Excluir coleção?</h3>
                        <p className="text-sm text-gray-600 mb-5">"{collections.find(c=>c.id===deleteConfirmCollId)?.nome}" será excluída permanentemente.</p>
                        <div className="flex gap-3">
                            <button onClick={() => handleDeleteCollection(deleteConfirmCollId)} className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition">Excluir</button>
                            <button onClick={() => setDeleteConfirmCollId(null)} className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition">Cancelar</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {detailsDoc && (
                <BookDetailsModal
                    doc={detailsDoc}
                    onClose={() => setDetailsDoc(null)}
                    onRead={handleRead}
                    apiBaseUrl={apiBaseUrl}
                />
            )}

            {collectionMenuDocId !== null && (
                <CollectionPortalMenu
                    docId={collectionMenuDocId}
                    pos={collectionMenuPos}
                    collections={collections}
                    collectionName={collectionName}
                    collectionLoading={collectionLoading}
                    onClose={() => setCollectionMenuDocId(null)}
                    onAddToCollection={handleAddToCollection}
                    onCreateCollection={handleCreateCollection}
                    onNameChange={setCollectionName}
                />
            )}
        </div>
    );
};

export default DocumentList;
