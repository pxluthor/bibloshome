import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, User, Building2, FileText, Send, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';

const CriarPedido = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        titulo: '',
        autor: '',
        editora: '',
        observacoes: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [showToast, setShowToast] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validação básica
        if (!formData.titulo.trim() || !formData.autor.trim() || !formData.editora.trim()) {
            setError('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess(false);

        try {
            await api.post('/pedidos', formData);
            
            // Mostra toast e redireciona imediatamente
            setShowToast(true);
            setTimeout(() => {
                setShowToast(false);
                navigate('/');
            }, 3000);
        } catch (err) {
            console.error('Erro ao criar pedido:', err);
            setError('Erro ao criar pedido. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    // Toast de sucesso
    if (showToast) {
        return (
            <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
                <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 animate-fade-in">
                    <div className="flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle size={32} className="text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Pedido Enviado!</h2>
                        <p className="text-gray-600 mb-4">
                            Seu pedido foi enviado com sucesso e será analisado pelos administradores.
                        </p>
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                            <AlertCircle size={16} />
                            <span>Redirecionando para o acervo...</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* HEADER */}
            <header className="bg-white shadow-sm sticky top-0 z-20">
                <div className="max-w-4xl mx-auto px-4 h-20 flex items-center">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition mr-4"
                    >
                        <ArrowLeft size={20} />
                        <span className="text-sm font-medium">Voltar</span>
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">Fazer Pedido de Livro</h1>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Cabeçalho do formulário */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-3 rounded-lg">
                                <BookOpen size={32} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">Solicitar Livro</h2>
                                <p className="text-blue-100 text-sm">Preencha os dados do livro que deseja</p>
                            </div>
                        </div>
                    </div>

                    {/* Formulário */}
                    <div className="p-8">
                        {success && (
                            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                                <p className="text-green-700 font-medium text-center">
                                    ✓ Pedido enviado com sucesso! Redirecionando...
                                </p>
                            </div>
                        )}

                        {error && (
                            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                                <p className="text-red-700 font-medium text-center">{error}</p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Título */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Título do Livro <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <BookOpen size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        name="titulo"
                                        value={formData.titulo}
                                        onChange={handleChange}
                                        placeholder="Ex: Dom Casmurro"
                                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            {/* Autor */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Autor <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <User size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        name="autor"
                                        value={formData.autor}
                                        onChange={handleChange}
                                        placeholder="Ex: Machado de Assis"
                                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            {/* Editora */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Editora <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <Building2 size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        name="editora"
                                        value={formData.editora}
                                        onChange={handleChange}
                                        placeholder="Ex: Editora Nova Fronteira"
                                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            {/* Observações */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Observações
                                </label>
                                <div className="relative">
                                    <FileText size={20} className="absolute left-4 top-4 text-gray-400" />
                                    <textarea
                                        name="observacoes"
                                        value={formData.observacoes}
                                        onChange={handleChange}
                                        placeholder="Adicione informações adicionais sobre o pedido (opcional)"
                                        rows={4}
                                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none"
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            {/* Botões */}
                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => navigate('/')}
                                    disabled={loading}
                                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition disabled:bg-blue-400 shadow-md"
                                >
                                    {loading ? (
                                        <>
                                            <div className="animate-spin h-5 w-5 border-b-2 border-white rounded-full"></div>
                                            Enviando...
                                        </>
                                    ) : (
                                        <>
                                            <Send size={20} />
                                            Enviar Pedido
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Informações adicionais */}
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-6">
                    <h3 className="font-semibold text-blue-900 mb-2">ℹ️ Sobre o processo</h3>
                    <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Seu pedido será analisado pelos administradores</li>
                        <li>• Você poderá acompanhar o status em "Meus Pedidos"</li>
                        <li>• Pedidos pendentes podem ser cancelados</li>
                        <li>• A biblioteca entrará em contato em caso de aprovação</li>
                    </ul>
                </div>
            </main>
        </div>
    );
};

export default CriarPedido;
