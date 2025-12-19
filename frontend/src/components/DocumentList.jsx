import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Search, BookOpen, Plus, LogOut, Library, 
    Calendar, User, Tag, ChevronLeft, ChevronRight, 
    Bookmark, Trash2 
} from 'lucide-react';
import api from '../services/api';

const DocumentList = () => {
    // --- ESTADOS DE DADOS ---
    const [documents, setDocuments] = useState([]);
    const [myListIds, setMyListIds] = useState(new Set());

    // --- ESTADOS DE CONTROLE ---
    const [viewMode, setViewMode] = useState('all');
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8; // Ajustado para melhor visualização em grid

    // --- ESTADOS DE CARREGAMENTO ---
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);

    const navigate = useNavigate();
    const userName = localStorage.getItem('userName') || 'Estudante';

    useEffect(() => {
        fetchData();
    }, []);

    // Resetar página ao buscar ou mudar de aba
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, viewMode]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [docsResponse, myListResponse] = await Promise.all([
                api.get('/documents'),
                api.get('/my-list').catch(() => ({ data: [] }))
            ]);

            // Garantimos que os dados são um array antes de salvar
            const docs = Array.isArray(docsResponse.data) ? docsResponse.data : [];
            setDocuments(docs);

            // Extração correta dos IDs da lista do usuário
            const ids = new Set(myListResponse.data.map(item => item.livro?.id).filter(id => id));
            setMyListIds(ids);
        } catch (error) {
            console.error("Erro ao buscar documentos:", error);
        } finally {
            setLoading(false);
        }
    };

    // --- FUNÇÕES DE AÇÃO ---
    const handleLogout = () => {
        localStorage.clear();
        navigate('/login');
    };

    const handleAddToList = async (e, docId) => {
        e.stopPropagation();
        setActionLoading(docId);
        try {
            await api.post(`/my-list/add/${docId}`);
            setMyListIds(prev => new Set([...prev, docId]));
        } catch (error) {
            console.error("Erro ao adicionar:", error);
            alert("Erro ao adicionar livro.");
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
            alert("Erro ao remover livro.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleRead = (docId) => {
        navigate(`/document/${docId}`);
    };

    // --- LÓGICA DE FILTRAGEM E PAGINAÇÃO ---
    const filteredData = useMemo(() => {
        let data = viewMode === 'my_list'
            ? documents.filter(doc => myListIds.has(doc.id))
            : documents;

        if (searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase();
            data = data.filter(doc =>
                (doc.titulo || "").toLowerCase().includes(lowerTerm) ||
                (doc.autor || "").toLowerCase().includes(lowerTerm)
            );
        }
        return data;
    }, [documents, myListIds, viewMode, searchTerm]);

    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    const currentItems = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredData.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredData, currentPage]);

    const getGradient = (id) => {
        const gradients = [
            "from-blue-500 to-blue-700", "from-emerald-500 to-emerald-700",
            "from-purple-500 to-purple-700", "from-rose-500 to-rose-700",
            "from-orange-500 to-orange-700", "from-indigo-500 to-indigo-700",
        ];
        return gradients[id % gradients.length];
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-20">
            {/* HEADER */}
            <header className="bg-white shadow-sm sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-600 text-white p-2 rounded-lg"><Library size={24} /></div>
                        <h1 className="text-xl font-bold tracking-tight">Biblos<span className="text-blue-600">Home</span></h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="hidden md:block text-sm font-semibold text-gray-700">{userName}</span>
                        <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition">
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* CONTROLES */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
                    <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200 w-full md:w-auto">
                        <button
                            onClick={() => setViewMode('all')}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'all' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            Acervo Completo
                        </button>
                        <button
                            onClick={() => setViewMode('my_list')}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${viewMode === 'my_list' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            <Bookmark size={16} /> Meus Livros
                        </button>
                    </div>

                    <div className="relative w-full md:w-96 group">
                        <Search size={18} className="absolute left-3 top-3.5 text-gray-400 group-focus-within:text-blue-500" />
                        <input
                            type="text"
                            placeholder="Buscar título ou autor..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>
                </div>

                {/* RESULTADOS */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                ) : (
                    <>
                        <div className="mb-4 text-sm text-gray-500">
                            Mostrando {currentItems.length} de {totalItems} livros encontrados
                        </div>

                        {currentItems.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {currentItems.map((doc) => {
                                    const isInMyList = myListIds.has(doc.id);
                                    const coverUrl = `${api.defaults.baseURL}/documents/${doc.id}/cover`;

                                    return (
                                        <div key={doc.id} className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all overflow-hidden border border-gray-100 flex flex-col h-full group">
                                            
                                            {/* CONTAINER DA CAPA */}
                                            <div className="h-56 relative overflow-hidden bg-gray-200 flex items-center justify-center">
                                                <img 
                                                    src={coverUrl} 
                                                    alt={doc.titulo}
                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                                    onError={(e) => { 
                                                        e.target.style.display = 'none'; 
                                                        e.target.nextSibling.classList.remove('hidden');
                                                        e.target.nextSibling.classList.add('flex');
                                                    }}
                                                />
                                                
                                                {/* Fallback (Gradiente) */}
                                                <div className={`hidden absolute inset-0 bg-gradient-to-br ${getGradient(doc.id)} items-center justify-center p-6 text-center`}>
                                                    <h3 className="text-white font-bold text-lg drop-shadow-md leading-tight">
                                                        {doc.titulo}
                                                    </h3>
                                                </div>

                                                <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm p-2 rounded-lg text-white z-10">
                                                    <BookOpen size={20} />
                                                </div>
                                            </div>

                                            {/* INFO DO LIVRO */}
                                            <div className="p-5 flex-1 flex flex-col">
                                                <h3 className="font-bold text-gray-900 mb-2 line-clamp-1">{doc.titulo}</h3>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <User size={14} className="text-blue-500" />
                                                    <p className="text-sm font-medium text-gray-700 line-clamp-1">{doc.autor || "Autor Desconhecido"}</p>
                                                </div>
                                                
                                                <div className="flex flex-wrap gap-2 mb-6 mt-auto">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-800">
                                                        <Calendar size={10} />{doc.ano || 'N/A'}
                                                    </span>
                                                    {doc.genero && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">
                                                            <Tag size={10} />{doc.genero}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* BOTÕES DE AÇÃO */}
                                                <div className="flex gap-2">
                                                    {isInMyList ? (
                                                        <>
                                                            <button 
                                                                onClick={() => handleRead(doc.id)} 
                                                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 rounded-lg font-semibold hover:bg-green-100 border border-green-200 transition shadow-sm"
                                                            >
                                                                <BookOpen size={18} /> Ler
                                                            </button>
                                                            <button 
                                                                onClick={(e) => handleRemoveFromList(e, doc.id)}
                                                                disabled={actionLoading === doc.id}
                                                                className="px-3 py-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 border border-red-200 transition flex items-center justify-center shadow-sm disabled:opacity-50"
                                                            >
                                                                {actionLoading === doc.id ? 
                                                                    <div className="animate-spin h-4 w-4 border-b-2 border-red-600 rounded-full"></div> 
                                                                    : <Trash2 size={18} />
                                                                }
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button 
                                                            onClick={(e) => handleAddToList(e, doc.id)}
                                                            disabled={actionLoading === doc.id}
                                                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition shadow-md disabled:bg-blue-400"
                                                        >
                                                            {actionLoading === doc.id ? 
                                                                <div className="animate-spin h-5 w-5 border-b-2 border-white rounded-full"></div> 
                                                                : <><Plus size={18} /> Adicionar</>
                                                            }
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-gray-300">
                                <div className="mx-auto h-16 w-16 text-gray-300 mb-4"><Search size={64} /></div>
                                <h3 className="text-lg font-medium text-gray-900">Nenhum livro encontrado</h3>
                                <p className="text-gray-500">Tente ajustar sua busca ou mudar o filtro.</p>
                            </div>
                        )}

                        {/* PAGINAÇÃO */}
                        {totalItems > itemsPerPage && (
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
                    </>
                )}
            </main>
        </div>
    );
};

export default DocumentList;