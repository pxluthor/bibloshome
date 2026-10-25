import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bug, Lightbulb, Loader2, MessageSquarePlus, Send } from 'lucide-react';
import api from '../services/api';
import { toast } from '../utils/toast';
import AppHeader from './AppHeader';

const TIPOS = {
    bug: { label: 'Bug', icon: Bug, badge: 'bg-red-100 text-red-700' },
    melhoria: { label: 'Melhoria', icon: Lightbulb, badge: 'bg-amber-100 text-amber-800' },
};
const STATUS = {
    aberto: { label: 'Aberto', badge: 'bg-blue-100 text-blue-700' },
    em_analise: { label: 'Em análise', badge: 'bg-purple-100 text-purple-700' },
    resolvido: { label: 'Resolvido', badge: 'bg-green-100 text-green-700' },
    descartado: { label: 'Descartado', badge: 'bg-gray-100 text-gray-600' },
};
const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500';
const formatDate = (iso) => new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// Admin-only editor for one item: status + reply
const AdminReply = ({ item, onSaved }) => {
    const [status, setStatus] = useState(item.status);
    const [resposta, setResposta] = useState(item.resposta || '');
    const [saving, setSaving] = useState(false);
    const dirty = status !== item.status || resposta !== (item.resposta || '');

    const save = async () => {
        setSaving(true);
        try {
            const { data } = await api.patch(`/feedback/${item.id}`, { status, resposta });
            onSaved({ ...item, ...data });
            toast.success('Feedback atualizado.');
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`status-${item.id}`} className="text-xs font-semibold text-gray-600">Status</label>
                <select id={`status-${item.id}`} value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm">
                    {Object.entries(STATUS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
                </select>
            </div>
            <textarea
                value={resposta}
                onChange={(e) => setResposta(e.target.value)}
                rows={2}
                placeholder="Resposta para o usuário (opcional)"
                aria-label="Resposta para o usuário"
                className={inputClass}
            />
            <button onClick={save} disabled={!dirty || saving} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving && <Loader2 size={12} className="animate-spin" />} Salvar
            </button>
        </div>
    );
};

export default function FeedbackPage() {
    const location = useLocation();
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    const userName = localStorage.getItem('userName') || 'Estudante';
    const [form, setForm] = useState({ tipo: 'bug', titulo: '', descricao: '' });
    const [sending, setSending] = useState(false);
    const [items, setItems] = useState(null);
    const [filtro, setFiltro] = useState(isAdmin ? 'pendentes' : 'todos');

    useEffect(() => {
        api.get('/feedback')
            .then((r) => setItems(r.data))
            .catch(() => { setItems([]); toast.error('Não foi possível carregar os feedbacks.'); });
    }, []);

    const submit = async (e) => {
        e.preventDefault();
        setSending(true);
        try {
            const { data } = await api.post('/feedback', { ...form, pagina: location.state?.from || null });
            setItems((prev) => [data, ...(prev || [])]);
            setForm({ tipo: form.tipo, titulo: '', descricao: '' });
            toast.success('Obrigado! Seu feedback foi enviado.');
        } catch (err) {
            toast.error(err.response?.data?.detail?.[0]?.msg || err.response?.data?.detail || 'Erro ao enviar.');
        } finally {
            setSending(false);
        }
    };

    const visible = (items || []).filter((i) => filtro === 'todos' || ['aberto', 'em_analise'].includes(i.status));

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <AppHeader userName={userName} isAdmin={isAdmin} />
            <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <MessageSquarePlus className="text-blue-600" size={26} /> Feedback
                </h1>

                <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
                    <p className="text-sm text-gray-600">Encontrou um problema ou tem uma ideia? Conte pra gente.</p>
                    <div className="flex gap-2" role="radiogroup" aria-label="Tipo de feedback">
                        {Object.entries(TIPOS).map(([key, t]) => {
                            const Icon = t.icon;
                            const active = form.tipo === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => setForm({ ...form, tipo: key })}
                                    className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <Icon size={16} /> {t.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="fb-titulo" className="block text-sm font-semibold text-gray-800">Título</label>
                        <input id="fb-titulo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                            required minLength={3} maxLength={200} className={inputClass}
                            placeholder={form.tipo === 'bug' ? 'Ex.: o botão de voltar não funciona no leitor' : 'Ex.: poder exportar as anotações'} />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="fb-descricao" className="block text-sm font-semibold text-gray-800">
                            {form.tipo === 'bug' ? 'O que aconteceu? Como reproduzir?' : 'Descreva a ideia'}
                        </label>
                        <textarea id="fb-descricao" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                            required minLength={5} maxLength={5000} rows={5} className={inputClass} />
                    </div>
                    {location.state?.from && <p className="text-xs text-gray-400">Tela de origem: {location.state.from}</p>}
                    <button type="submit" disabled={sending} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar
                    </button>
                </form>

                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-bold text-gray-900">{isAdmin ? 'Feedbacks recebidos' : 'Meus envios'}</h2>
                        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm">
                            <option value="pendentes">Pendentes</option>
                            <option value="todos">Todos</option>
                        </select>
                    </div>
                    {items === null ? (
                        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-600" size={28} /></div>
                    ) : visible.length === 0 ? (
                        <p className="text-sm text-gray-500 py-6 text-center">Nada por aqui.</p>
                    ) : visible.map((item) => {
                        const tipo = TIPOS[item.tipo] || TIPOS.bug;
                        const status = STATUS[item.status] || STATUS.aberto;
                        return (
                            <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className={`font-semibold px-2 py-0.5 rounded-full ${tipo.badge}`}>{tipo.label}</span>
                                    <span className={`font-semibold px-2 py-0.5 rounded-full ${status.badge}`}>{status.label}</span>
                                    <span className="text-gray-400">{formatDate(item.criado_em)}</span>
                                    {item.autor_nome && <span className="text-gray-500">· {item.autor_nome} ({item.autor_email})</span>}
                                </div>
                                <h3 className="mt-2 font-semibold text-gray-900 break-words">{item.titulo}</h3>
                                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap break-words">{item.descricao}</p>
                                {item.pagina && <p className="mt-1 text-xs text-gray-400">Tela: {item.pagina}</p>}
                                {item.resposta && !isAdmin && (
                                    <p className="mt-3 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-900 whitespace-pre-wrap">
                                        <strong>Resposta:</strong> {item.resposta}
                                    </p>
                                )}
                                {isAdmin && (
                                    <AdminReply item={item} onSaved={(updated) => setItems((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)))} />
                                )}
                            </article>
                        );
                    })}
                </section>
            </main>
        </div>
    );
}
