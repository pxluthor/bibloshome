import React from 'react';
import { Save } from 'lucide-react';

export const TranslationTab = ({ pageNumber, translation, loadingTranslation, handleTranslate }) => (
    <div className="flex flex-col h-full">
        <div className="mb-4 p-3 bg-blue-100 rounded-lg text-blue-800 text-sm">
            <p className="font-bold">Tradutor da Pág. {pageNumber}</p>
        </div>
        <div 
            className="flex-grow bg-white border border-gray-200 rounded-lg p-4 text-gray-900 prose prose-sm overflow-y-auto mb-4"
            dangerouslySetInnerHTML={{ 
                __html: loadingTranslation ? 'Traduzindo...' : translation || '<i>Clique no botão para solicitar a tradução</i>' 
            }}
        />
        <button onClick={handleTranslate} className="py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">
            Traduzir Página
        </button>
    </div>
);

export const NotesTab = ({ pageNumber, note, onNoteChange, isSaving }) => (
    <div className="flex flex-col h-full">
        <div className="mb-2 flex justify-between items-center">
            <span className="text-xs font-bold text-gray-500 uppercase">Notas da Pág. {pageNumber}</span>
            {isSaving && <span className="text-xs text-green-600 flex items-center gap-1"><Save size={12}/> Salvando...</span>}
        </div>
        <textarea
            value={note || ""}
            onChange={(e) => onNoteChange(pageNumber, e.target.value)}
            className="flex-grow w-full p-4 border rounded-lg text-gray-900 bg-white resize-none outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Suas anotações..."
        />
    </div>
);