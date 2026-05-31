import React from 'react';
import { Filter, X, Folder, FolderOpen, Tag, ChevronDown } from 'lucide-react';
import { buildFolderTree } from '../utils/folderTree';

const PREDEFINED_GENRES = [
    'Historia', 'Literatura', 'Ciencia e Tecnologia', 'Ciencias Sociais',
    'Artes e Cultura', 'Religiao e Filosofia', 'Lifestyle', 'Educacao',
    'Saude e Medicina', 'Direito', 'Negocios',
];

/** Nó da árvore de pastas — controlado pelo pai via expanded/onToggle */
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
                    isSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100',
                ].join(' ')}
            >
                <span className="flex-shrink-0 cursor-pointer" onClick={() => hasChildren && onToggle(node.rel)}>
                    {hasChildren
                        ? (isOpen
                            ? <FolderOpen size={14} className="text-yellow-500" />
                            : <Folder size={14} className="text-yellow-500" />)
                        : <Folder size={14} className="text-gray-400" />}
                </span>
                <span className="truncate flex-1 cursor-pointer" onClick={() => onSelect(node.rel)}>
                    {node.nome}
                </span>
                {hasChildren && (
                    <button
                        onClick={e => { e.stopPropagation(); onToggle(node.rel); }}
                        className="ml-auto flex-shrink-0 p-0.5 rounded hover:bg-black/10"
                    >
                        <ChevronDown
                            size={12}
                            className={['transition-transform', isOpen ? 'rotate-180' : ''].join(' ')}
                        />
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

/**
 * Painel de filtros colapsável: chips ativos quando fechado, painel completo quando aberto.
 * Não renderiza nada durante o loading inicial.
 */
export default function FilterPanel({
    open,
    folders,
    selectedArea,
    onAreaChange,
    expandedFolders,
    onExpandToggle,
    availableGenres,
    availableTags,
    selectedGenre,
    onGenreChange,
    selectedTag,
    onTagChange,
    viewMode,
    loading,
}) {
    if (loading) return null;

    const activeCount =
        (selectedGenre ? 1 : 0) +
        (selectedTag ? 1 : 0) +
        (selectedArea ? 1 : 0);

    const genreList = Array.from(new Set([...PREDEFINED_GENRES, ...availableGenres]));

    return (
        <div className="mb-5">
            {/* Chips dos filtros ativos quando painel está fechado */}
            {!open && activeCount > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    {selectedGenre && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                            {selectedGenre}
                            <button onClick={() => onGenreChange(null)} className="hover:text-blue-900">
                                <X size={10} />
                            </button>
                        </span>
                    )}
                    {selectedTag && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                            #{selectedTag}
                            <button onClick={() => onTagChange(null)} className="hover:text-blue-900">
                                <X size={10} />
                            </button>
                        </span>
                    )}
                    {selectedArea && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                            <Folder size={10} />
                            {selectedArea.split(' / ').pop()}
                            <button onClick={() => onAreaChange('')} className="hover:text-blue-900">
                                <X size={10} />
                            </button>
                        </span>
                    )}
                    <button
                        onClick={() => { onGenreChange(null); onTagChange(null); onAreaChange(''); }}
                        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                    >
                        <X size={11} /> Limpar tudo
                    </button>
                </div>
            )}

            {/* Painel expansível */}
            {open && (
                <div className="border border-gray-200 rounded-xl bg-white p-4 space-y-4">
                    {/* Pasta — só no Acervo quando há pastas */}
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
                                        selectedArea === '' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100',
                                    ].join(' ')}
                                    onClick={() => onAreaChange('')}
                                >
                                    <FolderOpen size={14} className="text-yellow-500" />
                                    <span>Todos os livros</span>
                                </div>
                                {buildFolderTree(folders.filter(f => f.rel !== '')).map(node => (
                                    <FolderNode
                                        key={node.rel}
                                        node={node}
                                        selectedArea={selectedArea}
                                        onSelect={onAreaChange}
                                        expanded={expandedFolders}
                                        onToggle={onExpandToggle}
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
                                onClick={() => onGenreChange(null)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                    selectedGenre === null
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                                }`}
                            >
                                Todos
                            </button>
                            {genreList.map(genre => (
                                <button
                                    key={genre}
                                    onClick={() => onGenreChange(genre)}
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
                                    onClick={() => onTagChange(null)}
                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                        selectedTag === null
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                                    }`}
                                >
                                    Todos
                                </button>
                                {availableTags.map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => onTagChange(tag)}
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
}
