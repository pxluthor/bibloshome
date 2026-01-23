import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, ChevronDown, Bookmark, ShoppingBag, Settings, BookOpen, FileText } from 'lucide-react';

const UserMenu = ({ userName, isAdmin, pedidosPendentes = 0, adminPendentes = 0 }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);
    const navigate = useNavigate();

    // Fechar menu quando clicar fora
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login');
    };

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100 transition group"
            >
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                        {userName.charAt(0).toUpperCase()}
                    </div>
                    <span className="hidden md:block text-sm font-semibold text-gray-700">
                        {userName}
                    </span>
                </div>
                <ChevronDown 
                    size={16} 
                    className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
                />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50 animate-fade-in">
                    {/* Cabeçalho do menu */}
                    <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-semibold text-gray-900">{userName}</p>
                        <p className="text-xs text-gray-500">{isAdmin ? 'Administrador' : 'Usuário'}</p>
                    </div>

                    {/* Opções do menu */}
                    <div className="py-2">
                        <button
                            onClick={() => {
                                navigate('/');
                                setIsOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
                        >
                            <BookOpen size={18} className="text-gray-500" />
                            Acervo Completo
                        </button>

                        <button
                            onClick={() => {
                                navigate('/meus-pedidos');
                                setIsOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
                        >
                            <div className="relative">
                                <ShoppingBag size={18} className="text-gray-500" />
                                {pedidosPendentes > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                                        {pedidosPendentes}
                                    </span>
                                )}
                            </div>
                            Meus Pedidos
                        </button>

                        {isAdmin && (
                            <button
                                onClick={() => {
                                    navigate('/admin/pedidos');
                                    setIsOpen(false);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-purple-600 hover:bg-purple-50 transition"
                            >
                                <div className="relative">
                                    <Bookmark size={18} />
                                    {adminPendentes > 0 && (
                                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                                            {adminPendentes}
                                        </span>
                                    )}
                                </div>
                                Gerenciar Pedidos
                            </button>
                        )}

                        <button
                            onClick={() => {
                                setIsOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
                        >
                            <Settings size={18} className="text-gray-500" />
                            Configurações
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-gray-100 my-2"></div>

                    {/* Logout */}
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition"
                    >
                        <LogOut size={18} />
                        Sair
                    </button>
                </div>
            )}
        </div>
    );
};

export default UserMenu;
