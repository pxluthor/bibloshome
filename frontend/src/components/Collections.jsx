import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library, FolderOpen, Trash2, Edit2, Check, X, BookOpen, Loader2 } from 'lucide-react';
import api from '../services/api';
import UserMenu from './UserMenu';

const Collections = () => {
    const [collections, setCollections] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [loading, setLoading] = useState(true);

    const navigate = useNavigate();
    const apiBaseUrl = api.defaults.baseURL;
    const userName = localStorage.getItem('userName') || 'Usuário';
    const isAdmin = localStorage.getItem('isAdmin') === 'true';

    useEffect(() => {
        fetchCollections();
    }, []);

    const fetchCollections = async () => {
        try {
            setLoading(true);
            const response = await api.get('/collections');
            const data = Array.isArray(response.data) ? response.data : [];
            setCollections(data);
            if (data.length > 0) setSelectedId(data[0].id);
        } catch (error) {
            console.error('Erro ao buscar coleções:', error);
        } finally {
            setLoading(false);
        }
    };

    const renameCollection = async (id) => {
        const nome = renameValue.trim();
        if (!nome) return;
        try {
            await api.put(`/collections/${id}`, { nome });
            setCollections(prev => prev.map(c => c.id === id ? { ...c, nome } : c));
            setRenamingId(null);
        } catch (error) {
            console.error('Erro ao renomear:', error);
            alert('Erro ao renomear coleção.');
        }
    };

    const deleteCollection = async (id) => {
        try {
            await api.delete(`/collections/${id}`);
            const updated = collections.filter(c => c.id !== id);
            setCollections(updated);
            setDeleteConfirmId(null);
            if (selectedId === id) setSelectedId(updated[0]?.id ?? null);
        } catch (error) {
            console.error('Erro ao deletar:', error);
            alert('Erro ao deletar coleção.');
        }
    };

    const removeBook = async (colId, livroId) => {
        try {
            await api.delete(`/collections/${colId}/books/${livroId}`);
            setCollections(prev => prev.map(c => {
                if (c.id !== colId) return c;
                return {
                    ...c,
                    book_ids: c.book_ids.filter(id => id !== livroId),
                    books: (c.books || []).filter(b => b.id !== livroId),
                    total_livros: Math.max((c.total_livros || 0) - 1, 0),
                };
            }));
        } catch (error) {
            console.error('Erro ao remover livro:', error);
            alert('Erro ao remover livro da coleção.');
        }
    };

    const selectedCollection = collections.find(c => c.id === selectedId);
    const selectedBooks = selectedCollection?.books || [];

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            {/* HEADER — igual ao DocumentList */}
            <header className="bg-white shadow-sm sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-600 text-white p-2 rounded-lg cursor-pointer" onClick={() => navigate('/')}>
                            <Library size={24} />
                        </div>
                        <h1 className="text-xl font-bold tracking-tight cursor-pointer" onClick={() => navigate('/')}>
                            Library<span className="text-green-600">Anywhere</span>
                        </h1>
                    </div>
                    <UserMenu userName={userName} isAdmin={isAdmin} pedidosPendentes={0} adminPendentes={0} />
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Minhas Coleções</h2>

                {collections.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center">
                        <FolderOpen className="h-20 w-20 text-gray-300 mb-4" />
                        <p className="text-lg font-semibold text-gray-700">Nenhuma coleção criada</p>
                        <button
                            onClick={() => navigate('/')}
                            className="mt-3 text-sm font-semibold text-blue-600 hover:text-blue-700"
                        >
                            Ir ao acervo →
                        </button>
                    </div>
                ) : (
                    <>
                        {/* CHIPS DE COLEÇÕES */}
                        <div className="flex flex-wrap gap-2 mb-2">
                            {collections.map(col => (
                                <div key={col.id} className="relative">
                                    {renamingId === col.id ? (
                                        <div className="flex items-center gap-1 px-3 py-1.5 bg-white border border-blue-400 rounded-full shadow-sm">
                                            <input
                                                value={renameValue}
                                                onChange={e => setRenameValue(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') renameCollection(col.id);
                                                    if (e.key === 'Escape') setRenamingId(null);
                                                }}
                                                className="text-sm outline-none w-32"
                                                autoFocus
                                            />
                                            <button onClick={() => renameCollection(col.id)} className="text-green-600 hover:text-green-700">
                                                <Check size={14} />
                                            </button>
                                            <button onClick={() => setRenamingId(null)} className="text-gray-400 hover:text-gray-600">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border cursor-pointer transition-all ${
                                            selectedId === col.id
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                                : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                                        }`}>
                                            <span onClick={() => setSelectedId(col.id)}>{col.nome}</span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                                                selectedId === col.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {col.total_livros}
                                            </span>
                                            <button
                                                onClick={e => { e.stopPropagation(); setRenamingId(col.id); setRenameValue(col.nome); }}
                                                className={`hover:opacity-70 transition ${selectedId === col.id ? 'text-white' : 'text-gray-400'}`}
                                            >
                                                <Edit2 size={12} />
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); setDeleteConfirmId(col.id); }}
                                                className={`hover:opacity-70 transition ${selectedId === col.id ? 'text-white' : 'text-red-400'}`}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    )}

                                    {/* Confirmação de delete */}
                                    {deleteConfirmId === col.id && (
                                        <div className="absolute top-full left-0 mt-2 z-30 bg-white border border-red-200 rounded-xl shadow-xl p-4 w-64">
                                            <p className="text-sm text-gray-800 font-medium mb-3">
                                                Deletar "{col.nome}"? Esta ação não pode ser desfeita.
                                            </p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => deleteCollection(col.id)}
                                                    className="flex-1 px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700"
                                                >
                                                    Deletar
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirmId(null)}
                                                    className="flex-1 px-3 py-1.5 border border-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-50"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* GRID DE LIVROS DA COLEÇÃO SELECIONADA */}
                        {selectedCollection && (
                            selectedBooks.length === 0 ? (
                                <div className="mt-12 text-center text-gray-400">
                                    <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
                                    <p className="text-sm">Nenhum livro nesta coleção.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 mt-6">
                                    {selectedBooks.map(livro => (
                                        <div key={livro.id} className="relative group/book">
                                            <div
                                                className="relative aspect-[2/3] overflow-hidden rounded-lg bg-gradient-to-br from-blue-100 to-purple-100 cursor-pointer"
                                                onClick={() => navigate(`/document/${livro.id}`)}
                                            >
                                                <img
                                                    src={`${apiBaseUrl}/documents/${livro.id}/cover`}
                                                    alt={livro.titulo}
                                                    className="h-full w-full object-cover"
                                                    onError={e => { e.currentTarget.style.display = 'none'; }}
                                                />
                                                {/* Overlay no hover */}
                                                <div className="absolute inset-0 bg-black/0 group-hover/book:bg-black/45 transition-all duration-200" />
                                                {/* Botão ler */}
                                                <button
                                                    onClick={e => { e.stopPropagation(); navigate(`/document/${livro.id}`); }}
                                                    className="absolute bottom-2 left-2 h-8 w-8 rounded-full bg-green-500 text-white flex items-center justify-center opacity-0 group-hover/book:opacity-100 transition-all hover:bg-green-600 shadow"
                                                    title="Ler"
                                                >
                                                    <BookOpen size={14} />
                                                </button>
                                                {/* Botão remover */}
                                                <button
                                                    onClick={e => { e.stopPropagation(); removeBook(selectedId, livro.id); }}
                                                    className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover/book:opacity-100 transition-all hover:bg-red-700 shadow"
                                                    title="Remover da coleção"
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                            <p className="mt-1.5 text-xs text-gray-700 truncate leading-tight" title={livro.titulo}>
                                                {livro.titulo}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </>
                )}
            </main>
        </div>
    );
};

export default Collections;
