import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Search, BookOpen, Plus, Library,
    Calendar, User, Tag, ChevronLeft, ChevronRight,
    Bookmark, Trash2, Filter, X, LayoutGrid, List, Edit, FolderPlus, Check, ChevronDown,
    Folder, FolderOpen
} from 'lucide-react';
import api from '../services/api';
import BookCardSkeleton from './BookCardSkeleton';
import UserMenu from './UserMenu';
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

// --- Arvore de pastas ---
function buildFolderTree(items) {
    const map = {};
    const roots = [];
    items.forEach(item => { map[item.rel] = { ...item, children: [] }; });
    items.forEach(item => {
        if (!item.rel) return;
        const lastSlash = item.rel.lastIndexOf(' / ');
        const parentRel = lastSlash >= 0 ? item.rel.substring(0, lastSlash) : '';
        if (parentRel && map[parentRel]) {
            map[parentRel].children.push(map[item.rel]);
        } else {
            roots.push(map[item.rel]);
        }
    });
    return roots;
}

// FolderNode controlado: expanded/onToggle vivem no pai (DocumentList) e sobrevivem a re-renders
function FolderNode({ node, selectedArea, onSelect, expanded, onToggle, depth = 0 }) {
    const hasChildren = node.children && node.children.length > 0;
    const isOpen = !!expanded[node.rel];
    const isSelected = selectedArea === node.rel;
    return (
        <div>
            <div
                style={{ paddingLeft: depth * 16 + 8 }}
                className={[
                    'flex items-center gap-1.5 py-1 px-2 rounded-md text-sm transition-colors',
                    isSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
                ].join(' ')}
            >
                {/* Ícone: clica para expandir/colapsar (apenas se tem filhos) */}
                <span
                    className="flex-shrink-0 cursor-pointer"
                    onClick={() => hasChildren && onToggle(node.rel)}
                >
                    {hasChildren
                        ? (isOpen
                            ? <FolderOpen size={14} className="text-yellow-500" />
                            : <Folder size={14} className="text-yellow-500" />)
                        : <Folder size={14} className="text-gray-400" />}
                </span>
                {/* Nome: clica para selecionar e buscar */}
                <span
                    className="truncate flex-1 cursor-pointer"
                    onClick={() => onSelect(node.rel)}
                >
                    {node.nome}
                </span>
                {/* Chevron: clica para expandir/colapsar */}
                {hasChildren && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggle(node.rel); }}
                        className="ml-auto flex-shrink-0 p-0.5 rounded hover:bg-black/10"
                    >
                        <ChevronDown size={12} className={['transition-transform', isOpen ? 'rotate-180' : ''].join(' ')} />
                    </button>
                )}
            </div>
            {hasChildren && isOpen && node.children.map(child => (
                <FolderNode
                    key={child.rel}
                    node={child}
                    selectedArea={selectedArea}
                    onSelect={onSelect}
                    expanded={expanded}
                    onToggle={onToggle}
                    depth={depth + 1}
                />
            ))}
        </div>
    );
}

const PREDEFINED_GENRES = [
    'Historia', 'Literatura', 'Ciencia e Tecnologia', 'Ciencias Sociais',
    'Artes e Cultura', 'Religiao e Filosofia', 'Lifestyle', 'Educacao',
    'Saude e Medicina', 'Direito', 'Negocios'
];

