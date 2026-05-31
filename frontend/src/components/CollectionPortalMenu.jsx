import React from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus } from 'lucide-react';

/**
 * Menu dropdown de coleções — renderizado via portal para escapar de overflow-hidden.
 */
export default function CollectionPortalMenu({
    docId,
    pos,
    collections,
    collectionName,
    collectionLoading,
    onClose,
    onAddToCollection,
    onCreateCollection,
    onNameChange,
}) {
    return createPortal(
        <>
            {/* Backdrop invisível — fecha ao clicar fora */}
            <div className="fixed inset-0 z-[9998]" onClick={onClose} />

            <div
                className="fixed z-[9999] w-72 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-left"
                style={{ top: pos.top, left: pos.left }}
                onClick={e => e.stopPropagation()}
            >
                <div className="text-sm font-semibold text-gray-900 mb-2">Adicionar a coleção</div>

                {/* Lista de coleções existentes */}
                <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
                    {collections.length === 0 ? (
                        <p className="text-xs text-gray-500 py-2">Nenhuma coleção criada.</p>
                    ) : (
                        collections.map(collection => {
                            const alreadyAdded = collection.book_ids?.includes(docId);
                            return (
                                <button
                                    key={collection.id}
                                    onClick={e => onAddToCollection(e, collection.id, docId)}
                                    disabled={alreadyAdded || collectionLoading === `${collection.id}-${docId}`}
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

                {/* Criar nova coleção */}
                <div className="border-t border-gray-100 pt-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nova coleção</label>
                    <div className="flex gap-2">
                        <input
                            value={collectionName}
                            onChange={e => onNameChange(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') onCreateCollection(e, docId); }}
                            className="min-w-0 flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-violet-500 outline-none"
                            placeholder="Nome"
                            autoFocus
                        />
                        <button
                            onClick={e => onCreateCollection(e, docId)}
                            disabled={!collectionName.trim() || collectionLoading === `new-${docId}`}
                            className="px-3 py-1.5 bg-violet-600 text-white rounded-md text-sm font-medium hover:bg-violet-700 disabled:bg-violet-300"
                        >
                            Criar
                        </button>
                    </div>
                </div>
            </div>
        </>,
        document.body
    );
}
