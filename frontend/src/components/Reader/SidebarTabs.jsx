import React, { useState } from 'react';
import { Save, FileText, ChevronRight, Search } from 'lucide-react';

export const TranslationTab = ({ pageNumber, translation, loadingTranslation, handleTranslate }) => (
    <div className="flex flex-col h-full">
        <div className="mb-4 p-3 bg-blue-100 rounded-lg text-blue-800 text-sm">
            <p className="font-bold tracking-tight">Tradutor da Pág. {pageNumber}</p>
        </div>
        <div 
            className="flex-grow bg-white border border-gray-200 rounded-lg p-4 text-gray-900 prose prose-sm overflow-y-auto mb-4 shadow-sm"
            dangerouslySetInnerHTML={{ 
                __html: loadingTranslation ? 'Traduzindo...' : translation || '<i>Clique no botão para solicitar a tradução</i>' 
            }}
        />
        <button onClick={handleTranslate} className="py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 active:scale-95 transition-all">
            Traduzir Página
        </button>
    </div>
);

export const NotesTab = ({ pageNumber, notes, onNoteChange, isSaving, onNavigate }) => {
    const [subTab, setSubTab] = useState('current');
    const [searchTerm, setSearchTerm] = useState("");

    const filteredNotes = Object.entries(notes)
        .filter(([_, content]) => 
            content && 
            content.trim() !== "" && 
            content.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort(([a], [b]) => parseInt(a) - parseInt(b));

    return (
        <div className="flex flex-col h-full text-gray-800">
            <div className="flex gap-4 mb-4 border-b border-gray-200 flex-shrink-0">
                <button 
                    onClick={() => setSubTab('current')}
                    className={`pb-2 text-xs font-bold uppercase transition-all ${subTab === 'current' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Pág. {pageNumber}
                </button>
                <button 
                    onClick={() => setSubTab('general')}
                    className={`pb-2 text-xs font-bold uppercase transition-all ${subTab === 'general' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Notas Geral
                </button>
            </div>

            {subTab === 'current' ? (
                <div className="flex flex-col h-full min-h-0">
                    <div className="mb-2 flex justify-between items-center px-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Anotações</span>
                        {isSaving && <span className="text-[10px] text-green-600 flex items-center gap-1 font-semibold"><Save size={10}/> Salvando...</span>}
                    </div>
                    <textarea
                        value={notes[pageNumber] || ""}
                        onChange={(e) => onNoteChange(pageNumber, e.target.value)}
                        className="flex-grow w-full p-4 border border-gray-200 rounded-xl text-gray-900 bg-white resize-none outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
                        placeholder={`Suas notas para a pág. ${pageNumber}...`}
                    />
                </div>
            ) : (
                <div className="flex flex-col h-full min-h-0">
                    {/* BUSCA AJUSTADA PARA NÃO VAZAR */}
                    <div className="relative mb-4 px-1">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <Search className="text-gray-400" size={14} />
                        </div>
                        <input 
                            type="text"
                            placeholder="Buscar anotações..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-gray-200 rounded-full outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                        />
                    </div>

                    <div className="flex-grow overflow-y-auto space-y-3 px-1 custom-scrollbar">
                        {filteredNotes.length > 0 ? (
                            filteredNotes.map(([pNum, content]) => (
                                <div 
                                    key={pNum} 
                                    onClick={() => { onNavigate(parseInt(pNum)); setSubTab('current'); }}
                                    className="p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all group active:bg-blue-50"
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-bold text-blue-600 uppercase">Página {pNum}</span>
                                        <ChevronRight size={12} className="text-gray-300 group-hover:text-blue-500 transition-transform" />
                                    </div>
                                    <p className="text-xs text-gray-600 line-clamp-3 italic">"{content}"</p>
                                </div>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center h-40 text-center text-gray-400">
                                <FileText size={32} className="opacity-20 mb-2" />
                                <p className="text-xs">{searchTerm ? "Nenhum resultado encontrado." : "Nenhuma nota salva."}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};