const DocumentList = () => {
    // --- ESTADOS DE DADOS ---
    const [documents, setDocuments] = useState([]);
    const [myListIds, setMyListIds] = useState(new Set());
    const [myListData, setMyListData] = useState({});
    const [myListBooks, setMyListBooks] = useState([]);
    const [collections, setCollections] = useState([]);
    const [availableGenres, setAvailableGenres] = useState([]);
    const [availableTags, setAvailableTags] = useState([]);
    const [selectedTag, setSelectedTag] = useState(null);
    const [selectedArea, setSelectedArea] = useState('');
    const [folders, setFolders] = useState([]);
    const [totalItems, setTotalItems] = useState(0);
    const [filtersOpen, setFiltersOpen] = useState(false);

    // --- ESTADOS DE CONTROLE ---
    const location = useLocation();
    const viewMode = location.pathname.startsWith('/meus-livros') ? 'my_list' : 'all';
    const [viewLayout, setViewLayout] = useState('grid');
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedGenre, setSelectedGenre] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [isAnimating, setIsAnimating] = useState(false);
    const itemsPerPage = 24;
    const [hasMore, setHasMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const sentinelRef = useRef(null);

    // --- ESTADOS DE CARREGAMENTO ---
    const [loading, setLoading] = useState(true);       // carga inicial (monta filtros)
    const [listLoading, setListLoading] = useState(false); // fetch de livros (não desmonta filtros)
    const [actionLoading, setActionLoading] = useState(null);
    const [expandedFolders, setExpandedFolders] = useState({}); // estado de expansão da árvore (sobrevive a fetches)
    const [collectionMenuDocId, setCollectionMenuDocId] = useState(null);
    const [collectionMenuPos, setCollectionMenuPos] = useState({ top: 0, left: 0 });
    const [collectionName, setCollectionName] = useState("");
    const [collectionLoading, setCollectionLoading] = useState(null);

    const searchDebounceRef = useRef(null);
    // Evita double-fetch no mount: fetchInitialData já carrega os docs
    const filterEffectMounted = useRef(false);

    const navigate = useNavigate();
    const userName = localStorage.getItem('userName') || 'Estudante';
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    const userId = localStorage.getItem('userId');
    const [pedidosPendentes, setPedidosPendentes] = useState(0);
    const [adminPendentes, setAdminPendentes] = useState(0);

    useEffect(() => {
        fetchInitialData();
        fetchPedidosPendentes();
    }, []);

    // Filtros mudaram: re-fetch do zero (pula o primeiro render — fetchInitialData já cuida)
    useEffect(() => {
        if (!filterEffectMounted.current) {
            filterEffectMounted.current = true;
            return;
        }
        if (viewMode === 'all') fetchDocuments(1, searchTerm, selectedGenre, selectedTag, selectedArea, false);
    }, [selectedGenre, selectedTag, selectedArea]); // viewMode fora — trocar aba não refaz fetch

    // Debounce de busca: só dispara 400ms após parar de digitar
    useEffect(() => {
        if (viewMode !== 'all') return;
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => {
            fetchDocuments(1, searchTerm, selectedGenre, selectedTag, selectedArea, false);
        }, 400);
        return () => clearTimeout(searchDebounceRef.current);
    }, [searchTerm]);

    // Resetar página ao trocar aba
    useEffect(() => {
        setCurrentPage(1);
    }, [viewMode]);

    // IntersectionObserver: carrega mais ao chegar no fim (apenas Acervo)
    useEffect(() => {
        if (viewMode !== 'all') return;
        if (!sentinelRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoadingMore && !loading) {
                    const nextPage = currentPage + 1;
                    setCurrentPage(nextPage);
                    fetchDocuments(nextPage, searchTerm, selectedGenre, selectedTag, selectedArea, true);
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [hasMore, isLoadingMore, loading, currentPage, searchTerm, selectedGenre, selectedTag, selectedArea, viewMode]);

    const fetchInitialData = async () => {
        // Fase 1: conteudo principal — desbloqueia a UI o mais rapido possivel
        try {
            setLoading(true);
            const [docsResponse, myListResponse] = await Promise.all([
                api.get('/documents', { params: { page: 1, limit: itemsPerPage } }),
                api.get('/my-list').catch(() => ({ data: [] })),
            ]);

            const docsData = docsResponse.data;
            setDocuments(Array.isArray(docsData.items) ? docsData.items : []);
            setTotalItems(docsData.total ?? 0);

            const ids = new Set();
            const listData = {};
            const listBooks = [];
            if (Array.isArray(myListResponse.data)) {
                myListResponse.data.forEach(item => {
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
        } catch (error) {
            console.error("Erro ao buscar dados iniciais:", error);
        } finally {
            setLoading(false);
        }

        // Fase 2: filtros e colecoes — carrega em background sem bloquear a UI
        try {
            const cachedGenres = getLocalCache('lib_genres');
            const cachedTags = getLocalCache('lib_tags');

            const [collectionsResponse, foldersResponse, genresResponse, tagsResponse] = await Promise.all([
                api.get('/collections').catch(() => ({ data: [] })),
                api.get('/documents/folders').catch(() => ({ data: [] })),
                cachedGenres ? Promise.resolve({ data: cachedGenres }) : api.get('/documents/genres').catch(() => ({ data: [] })),
                cachedTags ? Promise.resolve({ data: cachedTags }) : api.get('/documents/tags').catch(() => ({ data: [] })),
            ]);

            setCollections(Array.isArray(collectionsResponse.data) ? collectionsResponse.data : []);
            setFolders(Array.isArray(foldersResponse.data) ? foldersResponse.data : []);

            const genresData = Array.isArray(genresResponse.data) ? genresResponse.data : [];
            const tagsData = Array.isArray(tagsResponse.data) ? tagsResponse.data : [];
            setAvailableGenres(genresData);
            setAvailableTags(tagsData);
            if (!cachedGenres && genresData.length) setLocalCache('lib_genres', genresData);
            if (!cachedTags && tagsData.length) setLocalCache('lib_tags', tagsData);
        } catch (error) {
            console.error("Erro ao buscar filtros:", error);
        }
    };

    const fetchDocuments = async (page, search, genre, tag, area, append = false) => {
        try {
            if (append) setIsLoadingMore(true);
            else setListLoading(true);
            const params = { page, limit: itemsPerPage };
            if (search) params.search = search;
            if (genre) params.genre = genre;
            if (tag) params.tag = tag;
            if (area) params.area = area;
            const response = await api.get('/documents', { params });
            const newItems = Array.isArray(response.data.items) ? response.data.items : [];
            const total = response.data.total ?? 0;
            if (append) {
                setDocuments(prev => [...prev, ...newItems]);
            } else {
                setDocuments(newItems);
                setCurrentPage(1);
            }
            setTotalItems(total);
            setHasMore(page * itemsPerPage < total);
        } catch (error) {
            console.error("Erro ao buscar livros:", error);
        } finally {
            setListLoading(false);
            setIsLoadingMore(false);
        }
    };

    const fetchData = async () => {
        await fetchInitialData();
    };

    const fetchPedidosPendentes = async () => {
        try {
            const response = await api.get('/pedidos/meus');
            const pendentes = response.data.filter(p => p.status === 'pendente').length;
            setPedidosPendentes(pendentes);
            
            // Se for admin, busca também os pedidos pendentes de todos os usuários
            if (isAdmin) {
                const adminResponse = await api.get('/pedidos');
                const adminPendentesCount = adminResponse.data.filter(p => p.status === 'pendente').length;
                setAdminPendentes(adminPendentesCount);
            }
        } catch (error) {
            console.error("Erro ao buscar pedidos pendentes:", error);
        }
    };

    // --- FUNÇÕES DE AÇÃO ---

    const handleAddToList = async (e, docId) => {
        e.stopPropagation();
        setActionLoading(docId);
        try {
            await api.post(`/my-list/add/${docId}`);
            await fetchData(); // Recarrega os dados da lista para obter total_pages
        } catch (error) {
            console.error("Erro ao adicionar:", error);
            toast.error("Erro ao adicionar livro.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleRemoveFromList = async (e, docId) => {
        e.stopPropagation();
        if (!window.confirm("Remover este livro da sua lista?")) return;

        setActionLoading(docId);
        try {
            await api.delete(`/my-list/remove/${docId}`);
            setMyListIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(docId);
                return newSet;
            });
        } catch (error) {
            console.error("Erro ao remover:", error);
            toast.error("Erro ao remover livro.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleRead = async (docId) => {
        // Detecta se é EPUB pelo caminho do livro
        try {
            const doc = [...documents, ...myListBooks].find(d => d.id === docId);
            const caminho = doc?.caminho || '';
            if (caminho.toLowerCase().endsWith('.epub')) {
                navigate(`/epub/${docId}`);
                return;
            }
        } catch { /* fallback para PDF */ }
        navigate(`/document/${docId}`);
    };

    const iconTooltipClass = "group/btn relative overflow-visible";
    const renderTooltip = (label) => (
        <span
            aria-hidden="true"
            className="invisible pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 translate-y-1 scale-95 whitespace-nowrap rounded-md bg-gray-950 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover/btn:visible group-hover/btn:translate-y-0 group-hover/btn:scale-100 group-hover/btn:opacity-100 group-focus-visible/btn:visible group-focus-visible/btn:translate-y-0 group-focus-visible/btn:scale-100 group-focus-visible/btn:opacity-100"
        >
            {label}
            <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-gray-950" />
        </span>
    );

    const refreshCollections = async () => {
        const response = await api.get('/collections').catch(() => ({ data: [] }));
        setCollections(Array.isArray(response.data) ? response.data : []);
    };

    const handleAddToCollection = async (e, collectionId, docId) => {
        e.stopPropagation();
        setCollectionLoading(`${collectionId}-${docId}`);
        try {
            await api.post(`/collections/${collectionId}/books/${docId}`);
            await refreshCollections();
        } catch (error) {
            console.error("Erro ao adicionar a colecao:", error);
            toast.error(error.response?.data?.detail || "Erro ao adicionar livro a colecao.");
        } finally {
            setCollectionLoading(null);
        }
    };

    const handleCreateCollection = async (e, docId) => {
        e.stopPropagation();
        const name = collectionName.trim();
        if (!name) return;

        setCollectionLoading(`new-${docId}`);
        try {
            const response = await api.post('/collections', { nome: name });
            await api.post(`/collections/${response.data.id}/books/${docId}`);
            setCollectionName("");
            await refreshCollections();
        } catch (error) {
            console.error("Erro ao criar colecao:", error);
            toast.error(error.response?.data?.detail || "Erro ao criar colecao.");
        } finally {
            setCollectionLoading(null);
        }
    };

    const renderCollectionMenu = (docId, compact = false) => (
        <div className="relative">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (collectionMenuDocId === docId) {
                        setCollectionMenuDocId(null);
                    } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setCollectionMenuPos({ top: rect.bottom + 6, left: rect.right - 288 });
                        setCollectionMenuDocId(docId);
                    }
                }}
                className={`${iconTooltipClass} ${compact ? 'h-9 w-9' : 'h-10 w-10'} bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 border border-violet-200 transition flex items-center justify-center shadow-sm flex-shrink-0`}
                aria-label="Adicionar a colecao"
            >
                <FolderPlus size={compact ? 14 : 18} />
                {renderTooltip("Adicionar a colecao")}
            </button>
        </div>
    );

    // --- PAGINAÇÃO: "Meus Livros" é client-side; "Acervo Completo" é server-side ---
    const myListFiltered = useMemo(() => {
        let data = myListBooks;
        if (selectedGenre) data = data.filter(doc => doc.genero === selectedGenre);
        if (selectedTag) data = data.filter(doc => Array.isArray(doc.tags) && doc.tags.includes(selectedTag));
        if (searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase();
            data = data.filter(doc =>
                (doc.titulo || "").toLowerCase().includes(lowerTerm) ||
                (doc.autor || "").toLowerCase().includes(lowerTerm)
            );
        }
        return data;
    }, [myListBooks, selectedGenre, selectedTag, searchTerm]);

    const myListTotal = myListFiltered.length;
    const myListTotalPages = Math.ceil(myListTotal / itemsPerPage);
    const myListCurrentItems = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return myListFiltered.slice(start, start + itemsPerPage);
    }, [myListFiltered, currentPage]);

    const currentItems = viewMode === 'my_list' ? myListCurrentItems : documents;
    const totalPages = viewMode === 'my_list' ? myListTotalPages : Math.ceil(totalItems / itemsPerPage);
    const displayTotal = viewMode === 'my_list' ? myListTotal : totalItems;

    const getGradient = (id) => {
        const gradients = [
            "from-blue-500 to-blue-700", "from-emerald-500 to-emerald-700",
            "from-purple-500 to-purple-700", "from-rose-500 to-rose-700",
            "from-orange-500 to-orange-700", "from-indigo-500 to-indigo-700",
        ];
        return gradients[id % gradients.length];
    };

    return (
        <div className="min-h-screen bg-gray-50 text-blue-600 font-sans pb-20 overflow-x-hidden">
            {/* HEADER */}
            <header className="bg-white shadow-sm sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 h-16 sm:h-20 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="bg-blue-600 text-white p-1.5 sm:p-2 rounded-lg flex-shrink-0"><Library size={20} /></div>
                        <h1 className="text-base sm:text-xl font-bold tracking-tight truncate">Library<span className="text-green-600">Anywhere</span></h1>
                    </div>
                    <UserMenu userName={userName} isAdmin={isAdmin} pedidosPendentes={pedidosPendentes} adminPendentes={adminPendentes} />
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-4 sm:py-8">
                {/* CONTROLES */}
                <div className="flex flex-col gap-3 mb-6">
                    {/* Linha 1: Tabs + Toggle */}
                    <div className="flex items-center gap-2">
                        {/* Tabs — flex-1 para preencher o espaço, texto curto no mobile */}
                        <div className="flex flex-1 min-w-0 bg-white p-1 rounded-xl shadow-sm border border-gray-200">
                            {/* Acervo */}
                            <button
                                onClick={() => navigate('/acervo')}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${viewMode === 'all' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                                title="Acervo Completo"
                            >
                                <Library size={15} className="flex-shrink-0" />
                                <span className="hidden sm:inline">Acervo Completo</span>
                            </button>
                            {/* Meus Livros */}
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
                            {/* Coleções */}
                            <button
                                onClick={() => navigate('/colecoes')}
                                className="flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all text-gray-500 hover:bg-gray-50"
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

                        {/* Toggle Grid/Lista */}
                        <div className="flex flex-shrink-0 bg-white p-1 rounded-xl shadow-sm border border-gray-200">
                            <button
                                onClick={() => setViewLayout('grid')}
                                className={`p-2 rounded-lg transition-all ${viewLayout === 'grid' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
                                title="Modo Grade"
                            >
                                <LayoutGrid size={18} />
                            </button>
                            <button
                                onClick={() => setViewLayout('list')}
                                className={`p-2 rounded-lg transition-all ${viewLayout === 'list' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
                                title="Modo Lista"
                            >
                                <List size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Linha 2: Busca + Filtros na mesma linha */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1 group">
                            <Search size={16} className="absolute left-3 top-3.5 text-gray-400 group-focus-within:text-blue-500" />
                            <input
                                type="text"
                                placeholder="Buscar título ou autor..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                            />
                        </div>

                        {/* Botão Filtros inline */}
                        {!loading && (() => {
                            const activeCount = (selectedGenre ? 1 : 0) + (selectedTag ? 1 : 0);
                            return (
                                <button
                                    onClick={() => setFiltersOpen(o => !o)}
                                    className={`flex-shrink-0 flex items-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium transition-all ${
                                        filtersOpen
                                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                                    }`}
                                >
                                    <Filter size={14} />
                                    Filtros
                                    {activeCount > 0 && (
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                                            {activeCount}
                                        </span>
                                    )}
                                    <ChevronDown size={14} className={`transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
                                </button>
                            );
                        })()}
                    </div>
                </div>

                {/* FILTROS COLAPSÁVEIS */}
                {!loading && (() => {
                    const genreList = Array.from(new Set([...PREDEFINED_GENRES, ...availableGenres]));
                    const activeCount = (selectedGenre ? 1 : 0) + (selectedTag ? 1 : 0) + (selectedArea ? 1 : 0);
                    return (
                        <div className="mb-5">
                            {/* Chips dos filtros ativos + limpar tudo */}
                            {!filtersOpen && activeCount > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                    {selectedGenre && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                                            {selectedGenre}
                                            <button onClick={() => setSelectedGenre(null)} className="hover:text-blue-900"><X size={10} /></button>
                                        </span>
                                    )}
                                    {selectedTag && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                                            #{selectedTag}
                                            <button onClick={() => setSelectedTag(null)} className="hover:text-blue-900"><X size={10} /></button>
                                        </span>
                                    )}
                                    {selectedArea && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                                            <Folder size={10} />
                                            {selectedArea.split(' / ').pop()}
                                            <button onClick={() => setSelectedArea('')} className="hover:text-blue-900"><X size={10} /></button>
                                        </span>
                                    )}
                                    <button
                                        onClick={() => { setSelectedGenre(null); setSelectedTag(null); setSelectedArea(''); }}
                                        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                                    >
                                        <X size={11} /> Limpar tudo
                                    </button>
                                </div>
                            )}

                            {/* Painel expansível */}
                            {filtersOpen && (
                                <div className="border border-gray-200 rounded-xl bg-white p-4 space-y-4">
                                    {/* Pasta — só no Acervo e quando há pastas */}
                                    {viewMode === 'all' && folders.length > 1 && (
                                        <div>
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <Folder size={13} className="text-gray-400" />
                                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pasta</span>
                                            </div>
                                            <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-lg p-1.5 space-y-0.5">
                                                <div
                                                    className={[
                                                        'flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer text-sm transition-colors',
                                                        selectedArea === '' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
                                                    ].join(' ')}
                                                    onClick={() => setSelectedArea('')}
                                                >
                                                    <FolderOpen size={14} className="text-yellow-500" />
                                                    <span>Todos os livros</span>
                                                </div>
                                                {buildFolderTree(folders.filter(f => f.rel !== '')).map(node => (
                                                    <FolderNode
                                                        key={node.rel}
                                                        node={node}
                                                        selectedArea={selectedArea}
                                                        onSelect={setSelectedArea}
                                                        expanded={expandedFolders}
                                                        onToggle={(rel) => setExpandedFolders(prev => ({ ...prev, [rel]: !prev[rel] }))}
                                                        depth={0}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {/* Gênero */}
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <Filter size={13} className="text-gray-400" />
                                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Gênero</span>
                                        </div>
                                        <div className="flex gap-2 flex-wrap">
                                            <button
                                                onClick={() => setSelectedGenre(null)}
                                                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                                    selectedGenre === null
                                                        ? 'bg-blue-600 text-white shadow-sm'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                                                }`}
                                            >
                                                Todos
                                            </button>
                                            {genreList.map((genre) => (
                                                <button
                                                    key={genre}
                                                    onClick={() => setSelectedGenre(genre)}
                                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                                        selectedGenre === genre
                                                            ? 'bg-blue-600 text-white shadow-sm'
                                                            : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                                                    }`}
                                                >
                                                    {genre}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Tags */}
                                    {availableTags.length > 0 && (
                                        <div>
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <Tag size={13} className="text-gray-400" />
                                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</span>
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                <button
                                                    onClick={() => setSelectedTag(null)}
                                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                                        selectedTag === null
                                                            ? 'bg-blue-600 text-white shadow-sm'
                                                            : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                                                    }`}
                                                >
                                                    Todos
                                                </button>
                                                {availableTags.map((tag) => (
                                                    <button
                                                        key={tag}
                                                        onClick={() => setSelectedTag(tag)}
                                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                                            selectedTag === tag
                                                                ? 'bg-blue-600 text-white shadow-sm'
                                                                : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                                                        }`}
                                                    >
                                                        #{tag}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* RESULTADOS */}
                {(loading || listLoading) ? (
                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                        {Array.from({ length: itemsPerPage }).map((_, index) => (
                            <BookCardSkeleton key={index} />
                        ))}
                    </div>
                ) : (
                    <>
                        <div className="mb-4 flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-gray-500">
                                Mostrando {currentItems.length} de {displayTotal} livros encontrados
                            </span>
                            {viewMode === 'my_list' && searchTerm && displayTotal === 0 && (
                                <button
                                    onClick={() => navigate('/acervo')}
                                    className="text-sm text-blue-600 hover:text-blue-700 font-medium underline underline-offset-2"
                                >
                                    Buscar no Acervo Completo →
                                </button>
                            )}
                        </div>

                        {currentItems.length > 0 ? (
                            <>
                                {viewLayout === 'grid' ? (
                                    // MODO GRID — cover-only, info no hover
                                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                                        {currentItems.map((doc, index) => {
                                            const isInMyList = myListIds.has(doc.id);
                                            const myListItem = myListData[doc.id];
                                            const coverUrl = `${api.defaults.baseURL}/documents/${doc.id}/cover`;
                                            const delayStyle = { animationDelay: `${index * 40}ms` };

                                            return (
                                                <div
                                                    key={doc.id}
                                                    className="relative group animate-fade-in-up"
                                                    style={delayStyle}
                                                >
                                                    {/* CAPA com overflow-hidden para clip */}
                                                    <div
                                                        className="aspect-[2/3] overflow-hidden rounded-xl relative shadow-sm group-hover:shadow-xl transition-shadow duration-300 cursor-pointer bg-gray-200"
                                                        onClick={() => handleRead(doc.id)}
                                                    >
                                                        <img
                                                            src={coverUrl}
                                                            alt={doc.titulo}
                                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                            onError={(e) => {
                                                                e.target.style.display = 'none';
                                                                e.target.nextSibling.classList.remove('hidden');
                                                                e.target.nextSibling.classList.add('flex');
                                                            }}
                                                        />

                                                        {/* Fallback gradiente */}
                                                        <div className={`hidden absolute inset-0 bg-gradient-to-br ${getGradient(doc.id)} items-center justify-center p-3 text-center`}>
                                                            <h3 className="text-white font-bold text-sm drop-shadow leading-tight">{doc.titulo}</h3>
                                                        </div>

                                                        {/* Hover overlay */}
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-2.5">
                                                            <h3 className="text-white font-bold text-xs leading-tight line-clamp-2 mb-0.5">{doc.titulo}</h3>
                                                            <p className="text-gray-300 text-xs mb-1.5 line-clamp-1">{doc.autor || 'Autor Desconhecido'}</p>

                                                            <div className="flex flex-wrap gap-1 mb-2">
                                                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-white/20 text-white">
                                                                    <Calendar size={9} />{doc.ano || 'N/A'}
                                                                </span>
                                                                {doc.genero && (
                                                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-blue-500/70 text-white">
                                                                        <Tag size={9} />{doc.genero}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Barra de progresso */}
                                                            {isInMyList && myListItem && myListItem.current_page > 0 && myListItem.total_pages > 0 && (
                                                                <div className="mb-2">
                                                                    <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                                                                        <span>Progresso</span>
                                                                        <span>{Math.round((myListItem.current_page / myListItem.total_pages) * 100)}%</span>
                                                                    </div>
                                                                    <div className="w-full bg-white/20 rounded-full h-1">
                                                                        <div
                                                                            className="bg-blue-400 h-1 rounded-full"
                                                                            style={{ width: `${Math.min(100, Math.round((myListItem.current_page / myListItem.total_pages) * 100))}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Botões de ação */}
                                                            <div className="flex gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                                                                {isAdmin && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); navigate(`/edit-book/${doc.id}`); }}
                                                                        className="h-7 w-7 bg-white/20 text-white rounded-lg hover:bg-white/40 border border-white/20 transition flex items-center justify-center flex-shrink-0"
                                                                        title="Editar"
                                                                    >
                                                                        <Edit size={12} />
                                                                    </button>
                                                                )}

                                                                {/* Trigger da coleção */}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (collectionMenuDocId === doc.id) {
                                                                            setCollectionMenuDocId(null);
                                                                        } else {
                                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                                            setCollectionMenuPos({ top: rect.bottom + 6, left: rect.left });
                                                                            setCollectionMenuDocId(doc.id);
                                                                        }
                                                                    }}
                                                                    className="h-7 w-7 bg-white/20 text-white rounded-lg hover:bg-white/40 border border-white/20 transition flex items-center justify-center flex-shrink-0"
                                                                    title="Coleção"
                                                                >
                                                                    <FolderPlus size={12} />
                                                                </button>

                                                                {isInMyList ? (
                                                                    <>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handleRead(doc.id); }}
                                                                            className="flex-1 h-7 flex items-center justify-center gap-1 bg-green-500/80 text-white rounded-lg hover:bg-green-500 transition text-xs font-semibold"
                                                                        >
                                                                            <BookOpen size={11} />
                                                                            {myListItem?.current_page > 1 ? 'Continuar' : 'Ler'}
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => handleRemoveFromList(e, doc.id)}
                                                                            disabled={actionLoading === doc.id}
                                                                            className="h-7 w-7 bg-red-500/70 text-white rounded-lg hover:bg-red-500 transition flex items-center justify-center flex-shrink-0 disabled:opacity-50"
                                                                        >
                                                                            {actionLoading === doc.id ? <div className="animate-spin h-3 w-3 border-b-2 border-white rounded-full" /> : <Trash2 size={11} />}
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <button
                                                                        onClick={(e) => handleAddToList(e, doc.id)}
                                                                        disabled={actionLoading === doc.id}
                                                                        className="flex-1 h-7 flex items-center justify-center gap-1 bg-blue-500/80 text-white rounded-lg hover:bg-blue-500 transition text-xs font-semibold disabled:opacity-50"
                                                                    >
                                                                        {actionLoading === doc.id ?
                                                                            <div className="animate-spin h-3 w-3 border-b-2 border-white rounded-full" />
                                                                            : <><Plus size={11} /> Salvar</>
                                                                        }
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Dropdown coleção renderizado via portal — ver CollectionPortalMenu abaixo do return */}

                                                    {/* Mobile: strip de ação persistente (substitui hover) */}
                                                    <div className="sm:hidden absolute bottom-0 left-0 right-0 flex rounded-b-xl overflow-hidden">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleRead(doc.id); }}
                                                            className="flex-1 py-1.5 text-white text-[11px] font-semibold flex items-center justify-center gap-1 bg-black/65"
                                                        >
                                                            <BookOpen size={11} />
                                                            {isInMyList ? (myListData[doc.id]?.current_page > 1 ? 'Continuar' : 'Ler') : 'Ver'}
                                                        </button>
                                                        {!myListIds.has(doc.id) ? (
                                                            <button
                                                                onClick={(e) => handleAddToList(e, doc.id)}
                                                                disabled={actionLoading === doc.id}
                                                                className="px-2.5 py-1.5 text-white text-[11px] font-semibold flex items-center justify-center bg-blue-600/80 disabled:opacity-50"
                                                            >
                                                                <Plus size={12} />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={(e) => handleRemoveFromList(e, doc.id)}
                                                                disabled={actionLoading === doc.id}
                                                                className="px-2.5 py-1.5 text-white text-[11px] font-semibold flex items-center justify-center bg-red-500/80 disabled:opacity-50"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    // MODO LISTA (Compacto horizontal)
                                    <div className="space-y-3">
                                        {currentItems.map((doc, index) => {
                                            const isInMyList = myListIds.has(doc.id);
                                            const myListItem = myListData[doc.id];
                                            const coverUrl = `${api.defaults.baseURL}/documents/${doc.id}/cover`;
                                            const delayStyle = { animationDelay: `${index * 30}ms` };

                                            return (
                                                <div 
                                                    key={doc.id} 
                                                    className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all border border-gray-100 flex items-center gap-4 group animate-fade-in-up"
                                                    style={delayStyle}
                                                >
                                                    {/* Capa mini */}
                                                    <div className="w-16 h-24 flex-shrink-0 relative overflow-hidden bg-gray-200 rounded-md">
                                                        <img 
                                                            src={coverUrl} 
                                                            alt={doc.titulo}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => { 
                                                                e.target.style.display = 'none'; 
                                                                e.target.nextSibling.classList.remove('hidden');
                                                                e.target.nextSibling.classList.add('flex');
                                                            }}
                                                        />
                                                        <div className={`hidden absolute inset-0 bg-gradient-to-br ${getGradient(doc.id)} items-center justify-center`}>
                                                            <BookOpen size={20} className="text-white opacity-80" />
                                                        </div>
                                                    </div>

                                                    {/* Informações compactas */}
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-bold text-gray-900 text-sm sm:text-base truncate">{doc.titulo}</h3>
                                                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs sm:text-sm text-gray-600 mt-0.5">
                                                            <span className="truncate max-w-[120px] sm:max-w-none">{doc.autor || "Autor Desconhecido"}</span>
                                                            <span className="text-gray-300 hidden sm:inline">•</span>
                                                            <span className="hidden sm:inline">{doc.ano || 'N/A'}</span>
                                                            {doc.genero && (
                                                                <span className="text-blue-600 font-medium">{doc.genero}</span>
                                                            )}
                                                        </div>

                                                        {/* Barra de Progresso (Lista) */}
                                                        {isInMyList && myListItem && myListItem.current_page > 0 && (
                                                            <div className="mt-2 max-w-xs flex items-center gap-3">
                                                                {myListItem.total_pages && myListItem.total_pages > 0 ? (
                                                                    <>
                                                                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                                            <div 
                                                                                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" 
                                                                                style={{ width: `${Math.min(100, Math.round((myListItem.current_page / myListItem.total_pages) * 100))}%` }}
                                                                            ></div>
                                                                        </div>
                                                                        <span className="text-xs font-medium text-gray-500">{Math.round((myListItem.current_page / myListItem.total_pages) * 100)}%</span>
                                                                    </>
                                                                ) : (
                                                                    <span className="text-xs font-medium text-gray-500">Pág. {myListItem.current_page}</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Botões de ação compactos */}
                                                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                                                        {/* Botão Editar (apenas admin, oculto em mobile) */}
                                                        {isAdmin && (
                                                            <button
                                                                onClick={() => navigate(`/edit-book/${doc.id}`)}
                                                                className={`${iconTooltipClass} hidden sm:flex h-9 w-9 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300 transition items-center justify-center flex-shrink-0`}
                                                                aria-label="Editar livro"
                                                            >
                                                                <Edit size={14} />
                                                                {renderTooltip("Editar livro")}
                                                            </button>
                                                        )}

                                                        {renderCollectionMenu(doc.id, true)}
                                                        
                                                        {isInMyList ? (
                                                            <>
                                                                <button 
                                                                    onClick={() => handleRead(doc.id)} 
                                                                    className={`${iconTooltipClass} h-9 w-9 bg-green-50 text-green-700 rounded-lg font-medium hover:bg-green-100 border border-green-200 transition flex items-center justify-center flex-shrink-0`}
                                                                    aria-label={myListItem.current_page > 1 ? 'Continuar leitura' : 'Ler'}
                                                                >
                                                                    <BookOpen size={14} />
                                                                    {renderTooltip(myListItem.current_page > 1 ? "Continuar leitura" : "Ler")}
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => handleRemoveFromList(e, doc.id)}
                                                                    disabled={actionLoading === doc.id}
                                                                    className={`${iconTooltipClass} h-9 w-9 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 border border-red-200 transition disabled:opacity-50 flex items-center justify-center flex-shrink-0`}
                                                                    aria-label="Remover da lista"
                                                                >
                                                                    {actionLoading === doc.id ? 
                                                                        <div className="animate-spin h-3 w-3 border-b-2 border-red-600 rounded-full"></div> 
                                                                        : <Trash2 size={14} />
                                                                    }
                                                                    {renderTooltip("Remover da lista")}
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button 
                                                                onClick={(e) => handleAddToList(e, doc.id)}
                                                                disabled={actionLoading === doc.id}
                                                                className={`${iconTooltipClass} h-9 w-9 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-blue-400 flex items-center justify-center flex-shrink-0`}
                                                                aria-label="Adicionar aos meus livros"
                                                            >
                                                                {actionLoading === doc.id ? 
                                                                    <div className="animate-spin h-3 w-3 border-b-2 border-white rounded-full"></div> 
                                                                    : <Plus size={14} />
                                                                }
                                                                {renderTooltip("Adicionar aos meus livros")}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
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

                        {/* PAGINAÇÃO: client-side para Meus Livros */}
                        {viewMode === 'my_list' && displayTotal > itemsPerPage && (
                            <div className="mt-10 flex justify-center items-center gap-4">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 rounded-lg border border-gray-300 disabled:opacity-30 hover:bg-white transition shadow-sm"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <div className="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
                                    <span className="text-sm font-semibold text-gray-700">Página {currentPage} de {totalPages}</span>
                                </div>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="p-2 rounded-lg border border-gray-300 disabled:opacity-30 hover:bg-white transition shadow-sm"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        )}

                        {/* INFINITE SCROLL SENTINEL: Acervo Completo */}
                        {viewMode === 'all' && (
                            <div ref={sentinelRef} className="mt-8 flex justify-center items-center h-10">
                                {isLoadingMore && (
                                    <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                                )}
                                {!hasMore && documents.length > 0 && !loading && (
                                    <p className="text-sm text-gray-400">Todos os {totalItems} livros carregados</p>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* Portal do menu de coleção — escapa qualquer overflow-hidden */}
            {collectionMenuDocId !== null && createPortal(
                <>
                    {/* Backdrop invisível para fechar ao clicar fora */}
                    <div
                        className="fixed inset-0 z-[9998]"
                        onClick={() => setCollectionMenuDocId(null)}
                    />
                    <div
                        className="fixed z-[9999] w-72 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-left"
                        style={{ top: collectionMenuPos.top, left: Math.min(Math.max(8, collectionMenuPos.left), window.innerWidth - 296) }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-sm font-semibold text-gray-900 mb-2">Adicionar a coleção</div>
                        <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
                            {collections.length === 0 ? (
                                <p className="text-xs text-gray-500 py-2">Nenhuma coleção criada.</p>
                            ) : (
                                collections.map((collection) => {
                                    const alreadyAdded = collection.book_ids?.includes(collectionMenuDocId);
                                    return (
                                        <button
                                            key={collection.id}
                                            onClick={(e) => handleAddToCollection(e, collection.id, collectionMenuDocId)}
                                            disabled={alreadyAdded || collectionLoading === `${collection.id}-${collectionMenuDocId}`}
                                            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-default"
                                        >
                                            <span className="truncate">{collection.nome}</span>
                                            {alreadyAdded
                                                ? <Check size={16} className="text-green-600 flex-shrink-0" />
                                                : <Plus size={14} className="text-violet-600 flex-shrink-0" />}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                        <div className="border-t border-gray-100 pt-3">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Nova coleção</label>
                            <div className="flex gap-2">
                                <input
                                    value={collectionName}
                                    onChange={(e) => setCollectionName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCollection(e, collectionMenuDocId); }}
                                    className="min-w-0 flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-violet-500 outline-none"
                                    placeholder="Nome"
                                    autoFocus
                                />
                                <button
                                    onClick={(e) => handleCreateCollection(e, collectionMenuDocId)}
                                    disabled={!collectionName.trim() || collectionLoading === `new-${collectionMenuDocId}`}
                                    className="px-3 py-1.5 bg-violet-600 text-white rounded-md text-sm font-medium hover:bg-violet-700 disabled:bg-violet-300"
                                >
                                    Criar
                                </button>
                            </div>
                        </div>
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};

export default DocumentList;
