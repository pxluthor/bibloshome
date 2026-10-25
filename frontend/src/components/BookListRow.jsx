import React from 'react';
import { cleanTitle } from '../utils/bookTitle';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Trash2, FolderPlus, Edit, Flag } from 'lucide-react';

/** Tooltip CSS-only — aparece no hover de botões com class group/btn */
const Tooltip = ({ label }) => (
    <span
        aria-hidden="true"
        className="invisible pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 translate-y-1 scale-95 whitespace-nowrap rounded-md bg-gray-950 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover/btn:visible group-hover/btn:translate-y-0 group-hover/btn:scale-100 group-hover/btn:opacity-100"
    >
        {label}
        <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-gray-950" />
    </span>
);

const iconTooltipClass = 'group/btn relative overflow-visible';

/**
 * Linha no modo lista (horizontal compacto).
 */
export default function BookListRow({
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
    onToggleDuplicate,
    apiBaseUrl,
    getGradient,
}) {
    const navigate = useNavigate();

    return (
        <div
            className={`rounded-lg shadow-sm hover:shadow-md transition-all border flex items-center gap-4 group animate-fade-in-up ${
                doc.is_duplicate ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'
            }`}
            style={{ animationDelay }}
        >
            {/* Capa mini */}
            <div className="w-16 h-24 flex-shrink-0 relative overflow-hidden bg-gray-200 rounded-md">
                <img
                    src={`${apiBaseUrl}/documents/${doc.id}/cover`}
                    alt={doc.titulo}
                    className="w-full h-full object-cover"
                    onError={e => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.classList.remove('hidden');
                        e.target.nextSibling.classList.add('flex');
                    }}
                />
                <div className={`hidden absolute inset-0 bg-gradient-to-br ${getGradient(doc.id)} items-center justify-center`}>
                    <BookOpen size={20} className="text-white opacity-80" />
                </div>
            </div>

            {/* Informações */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 text-sm sm:text-base truncate">{cleanTitle(doc.titulo)}</h3>
                    {doc.is_duplicate && (
                        <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 uppercase">
                            Duplicado
                        </span>
                    )}
                </div>
                <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs sm:text-sm text-gray-600 mt-0.5">
                    <span className="truncate max-w-[120px] sm:max-w-none">{doc.autor || 'Autor Desconhecido'}</span>
                    <span className="text-gray-300 hidden sm:inline">•</span>
                    <span className="hidden sm:inline">{doc.ano || 'N/A'}</span>
                    {doc.genero && <span className="text-blue-600 font-medium">{doc.genero}</span>}
                </div>

                {/* Barra de progresso */}
                {isInMyList && myListItem && myListItem.current_page > 0 && (
                    <div className="mt-2 max-w-xs flex items-center gap-3">
                        {myListItem.total_pages && myListItem.total_pages > 0 ? (
                            <>
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min(100, Math.round((myListItem.current_page / myListItem.total_pages) * 100))}%` }}
                                    />
                                </div>
                                <span className="text-xs font-medium text-gray-500">
                                    {Math.round((myListItem.current_page / myListItem.total_pages) * 100)}%
                                </span>
                            </>
                        ) : (
                            <span className="text-xs font-medium text-gray-500">Pág. {myListItem.current_page}</span>
                        )}
                    </div>
                )}
            </div>

            {/* Botões de ação */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 pr-3">
                {/* Editar — só admin, oculto em mobile */}
                {isAdmin && (
                    <button
                        onClick={() => navigate(`/edit-book/${doc.id}`)}
                        className={`${iconTooltipClass} hidden sm:flex h-9 w-9 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300 transition items-center justify-center flex-shrink-0`}
                        aria-label="Editar livro"
                    >
                        <Edit size={14} />
                        <Tooltip label="Editar livro" />
                    </button>
                )}
                {isAdmin && (
                    <button
                        onClick={() => onToggleDuplicate(doc.id)}
                        className={`${iconTooltipClass} h-9 w-9 rounded-lg border transition flex items-center justify-center flex-shrink-0 ${
                            doc.is_duplicate
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-white text-gray-400 border-gray-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200'
                        }`}
                        aria-label={doc.is_duplicate ? 'Desmarcar duplicado' : 'Marcar como duplicado'}
                    >
                        <Flag size={14} />
                        <Tooltip label={doc.is_duplicate ? 'Desmarcar duplicado' : 'Marcar como duplicado'} />
                    </button>
                )}

                {/* Coleção */}
                <button
                    onClick={e => onCollectionClick(e, doc.id)}
                    className={`${iconTooltipClass} h-9 w-9 bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 border border-violet-200 transition flex items-center justify-center shadow-sm flex-shrink-0`}
                    aria-label="Adicionar a coleção"
                >
                    <FolderPlus size={14} />
                    <Tooltip label="Adicionar a coleção" />
                </button>

                {isInMyList ? (
                    <>
                        <button
                            onClick={() => onRead(doc.id)}
                            className={`${iconTooltipClass} h-9 w-9 bg-green-50 text-green-700 rounded-lg font-medium hover:bg-green-100 border border-green-200 transition flex items-center justify-center flex-shrink-0`}
                            aria-label={myListItem?.current_page > 1 ? 'Continuar leitura' : 'Ler'}
                        >
                            <BookOpen size={14} />
                            <Tooltip label={myListItem?.current_page > 1 ? 'Continuar leitura' : 'Ler'} />
                        </button>
                        <button
                            onClick={e => onRemoveFromList(e, doc.id)}
                            disabled={actionLoading === doc.id}
                            className={`${iconTooltipClass} h-9 w-9 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 border border-red-200 transition disabled:opacity-50 flex items-center justify-center flex-shrink-0`}
                            aria-label="Remover da lista"
                        >
                            {actionLoading === doc.id
                                ? <div className="animate-spin h-3 w-3 border-b-2 border-red-600 rounded-full" />
                                : <Trash2 size={14} />}
                            <Tooltip label="Remover da lista" />
                        </button>
                    </>
                ) : (
                    <button
                        onClick={e => onAddToList(e, doc.id)}
                        disabled={actionLoading === doc.id}
                        className={`${iconTooltipClass} h-9 w-9 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-blue-400 flex items-center justify-center flex-shrink-0`}
                        aria-label="Adicionar aos meus livros"
                    >
                        {actionLoading === doc.id
                            ? <div className="animate-spin h-3 w-3 border-b-2 border-white rounded-full" />
                            : <Plus size={14} />}
                        <Tooltip label="Adicionar aos meus livros" />
                    </button>
                )}
            </div>
        </div>
    );
}
