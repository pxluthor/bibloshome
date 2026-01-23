import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Clock, CheckCircle, XCircle, Search, Filter, User, Mail, Calendar, FileText, Check, X } from 'lucide-react';
import api from '../services/api';

const AdminPedidos = () => {
    const navigate = useNavigate();
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('todos');

    useEffect(() => {
        fetchPedidos();
    }, []);

    const fetchPedidos = async () => {
        try {
            setLoading(true);
            const response = await api.get('/pedidos');
            setPedidos(response.data);
        } catch (error) {
            if (error.response?.status === 403) {
                alert('Acesso negado. Apenas administradores podem acessar esta página.');
                navigate('/');
            } else {
                console.error('Erro ao buscar pedidos:', error);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (pedidoId, newStatus) => {
        if (!window.confirm(`Tem certeza que deseja alterar o status para "${newStatus}"?`)) return;

        setUpdating(pedidoId);
        try {
            await api.put(`/pedidos/${pedidoId}/status`, { status: newStatus });
            setPedidos(pedidos.map(p => 
                p.id === pedidoId 
                    ? { ...p, status: newStatus, data_atualizacao: new Date().toISOString() }
                    : p
            ));
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            alert('Erro ao atualizar status. Tente novamente.');
        } finally {
            setUpdating(null);
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
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const filteredPedidos = pedidos.filter(pedido => {
        const matchesSearch = 
            pedido.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
            pedido.autor.toLowerCase().includes(searchTerm.toLowerCase()) ||
            pedido.usuario_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
            pedido.usuario_email.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = statusFilter === 'todos' || pedido.status === statusFilter;
        
        return matchesSearch && matchesStatus;
    });

    const stats = {
        total: pedidos.length,
        pendente: pedidos.filter(p => p.status === 'pendente').length,
        em_analise: pedidos.filter(p => p.status === 'em_analise').length,
        aprovado: pedidos.filter(p => p.status === 'aprovado').length,
        recusado: pedidos.filter(p => p.status === 'recusado').length
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* HEADER */}
            <header className="bg-gradient-to-r from-purple-600 to-purple-700 shadow-sm sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/')}
                            className="flex items-center gap-2 text-white/80 hover:text-white transition"
                        >
                            <ArrowLeft size={20} />
                            <span className="text-sm font-medium">Voltar</span>
                        </button>
                        <div className="flex items-center gap-2">
                            <Shield size={24} className="text-white" />
                            <h1 className="text-xl font-bold text-white">Gerenciar Pedidos</h1>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                        <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                        <div className="text-sm text-gray-600">Total</div>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                        <div className="text-2xl font-bold text-blue-700">{stats.pendente}</div>
                        <div className="text-sm text-blue-600">Pendentes</div>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                        <div className="text-2xl font-bold text-yellow-700">{stats.em_analise}</div>
                        <div className="text-sm text-yellow-600">Em Análise</div>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                        <div className="text-2xl font-bold text-green-700">{stats.aprovado}</div>
                        <div className="text-sm text-green-600">Aprovados</div>
                    </div>
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                        <div className="text-2xl font-bold text-red-700">{stats.recusado}</div>
                        <div className="text-sm text-red-600">Recusados</div>
                    </div>
                </div>

                {/* Filtros e busca */}
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="flex-1 relative">
                        <Search size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por título, autor, usuário..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition"
                        />
                    </div>
                    <div className="relative">
                        <Filter size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="pl-12 pr-8 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition appearance-none bg-white"
                        >
                            <option value="todos">Todos os Status</option>
                            <option value="pendente">Pendente</option>
                            <option value="em_analise">Em Análise</option>
                            <option value="aprovado">Aprovado</option>
                            <option value="recusado">Recusado</option>
                        </select>
                    </div>
                </div>

                {/* Lista de pedidos */}
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                    </div>
                ) : filteredPedidos.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-24 text-center">
                        <Shield size={64} className="mx-auto text-gray-300 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            {searchTerm || statusFilter !== 'todos' ? 'Nenhum pedido encontrado' : 'Nenhum pedido'}
                        </h3>
                        <p className="text-gray-500">
                            {searchTerm || statusFilter !== 'todos' 
                                ? 'Tente ajustar seus filtros'
                                : 'Aguardando novos pedidos'}
                        </p>
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
                                            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                                                <div className="flex items-center gap-1.5">
                                                    <FileText size={16} className="text-purple-500" />
                                                    <span className="font-medium">{pedido.autor}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <FileText size={16} className="text-gray-400" />
                                                    <span>{pedido.editora}</span>
                                                </div>
                                            </div>
                                            
                                            {/* Informações do usuário */}
                                            <div className="flex flex-wrap items-center gap-4 text-sm bg-gray-50 rounded-lg p-3">
                                                <div className="flex items-center gap-1.5">
                                                    <User size={16} className="text-gray-500" />
                                                    <span className="font-medium">{pedido.usuario_nome}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Mail size={16} className="text-gray-400" />
                                                    <span>{pedido.usuario_email}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {getStatusBadge(pedido.status)}
                                    </div>

                                    {pedido.observacoes && (
                                        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                                            <p className="text-sm text-gray-700">
                                                <span className="font-semibold">Observações:</span> {pedido.observacoes}
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                        <div className="flex items-center gap-1.5 text-sm text-gray-500">
                                            <Calendar size={16} />
                                            <span>Solicitado em {formatDate(pedido.data_criacao)}</span>
                                        </div>
                                        
                                        {/* Ações do admin */}
                                        <div className="flex items-center gap-2">
                                            {pedido.status === 'pendente' && (
                                                <>
                                                    <button
                                                        onClick={() => handleUpdateStatus(pedido.id, 'em_analise')}
                                                        disabled={updating === pedido.id}
                                                        className="px-3 py-1.5 text-sm bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition disabled:opacity-50 flex items-center gap-1.5"
                                                    >
                                                        {updating === pedido.id ? (
                                                            <div className="animate-spin h-4 w-4 border-b-2 border-yellow-600 rounded-full"></div>
                                                        ) : (
                                                            <>
                                                                <Search size={14} />
                                                                Analisar
                                                            </>
                                                        )}
                                                    </button>
                                                </>
                                            )}
                                            
                                            {(pedido.status === 'pendente' || pedido.status === 'em_analise') && (
                                                <>
                                                    <button
                                                        onClick={() => handleUpdateStatus(pedido.id, 'aprovado')}
                                                        disabled={updating === pedido.id}
                                                        className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition disabled:opacity-50 flex items-center gap-1.5"
                                                    >
                                                        {updating === pedido.id ? (
                                                            <div className="animate-spin h-4 w-4 border-b-2 border-green-600 rounded-full"></div>
                                                        ) : (
                                                            <>
                                                                <Check size={14} />
                                                                Aprovar
                                                            </>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdateStatus(pedido.id, 'recusado')}
                                                        disabled={updating === pedido.id}
                                                        className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition disabled:opacity-50 flex items-center gap-1.5"
                                                    >
                                                        {updating === pedido.id ? (
                                                            <div className="animate-spin h-4 w-4 border-b-2 border-red-600 rounded-full"></div>
                                                        ) : (
                                                            <>
                                                                <X size={14} />
                                                                Recusar
                                                            </>
                                                        )}
                                                    </button>
                                                </>
                                            )}
                                        </div>
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

export default AdminPedidos;
