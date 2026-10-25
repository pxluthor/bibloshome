import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Library } from 'lucide-react';
import UserMenu from './UserMenu';
import AppSidebar from './AppSidebar';

/**
 * Header compartilhado entre DocumentList, Collections, Statistics, AdminBd.
 * Desktop (lg+): sidebar flutuante; mobile/tablet: barra de topo.
 */
export default function AppHeader({
    userName,
    isAdmin,
    pedidosPendentes = 0,
    adminPendentes = 0,
    counts,
}) {
    const navigate = useNavigate();

    return (
        <>
        <AppSidebar
            userName={userName}
            isAdmin={isAdmin}
            pedidosPendentes={pedidosPendentes}
            adminPendentes={adminPendentes}
            counts={counts}
        />
        <header className="bg-white shadow-sm sticky top-0 z-20 lg:hidden">
            <div className="max-w-7xl mx-auto px-4 h-16 sm:h-20 flex items-center justify-between gap-2">
                <div
                    className="flex items-center gap-2 min-w-0 cursor-pointer"
                    onClick={() => navigate('/')}
                >
                    <div className="bg-blue-600 text-white p-1.5 sm:p-2 rounded-lg flex-shrink-0">
                        <Library size={20} />
                    </div>
                    <h1 className="text-base sm:text-xl font-bold tracking-tight truncate">
                        Library<span className="text-green-600">Anywhere</span>
                    </h1>
                </div>
                <UserMenu
                    userName={userName}
                    isAdmin={isAdmin}
                    pedidosPendentes={pedidosPendentes}
                    adminPendentes={adminPendentes}
                />
            </div>
        </header>
        </>
    );
}
