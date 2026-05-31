import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Trash2, FolderPlus, Info, Edit, Calendar, Tag } from 'lucide-react';

/**
 * Card no modo grade (aspect-[2/3]).
 * Contém: capa, hover overlay, strip vertical direita (Coleção/Detalhes/Editar),
 * strip horizontal inferior (Ler/Salvar).
 */
export default function BookCard({
    doc,
    isInMyList,
    myListItem,
    isAdmin,
    actionLoading,
    animationDelay = '0ms',
    onRead,
    onAddToList,
    onRemoveFromList,
    onCollectionClick,
    onDetailsClick,
    apiBaseUrl,
    getGradient,
}) {
    const navigate = useNavigate();

    return (
        <div
            className="relative group animate-fade-in-up"
            style={{ animationDelay }}
        >
            {/* Capa com overflow-hidden para clip */}
            <div
                className="aspect-[2/3] overflow-hidden rounded-xl relative shadow-sm group-hover:shadow-xl transition-shadow duration-300 cursor-pointer bg-gray-200"
                onClick={() => onRead(doc.id)}
            >
                <img
                    src={`${apiBaseUrl}/documents/${doc.id}/cover`}
                    alt={doc.titulo}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={e => {
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
                </div>
            </div>

            {/* Strip vertical direita — Coleção, Detalhes, Editar */}
            <div className="absolute right-1 top-1 flex flex-col gap-1 z-10">
                <button
                    onClick={e => onCollectionClick(e, doc.id)}
                    className="w-8 h-8 rounded-lg bg-violet-600/80 text-white flex items-center justify-center"
                    title="Coleção"
                >
                    <FolderPlus size={13} />
                </button>
                {doc.sinopse && (
                    <button
                        onClick={e => { e.stopPropagation(); onDetailsClick(doc); }}
                        className="w-8 h-8 rounded-lg bg-gray-700/70 text-white flex items-center justify-center"
                        title="Detalhes"
                    >
                        <Info size={13} />
                    </button>
                )}
                {isAdmin && (
                    <button
                        onClick={e => { e.stopPropagation(); navigate(`/edit-book/${doc.id}`); }}
                        className="w-8 h-8 rounded-lg bg-gray-600/70 text-white flex items-center justify-center"
                        title="Editar"
                    >
                        <Edit size={13} />
                    </button>
                )}
            </div>

            {/* Strip horizontal inferior — Ler + Salvar/Remover */}
            <div className="absolute bottom-0 left-0 right-0 flex rounded-b-xl overflow-hidden z-10">
                <button
                    onClick={e => { e.stopPropagation(); onRead(doc.id); }}
                    className="flex-1 py-1.5 text-white text-[11px] font-semibold flex items-center justify-center gap-1 bg-black/65"
                >
                    <BookOpen size={11} />
                    {isInMyList ? (myListItem?.current_page > 1 ? 'Continuar' : 'Ler') : 'Ver'}
                </button>

                {!isInMyList ? (
                    <button
                        onClick={e => onAddToList(e, doc.id)}
                        disabled={actionLoading === doc.id}
                        className="px-3 py-1.5 text-white text-[11px] font-semibold flex items-center justify-center gap-1 bg-blue-600/80 disabled:opacity-50"
                    >
                        <Plus size={12} /> Salvar
                    </button>
                ) : (
                    <button
                        onClick={e => onRemoveFromList(e, doc.id)}
                        disabled={actionLoading === doc.id}
                        className="px-2.5 py-1.5 text-white flex items-center justify-center bg-red-500/80 disabled:opacity-50"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </div>
        </div>
    );
}
