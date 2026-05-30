import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library, BookOpen, BarChart2, CheckCircle, Clock, Bookmark, Image, ArrowLeft } from 'lucide-react';
import api from '../services/api';
import UserMenu from './UserMenu';

// Barra horizontal simples em CSS
function HBar({ label, value, max, color = 'bg-blue-500' }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-32 truncate flex-shrink-0" title={label}>{label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                    className={`h-2.5 rounded-full transition-all duration-700 ${color}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-xs font-semibold text-gray-700 w-10 text-right flex-shrink-0">{value}</span>
        </div>
    );
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-blue-600', bg = 'bg-blue-50' }) {
    return (
        <div className={`rounded-xl border bg-white p-5 flex items-start gap-4`}>
            <div className={`p-2.5 rounded-lg ${bg} flex-shrink-0`}>
                <Icon size={20} className={color} />
            </div>
            <div className="min-w-0">
                <p className="text-2xl font-bold text-gray-900">{value?.toLocaleString('pt-BR') ?? '—'}</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
                {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

export default function Statistics() {
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const [statsRes, userRes] = await Promise.all([
                    api.get('/stats'),
                    api.get('/auth/verify'),
                ]);
                setStats(statsRes.data);
                setUserName(userRes.data.user?.nome || '');
                setIsAdmin(userRes.data.user?.is_admin || false);
            } catch {
                navigate('/login');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const maxArea = stats ? Math.max(...stats.biblioteca.por_area.map(a => a.total), 1) : 1;
    const maxGenero = stats ? Math.max(...stats.biblioteca.por_genero.map(g => g.total), 1) : 1;
    const progPct = stats?.usuario.paginas_total > 0
        ? Math.round((stats.usuario.paginas_lidas / stats.usuario.paginas_total) * 100)
        : 0;

    const areaColors = [
        'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
        'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-orange-500',
        'bg-teal-500', 'bg-pink-500',
    ];

    return (
        <div className="min-h-screen bg-gray-50 font-sans pb-16">
            {/* Header */}
            <header className="bg-white shadow-sm sticky top-0 z-20">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            onClick={() => navigate('/')}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition flex-shrink-0"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div className="bg-blue-600 text-white p-1.5 rounded-lg flex-shrink-0">
                            <BarChart2 size={18} />
                        </div>
                        <h1 className="text-base sm:text-lg font-bold text-gray-900 truncate">Estatísticas</h1>
                    </div>
                    <UserMenu userName={userName} isAdmin={isAdmin} />
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                    </div>
                ) : !stats ? (
                    <p className="text-center text-gray-500 mt-20">Erro ao carregar estatísticas.</p>
                ) : (
                    <>
                        {/* Cards de resumo da biblioteca */}
                        <section>
                            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Biblioteca</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <StatCard
                                    icon={Library}
                                    label="Total de livros"
                                    value={stats.biblioteca.total_livros}
                                    color="text-blue-600" bg="bg-blue-50"
                                />
                                <StatCard
                                    icon={Image}
                                    label="Com capa"
                                    value={stats.biblioteca.total_com_capa}
                                    sub={`${Math.round((stats.biblioteca.total_com_capa / stats.biblioteca.total_livros) * 100)}% do acervo`}
                                    color="text-emerald-600" bg="bg-emerald-50"
                                />
                                <StatCard
                                    icon={Bookmark}
                                    label="Na minha lista"
                                    value={stats.usuario.total_lista}
                                    color="text-violet-600" bg="bg-violet-50"
                                />
                                <StatCard
                                    icon={CheckCircle}
                                    label="Lidos"
                                    value={stats.usuario.lido}
                                    sub={`${stats.usuario.lendo} lendo agora`}
                                    color="text-amber-600" bg="bg-amber-50"
                                />
                            </div>
                        </section>

                        {/* Progresso do usuário */}
                        <section>
                            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Meu Progresso</h2>
                            <div className="bg-white border rounded-xl p-5 space-y-4">
                                {/* Status pills */}
                                <div className="flex gap-3 flex-wrap">
                                    {[
                                        { label: 'Quero ler', value: stats.usuario.quero_ler, color: 'bg-gray-100 text-gray-600' },
                                        { label: 'Lendo', value: stats.usuario.lendo, color: 'bg-blue-100 text-blue-700' },
                                        { label: 'Lido', value: stats.usuario.lido, color: 'bg-emerald-100 text-emerald-700' },
                                    ].map(s => (
                                        <div key={s.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${s.color}`}>
                                            <span>{s.value}</span>
                                            <span>{s.label}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Barra de páginas lidas */}
                                {stats.usuario.paginas_total > 0 && (
                                    <div>
                                        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                                            <span className="flex items-center gap-1"><BookOpen size={11} /> Páginas lidas</span>
                                            <span className="font-semibold text-gray-700">{stats.usuario.paginas_lidas.toLocaleString('pt-BR')} / {stats.usuario.paginas_total.toLocaleString('pt-BR')} ({progPct}%)</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                            <div
                                                className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-700"
                                                style={{ width: `${progPct}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Gráficos lado a lado */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Por Área */}
                            <section>
                                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Por Área</h2>
                                <div className="bg-white border rounded-xl p-5 space-y-3">
                                    {stats.biblioteca.por_area.length === 0 ? (
                                        <p className="text-sm text-gray-400">Sem dados</p>
                                    ) : stats.biblioteca.por_area.map((a, i) => (
                                        <HBar
                                            key={a.area}
                                            label={a.area}
                                            value={a.total}
                                            max={maxArea}
                                            color={areaColors[i % areaColors.length]}
                                        />
                                    ))}
                                </div>
                            </section>

                            {/* Por Gênero */}
                            <section>
                                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Por Gênero</h2>
                                <div className="bg-white border rounded-xl p-5 space-y-3">
                                    {stats.biblioteca.por_genero.length === 0 ? (
                                        <p className="text-sm text-gray-400">Sem dados de gênero</p>
                                    ) : stats.biblioteca.por_genero.map((g, i) => (
                                        <HBar
                                            key={g.genero}
                                            label={g.genero}
                                            value={g.total}
                                            max={maxGenero}
                                            color={areaColors[(i + 3) % areaColors.length]}
                                        />
                                    ))}
                                </div>
                            </section>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
