import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import api from '../services/api';

const EditBook = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    
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
        sinopse: ''
    });
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchBook = async () => {
            try {
                const response = await api.get(`/documents/${id}/details`);
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
                    sinopse: response.data.sinopse || ''
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

    const handleChange = (e) => {
        const { name, value } = e.target;
        setBook(prev => ({
            ...prev,
            [name]: value
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

            await api.put(`/documents/${id}/update`, updateData);
            alert('Livro atualizado com sucesso!');
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

                        {/* Gênero */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Gênero
                            </label>
                            <input
                                type="text"
                                name="genero"
                                value={book.genero}
                                onChange={handleChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Ex: Ficção, Romance"
                            />
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
