import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Library, PanelLeft, Clock, Bookmark, FolderPlus, BarChart2, ShoppingBag,
    ClipboardList, Database, Settings, LogOut, Moon, Sun,
} from 'lucide-react';
import { useTheme } from '../utils/useTheme';

const STORAGE_KEY = 'sidebar-collapsed';
const ROW = 48; // nav row height in px; the sliding indicator moves in steps of this

/**
 * Desktop-only (lg+) floating sidebar. Sets --sidebar-w on <html> and the
 * `has-sidebar` class on <body> so index.css can offset the page content.
 */
export default function AppSidebar({ userName, isAdmin, pedidosPendentes = 0, adminPendentes = 0, counts = {} }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [theme, setTheme] = useTheme();
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
    });

    useEffect(() => {
        document.documentElement.style.setProperty('--sidebar-w', collapsed ? '76px' : '272px');
        document.body.classList.add('has-sidebar');
        try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch {}
    }, [collapsed]);

    useEffect(() => () => document.body.classList.remove('has-sidebar'), []);

    const items = [
        { path: '/acervo', label: 'Acervo Completo', icon: Library },
        { path: '/recentes', label: 'Recentes', icon: Clock },
        { path: '/meus-livros', label: 'Meus Livros', icon: Bookmark, badge: counts.meusLivros },
        { path: '/colecoes', label: 'Coleções', icon: FolderPlus, badge: counts.colecoes },
        { path: '/estatisticas', label: 'Estatísticas', icon: BarChart2 },
        { path: '/meus-pedidos', label: 'Meus Pedidos', icon: ShoppingBag, badge: pedidosPendentes, alert: true },
        ...(isAdmin ? [
            { path: '/admin/pedidos', label: 'Gerenciar Pedidos', icon: ClipboardList, badge: adminPendentes, alert: true },
            { path: '/admin/bd', label: 'Admin BD', icon: Database },
        ] : []),
        { path: '/configuracoes', label: 'Configurações', icon: Settings },
    ];
    const activeIndex = items.findIndex((item) => pathname.startsWith(item.path));

    const logout = () => {
        localStorage.clear();
        navigate('/login');
    };

    // Tooltip is position:fixed so it escapes the sidebar's overflow clipping
    const [tip, setTip] = useState(null);
    const showTip = (e, text) => {
        if (!collapsed) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setTip({ text, top: rect.top + rect.height / 2, left: rect.right + 14 });
    };
    const hideTip = () => setTip(null);
    useEffect(() => { if (!collapsed) setTip(null); }, [collapsed]);

    const label = `transition-opacity duration-200 whitespace-nowrap ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`;

    return (
        <aside
            className="hidden lg:flex fixed top-6 bottom-6 left-6 z-30 flex-col rounded-3xl bg-white shadow-[0_8px_30px_rgb(31_26_74/0.08)] border border-gray-100 overflow-hidden transition-[width] duration-300 ease-out"
            style={{ width: 'var(--sidebar-w, 272px)' }}
            aria-label="Navegação principal"
        >
            {/* Brand + collapse */}
            <div className="relative flex items-center h-[72px] px-5 flex-shrink-0">
                <button
                    type="button"
                    onClick={() => navigate('/acervo')}
                    className={`flex items-center gap-2.5 min-w-0 ${label}`}
                    tabIndex={collapsed ? -1 : 0}
                >
                    <span className="bg-blue-600 text-white p-2 rounded-xl flex-shrink-0"><Library size={20} /></span>
                    <span className="text-lg font-bold tracking-tight text-gray-900">
                        Library<span className="text-green-600">Anywhere</span>
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => setCollapsed((c) => !c)}
                    aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
                    aria-expanded={!collapsed}
                    className={`absolute top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-all duration-300 ${collapsed ? 'right-[18px]' : 'right-4'}`}
                >
                    <PanelLeft size={20} />
                </button>
            </div>

            <hr className="mx-5 border-gray-100" />

            {/* Profile */}
            <div className="flex items-center gap-3 px-4 py-4 flex-shrink-0">
                <span className="w-11 h-11 rounded-full bg-blue-600 text-white grid place-items-center font-bold text-base flex-shrink-0 ring-[3px] ring-white shadow-[0_6px_16px_rgb(31_26_74/0.16)]">
                    {(userName || '?').charAt(0).toUpperCase()}
                </span>
                <span className={`min-w-0 ${label}`}>
                    <span className="block text-sm font-semibold text-gray-900 truncate">{userName}</span>
                    <span className="block text-xs text-gray-400">{isAdmin ? 'Administrador' : 'Leitor'}</span>
                </span>
            </div>

            {/* Nav with sliding indicator */}
            <nav className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none]">
                <ul className="relative">
                    {activeIndex >= 0 && (
                        <li
                            aria-hidden="true"
                            className="absolute inset-x-0 top-0 bg-blue-50 transition-transform duration-[380ms] [transition-timing-function:cubic-bezier(0.34,1.16,0.42,1)] after:absolute after:right-0 after:top-1/2 after:-translate-y-1/2 after:w-2 after:h-4 after:rounded-l-xl after:bg-blue-600"
                            style={{ height: ROW, transform: `translateY(${activeIndex * ROW}px)` }}
                        />
                    )}
                    {items.map((item, index) => {
                        const Icon = item.icon;
                        const active = index === activeIndex;
                        return (
                            <li key={item.path} className="relative">
                                <button
                                    type="button"
                                    onClick={() => navigate(item.path)}
                                    aria-current={active ? 'page' : undefined}
                                    aria-label={collapsed ? item.label : undefined}
                                    onMouseEnter={(e) => showTip(e, item.label)}
                                    onMouseLeave={hideTip}
                                    onFocus={(e) => showTip(e, item.label)}
                                    onBlur={hideTip}
                                    className={`group relative w-full flex items-center gap-4 px-[26px] text-sm font-medium transition-colors ${active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-800'}`}
                                    style={{ height: ROW }}
                                >
                                    <span className="relative flex-shrink-0">
                                        <Icon size={22} strokeWidth={2} />
                                        {collapsed && item.badge > 0 && (
                                            <span className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-white ${item.alert ? 'bg-red-500' : 'bg-blue-600'}`}>
                                                {item.badge}
                                            </span>
                                        )}
                                    </span>
                                    <span className={`flex-1 text-left ${label}`}>{item.label}</span>
                                    {!collapsed && item.badge > 0 && (
                                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full leading-none text-white ${item.alert ? 'bg-red-500' : 'bg-blue-600'}`}>
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            <hr className="mx-5 border-gray-100" />
            <button
                type="button"
                role="switch"
                aria-checked={theme === 'dark'}
                aria-label="Modo escuro"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                onMouseEnter={(e) => showTip(e, 'Modo escuro')}
                onMouseLeave={hideTip}
                className="flex items-center gap-4 px-[26px] text-sm font-medium text-gray-400 hover:text-gray-800 transition-colors flex-shrink-0"
                style={{ height: ROW }}
            >
                {theme === 'dark' ? <Sun size={22} className="flex-shrink-0" /> : <Moon size={22} className="flex-shrink-0" />}
                <span className={`flex-1 text-left ${label}`}>Modo escuro</span>
                <span
                    aria-hidden="true"
                    className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${theme === 'dark' ? 'bg-blue-600' : 'bg-gray-200'} ${collapsed ? 'hidden' : ''}`}
                >
                    <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${theme === 'dark' ? 'translate-x-5' : ''}`} />
                </span>
            </button>
            <button
                type="button"
                onClick={logout}
                aria-label={collapsed ? 'Sair' : undefined}
                onMouseEnter={(e) => showTip(e, 'Sair')}
                onMouseLeave={hideTip}
                className="flex items-center gap-4 px-[26px] text-sm font-medium text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                style={{ height: 56 }}
            >
                <LogOut size={22} className="flex-shrink-0" />
                <span className={label}>Sair</span>
            </button>

            {tip && (
                <span
                    role="tooltip"
                    className="pointer-events-none fixed z-50 -translate-y-1/2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap shadow-lg"
                    style={{ top: tip.top, left: tip.left }}
                >
                    {tip.text}
                </span>
            )}
        </aside>
    );
}
