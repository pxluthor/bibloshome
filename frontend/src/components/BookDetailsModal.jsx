import React from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Calendar, Tag, Folder } from 'lucide-react';

/**
 * Modal de detalhes/sinopse de um livro — renderizado via portal.
 */
export default function BookDetailsModal({ doc, onClose, onRead, apiBaseUrl }) {
    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Cabeçalho: capa + metadados */}
                <div className="flex gap-4 p-5">
                    <img
                        src={`${apiBaseUrl}/documents/${doc.id}/cover`}
                        alt={doc.titulo}
                        className="w-24 h-36 object-cover rounded-lg shadow-md flex-shrink-0"
                        onError={e => { e.target.style.display = 'none'; }}
                    />
                    <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-gray-900 text-base leading-tight mb-1">{doc.titulo}</h2>
                        {doc.autor && <p className="text-sm text-gray-600 mb-1">{doc.autor}</p>}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {doc.ano && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">
                                    <Calendar size={10} />{doc.ano}
                                </span>
                            )}
                            {doc.genero && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">
                                    <Tag size={10} />{doc.genero}
                                </span>
                            )}
                            {doc.area && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs">
                                    <Folder size={10} />{doc.area.split(' / ').pop()}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sinopse */}
                {doc.sinopse && (
                    <div className="px-5 pb-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sinopse</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{doc.sinopse}</p>
                    </div>
                )}

                {/* Ações */}
                <div className="flex gap-2 px-5 pb-5">
                    <button
                        onClick={() => { onRead(doc.id); onClose(); }}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
                    >
                        <BookOpen size={15} /> Ler
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
