import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingBag, Clock, CheckCircle, XCircle, Search, Trash2, Calendar, FileText, Plus, X } from 'lucide-react';
import api from '../services/api';

const MeusPedidos = () => {
    const navigate = useNavigate();
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalError, setModalError] = useState('');
    const [showToast, setShowToast] = useState(false);
    const [newPedido, setNewPedido] = useState({
        titulo: '',
        autor: '',
        editora: '',
        observacoes: ''
    });

    useEffect(() => {
        fetchPedidos();
    }, []);

    const fetchPedidos = async () => {
        try {
            setLoading(true);
            const response = await api.get('/pedidos/meus');
            setPedidos(response.data);
        } catch (error) {
            console.error('Erro ao buscar pedidos:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (pedidoId) => {
        if (!window.confirm('Tem certeza que deseja cancelar este pedido?')) return;

        setDeleting(pedidoId);
        try {
            await api.delete(`/pedidos/${pedidoId}`);
            setPedidos(pedidos.filter(p => p.id !== pedidoId));
        } catch (error) {
            console.error('Erro ao cancelar pedido:', error);
            alert('Erro ao cancelar pedido. Tente novamente.');
        } finally {
            setDeleting(null);
        }
    };

    const handleCreatePedido = async (e) => {
        e.preventDefault();
        
        if (!newPedido.titulo.trim() || !newPedido.autor.trim() || !newPedido.editora.trim()) {
            setModalError('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        setModalLoading(true);
        setModalError('');

        try {
            await api.post('/pedidos', newPedido);
            setShowModal(false);
            setNewPedido({ titulo: '', autor: '', editora: '', observacoes: '' });
            
            // Mostra toast e recarrega pedidos
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
            
            fetchPedidos();
        } catch (err) {
            console.error('Erro ao criar pedido:', err);
            setModalError('Erro ao criar pedido. Tente novamente.');
        } finally {
            setModalLoading(false);
        }
    };

    const getStatusBadge = (status) => {
        const statusConfig = {
            pendente: {
                color: 'bg-blue-100 text-blue-700 border-blue-200',
                icon: <Clock size={16} />,
                label: 'Pendente'
            },
            em_analise: {
                color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
                icon: <Search size={16} />,
                label: 'Em Análise'
            },
            aprovado: {
                color: 'bg-green-100 text-green-700 border-green-200',
                icon: <CheckCircle size={16} />,
                label: 'Aprovado'
            },
            recusado: {
                color: 'bg-red-100 text-red-700 border-red-200',
                icon: <XCircle size={16} />,
                label: 'Recusado'
            }
        };

        const config = statusConfig[status] || statusConfig.pendente;
        return (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${config.color}`}>
                {config.icon}
                {config.label}
            </span>
        );
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const filteredPedidos = pedidos.filter(pedido =>
        pedido.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pedido.autor.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const pendentesCount = pedidos.filter(p => p.status === 'pendente').length;

    // Modal de criar pedido
    if (showModal) {
        return (
            <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
                <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 w-full animate-fade-in">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">Novo Pedido</h2>
                        <button
                            onClick={() => setShowModal(false)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition"
                        >
                            <X size={24} className="text-gray-500" />
                        </button>
                    </div>

                    {modalError && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-700 text-sm text-center">{modalError}</p>
                        </div>
                    )}

                    <form onSubmit={handleCreatePedido} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Título do Livro <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={newPedido.titulo}
                                onChange={(e) => setNewPedido({...newPedido, titulo: e.target.value})}
                                placeholder="Ex: Dom Casmurro"
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                disabled={modalLoading}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Autor <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={newPedido.autor}
                                onChange={(e) => setNewPedido({...newPedido, autor: e.target.value})}
                                placeholder="Ex: Machado de Assis"
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                disabled={modalLoading}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Editora <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={newPedido.editora}
                                onChange={(e) => setNewPedido({...newPedido, editora: e.target.value})}
                                placeholder="Ex: Editora Nova Fronteira"
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                disabled={modalLoading}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Observações
                            </label>
                            <textarea
                                value={newPedido.observacoes}
                                onChange={(e) => setNewPedido({...newPedido, observacoes: e.target.value})}
                                placeholder="Informações adicionais (opcional)"
                                rows={3}
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                disabled={modalLoading}
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                disabled={modalLoading}
                                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={modalLoading}
                                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition disabled:bg-blue-400"
                            >
                                {modalLoading ? 'Enviando...' : 'Enviar Pedido'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

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
                        <p className="text-gray-600">
                            Seu pedido foi enviado com sucesso e será analisado pelos administradores.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* HEADER */}
            <header className="bg-white shadow-sm sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/')}
                            className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition"
                        >
                            <ArrowLeft size={20} />
                            <span className="text-sm font-medium">Voltar</span>
                        </button>
                        <div className="flex items-center gap-2">
                            <ShoppingBag size={24} className="text-blue-600" />
                            <h1 className="text-xl font-bold text-gray-900">Meus Pedidos</h1>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition shadow-md"
                    >
                        <Plus size={20} />
                        Novo Pedido
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                        <div className="text-2xl font-bold text-gray-900">{pedidos.length}</div>
                        <div className="text-sm text-gray-600">Total de Pedidos</div>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                        <div className="text-2xl font-bold text-blue-700">{pendentesCount}</div>
                        <div className="text-sm text-blue-600">Pendentes</div>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                        <div className="text-2xl font-bold text-green-700">
                            {pedidos.filter(p => p.status === 'aprovado').length}
                        </div>
                        <div className="text-sm text-green-600">Aprovados</div>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                        <div className="text-2xl font-bold text-yellow-700">
                            {pedidos.filter(p => p.status === 'em_analise').length}
                        </div>
                        <div className="text-sm text-yellow-600">Em Análise</div>
                    </div>
                </div>

                {/* Busca */}
                <div className="mb-6">
                    <div className="relative">
                        <Search size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por título ou autor..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                        />
                    </div>
                </div>

                {/* Lista de pedidos */}
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                ) : filteredPedidos.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-24 text-center">
                        <ShoppingBag size={64} className="mx-auto text-gray-300 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            {searchTerm ? 'Nenhum pedido encontrado' : 'Nenhum pedido ainda'}
                        </h3>
                        <p className="text-gray-500 mb-6">
                            {searchTerm 
                                ? 'Tente ajustar sua busca'
                                : 'Faça seu primeiro pedido de livro'}
                        </p>
                        {!searchTerm && (
                            <button
                                onClick={() => setShowModal(true)}
                                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
                            >
                                Fazer Pedido
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredPedidos.map((pedido) => (
                            <div
                                key={pedido.id}
                                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition"
                            >
                                <div className="p-6">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1">
                                            <h3 className="text-lg font-bold text-gray-900 mb-2">
                                                {pedido.titulo}
                                            </h3>
                                            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                                                <div className="flex items-center gap-1.5">
                                                    <ShoppingBag size={16} className="text-blue-500" />
                                                    <span className="font-medium">{pedido.autor}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <FileText size={16} className="text-gray-400" />
                                                    <span>{pedido.editora}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {getStatusBadge(pedido.status)}
                                    </div>

                                    {pedido.observacoes && (
                                        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                            <p className="text-sm text-gray-600">{pedido.observacoes}</p>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                        <div className="flex items-center gap-1.5 text-sm text-gray-500">
                                            <Calendar size={16} />
                                            <span>Solicitado em {formatDate(pedido.data_criacao)}</span>
                                        </div>
                                        {pedido.status === 'pendente' && (
                                            <button
                                                onClick={() => handleDelete(pedido.id)}
                                                disabled={deleting === pedido.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                                            >
                                                {deleting === pedido.id ? (
                                                    <div className="animate-spin h-4 w-4 border-b-2 border-red-600 rounded-full"></div>
                                                ) : (
                                                    <>
                                                        <Trash2 size={16} />
                                                        Cancelar
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default MeusPedidos;
