import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, ChevronDown, X, Sparkles } from 'lucide-react';
import api from '../services/api';
import { toast } from '../utils/toast';

const PREDEFINED_GENRES = [
    'Historia', 'Literatura', 'Ciencia e Tecnologia', 'Ciencias Sociais',
    'Artes e Cultura', 'Religiao e Filosofia', 'Lifestyle', 'Educacao',
    'Saude e Medicina', 'Direito', 'Negocios'
];

const EditBook = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const genreDropdownRef = useRef(null);
    
    const [book, setBook] = useState({
        titulo: '',
        autor: '',
        area: '',
        caminho: '',
        editora: '',
        ano: '',
        paginas: '',
        genero: '',
        idioma: '',
        sinopse: '',
        tags: []
    });
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [autoFilling, setAutoFilling] = useState(false);
    const [autoFillSource, setAutoFillSource] = useState(null);
    const [error, setError] = useState('');
    const [availableGenres, setAvailableGenres] = useState([]);
    const [availableTags, setAvailableTags] = useState([]);
    const [genreInput, setGenreInput] = useState('');
    const [tagInput, setTagInput] = useState('');
    const [showGenreDropdown, setShowGenreDropdown] = useState(false);

    useEffect(() => {
        const fetchBook = async () => {
            try {
                const [response, genresResponse, tagsResponse] = await Promise.all([
                    api.get(`/documents/${id}/details`),
                    api.get('/documents/genres'),
                    api.get('/documents/tags')
                ]);
                setAvailableGenres(genresResponse.data || []);
                setAvailableTags(tagsResponse.data || []);
                setBook({
                    titulo: response.data.titulo || '',
                    autor: response.data.autor || '',
                    area: response.data.area || '',
                    caminho: response.data.caminho || '',
                    editora: response.data.editora || '',
                    ano: response.data.ano || '',
                    paginas: response.data.paginas || '',
                    genero: response.data.genero || '',
                    idioma: response.data.idioma || '',
                    sinopse: response.data.sinopse || '',
                    tags: response.data.tags || []
                });
            } catch (err) {
                setError('Erro ao carregar dados do livro. Verifique se você tem permissão de administrador.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchBook();
    }, [id]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (genreDropdownRef.current && !genreDropdownRef.current.contains(event.target)) {
                setShowGenreDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const genreOptions = Array.from(new Set([...PREDEFINED_GENRES, ...availableGenres]));
    const tagSuggestions = availableTags.filter(tag =>
        tag.toLowerCase().includes(tagInput.toLowerCase()) && !book.tags.includes(tag)
    );

    const handleAutoFill = async () => {
        setAutoFilling(true);
        setAutoFillSource(null);
        setError('');
        try {
            const response = await api.post(`/documents/${id}/auto-metadata`);
            const meta = response.data;
            setBook(prev => ({
                ...prev,
                titulo:  meta.titulo  || prev.titulo,
                autor:   meta.autor   || prev.autor,
                editora: meta.editora || prev.editora,
                ano:     meta.ano     ? String(meta.ano)     : prev.ano,
                paginas: meta.paginas ? String(meta.paginas) : prev.paginas,
                idioma:  meta.idioma  || prev.idioma,
                sinopse: meta.sinopse || prev.sinopse,
                genero:  meta.genero  || prev.genero,
                tags:    meta.tags?.length ? meta.tags : prev.tags,
            }));
            setAutoFillSource(meta.fonte || 'IA');
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(detail || 'Erro ao buscar metadados com IA.');
        } finally {
            setAutoFilling(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setBook(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleAddTag = (tag) => {
        const trimmedTag = tag.trim();
        if (!trimmedTag || book.tags.includes(trimmedTag)) return;

        setBook(prev => ({
            ...prev,
            tags: [...prev.tags, trimmedTag]
        }));
        if (!availableTags.includes(trimmedTag)) {
            setAvailableTags(prev => [...prev, trimmedTag]);
        }
        setTagInput('');
    };

    const handleRemoveTag = (tagToRemove) => {
        setBook(prev => ({
            ...prev,
            tags: prev.tags.filter(tag => tag !== tagToRemove)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');

        try {
            const updateData = {};
            // Inclui apenas campos que foram modificados
            if (book.titulo !== undefined) updateData.titulo = book.titulo || null;
            if (book.autor !== undefined) updateData.autor = book.autor || null;
            if (book.area !== undefined) updateData.area = book.area || null;
            if (book.caminho !== undefined) updateData.caminho = book.caminho || null;
            if (book.editora !== undefined) updateData.editora = book.editora || null;
            if (book.ano !== undefined) updateData.ano = book.ano ? parseInt(book.ano) : null;
            if (book.paginas !== undefined) updateData.paginas = book.paginas ? parseInt(book.paginas) : null;
            if (book.genero !== undefined) updateData.genero = book.genero || null;
            if (book.idioma !== undefined) updateData.idioma = book.idioma || null;
            if (book.sinopse !== undefined) updateData.sinopse = book.sinopse || null;
            updateData.tags = book.tags;

            await api.put(`/documents/${id}/update`, updateData);
            toast.success('Livro atualizado com sucesso!');
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.detail || 'Erro ao atualizar livro. Tente novamente.');
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex items-center gap-3 text-gray-600">
                    <Loader2 className="animate-spin h-6 w-6" />
                    <span>Carregando...</span>
                </div>
            </div>
        );
    }

    if (error && !book.titulo) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md text-center">
                    <p className="text-red-700">{error}</p>
                    <button 
                        onClick={() => navigate('/')}
                        className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                        Voltar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4">
                {/* Header */}
                <div className="mb-6 flex items-center gap-4">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition"
                    >
                        <ArrowLeft size={20} />
                        Voltar
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900">Editar Livro</h1>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                    {error && (
                        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-red-700">{error}</p>
                        </div>
                    )}

                    {/* BOTÃO AUTO-PREENCHER */}
                    <div className="mb-6 flex items-center gap-3 p-4 bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-xl">
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-violet-800">Preencher com IA</p>
                            <p className="text-xs text-violet-600 mt-0.5">Busca metadados automaticamente no Google Books usando a chave OpenAI configurada</p>
                        </div>
                        {autoFillSource && (
                            <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded-full font-medium flex-shrink-0">
                                ✓ Preenchido via {autoFillSource}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={handleAutoFill}
                            disabled={autoFilling}
                            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition flex-shrink-0"
                        >
                            {autoFilling ? (
                                <><Loader2 size={15} className="animate-spin" /> Buscando...</>
                            ) : (
                                <><Sparkles size={15} /> Preencher</>
                            )}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Título */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Título *
                            </label>
                            <input
                                type="text"
                                name="titulo"
                                value={book.titulo}
                                onChange={handleChange}
                                required
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Digite o título do livro"
                            />
                        </div>

                        {/* Autor */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Autor *
                            </label>
                            <input
                                type="text"
                                name="autor"
                                value={book.autor}
                                onChange={handleChange}
                                required
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Nome do autor"
                            />
                        </div>

                        {/* Editora */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Editora
                            </label>
                            <input
                                type="text"
                                name="editora"
                                value={book.editora}
                                onChange={handleChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Nome da editora"
                            />
                        </div>

                        {/* Ano */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Ano
                            </label>
                            <input
                                type="number"
                                name="ano"
                                value={book.ano}
                                onChange={handleChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Ex: 2024"
                            />
                        </div>

                        {/* Páginas */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Páginas
                            </label>
                            <input
                                type="number"
                                name="paginas"
                                value={book.paginas}
                                onChange={handleChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Ex: 250"
                            />
                        </div>

                        {/* Genero */}
                        <div ref={genreDropdownRef} className="relative">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Genero
                            </label>
                            <button
                                type="button"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-left flex items-center justify-between bg-white"
                                onClick={() => setShowGenreDropdown(prev => !prev)}
                            >
                                <span className={book.genero ? 'text-gray-900' : 'text-gray-400'}>
                                    {book.genero || 'Selecione um genero'}
                                </span>
                                <ChevronDown size={18} className="text-gray-500" />
                            </button>
                            {showGenreDropdown && (
                                <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto mt-1">
                                    {genreOptions.map(g => (
                                        <button
                                            key={g}
                                            type="button"
                                            onClick={() => {
                                                setBook(prev => ({ ...prev, genero: g }));
                                                setShowGenreDropdown(false);
                                            }}
                                            className={`w-full text-left px-4 py-2 text-sm ${
                                                book.genero === g
                                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                                    : 'hover:bg-gray-50 text-gray-700'
                                            }`}
                                        >
                                            {g}
                                        </button>
                                    ))}
                                    <hr className="border-gray-100 mx-2" />
                                    <div className="px-3 py-2">
                                        <input
                                            type="text"
                                            value={genreInput}
                                            onChange={(e) => setGenreInput(e.target.value)}
                                            placeholder="Criar novo genero..."
                                            className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && genreInput.trim()) {
                                                    e.preventDefault();
                                                    const newGenre = genreInput.trim();
                                                    setBook(prev => ({ ...prev, genero: newGenre }));
                                                    if (!availableGenres.includes(newGenre)) {
                                                        setAvailableGenres(prev => [...prev, newGenre]);
                                                    }
                                                    setGenreInput('');
                                                    setShowGenreDropdown(false);
                                                }
                                            }}
                                        />
                                    </div>
                                    {book.genero && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setBook(prev => ({ ...prev, genero: '' }));
                                                setShowGenreDropdown(false);
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
                                        >
                                            Limpar selecao
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Tags */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Tags
                                <span className="block text-gray-500 text-xs mt-1 font-normal">
                                    Clique para adicionar, X para remover
                                </span>
                            </label>
                            {book.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {book.tags.map(tag => (
                                        <span
                                            key={tag}
                                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                                        >
                                            {tag}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveTag(tag)}
                                                className="hover:text-blue-950"
                                            >
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="relative">
                                <input
                                    type="text"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    placeholder="Adicionar tag..."
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    onFocus={() => setTagInput(prev => prev)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && tagInput.trim()) {
                                            e.preventDefault();
                                            handleAddTag(tagInput);
                                        }
                                    }}
                                />
                                {tagInput.length >= 1 && tagSuggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                                        {tagSuggestions.map(tag => (
                                            <button
                                                key={tag}
                                                type="button"
                                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700"
                                                onClick={() => handleAddTag(tag)}
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Idioma */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Idioma
                            </label>
                            <input
                                type="text"
                                name="idioma"
                                value={book.idioma}
                                onChange={handleChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Ex: Português, Inglês"
                            />
                        </div>

                        {/* Área */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Área
                            </label>
                            <input
                                type="text"
                                name="area"
                                value={book.area}
                                onChange={handleChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Ex: Ciências, História"
                            />
                        </div>

                        {/* Caminho do arquivo */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Caminho do Arquivo
                            </label>
                            <input
                                type="text"
                                name="caminho"
                                value={book.caminho}
                                onChange={handleChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Ex: livros/meu-livro.pdf"
                            />
                        </div>

                        {/* Sinopse */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Sinopse
                            </label>
                            <textarea
                                name="sinopse"
                                value={book.sinopse}
                                onChange={handleChange}
                                rows={6}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                placeholder="Digite a sinopse do livro..."
                            />
                        </div>
                    </div>

                    {/* Botões */}
                    <div className="mt-8 flex justify-end gap-4">
                        <button
                            type="button"
                            onClick={() => navigate('/')}
                            className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-50"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="animate-spin h-5 w-5" />
                                    Salvando...
                                </>
                            ) : (
                                <>
                                    <Save size={20} />
                                    Salvar Alterações
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditBook;
