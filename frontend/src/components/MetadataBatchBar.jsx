import React, { useEffect, useRef, useState } from 'react';
import { Database, Loader2, Pause, Play } from 'lucide-react';
import api from '../services/api';

// Provisional admin control for the metadata batch (/admin/metadata-batch); full panel lives in Admin BD.
export default function MetadataBatchBar() {
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const timer = useRef(null);

    const refresh = () => api.get('/admin/metadata-batch/status')
        .then((r) => { setStatus(r.data); return r.data; })
        .catch(() => null);

    useEffect(() => {
        refresh();
        return () => clearInterval(timer.current);
    }, []);

    // Poll only while a batch is running
    useEffect(() => {
        clearInterval(timer.current);
        if (status?.running) timer.current = setInterval(refresh, 4000);
    }, [status?.running]);

    const start = async () => {
        setBusy(true);
        setError('');
        try {
            await api.post('/admin/metadata-batch/start');
            await refresh();
        } catch (e) {
            setError(e.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };

    const stop = async () => {
        setBusy(true);
        try {
            await api.post('/admin/metadata-batch/stop');
            await refresh();
        } finally {
            setBusy(false);
        }
    };

    const running = status?.running;
    const pct = status?.total ? Math.round((status.processed / status.total) * 100) : 0;

    return (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
            <Database size={16} className="text-blue-600 flex-shrink-0" />
            <span className="font-semibold text-gray-800">Metadados em lote</span>

            {running ? (
                <>
                    <div className="flex-1 min-w-[140px] h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-gray-600">
                        {status.processed}/{status.total} · {status.updated} atualizados
                    </span>
                    <button
                        onClick={stop}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                        <Pause size={14} /> Pausar
                    </button>
                </>
            ) : (
                <>
                    <span className="flex-1 min-w-[160px] text-gray-500 truncate">
                        {status?.finished_at
                            ? `Último: ${status.processed} processados · ${status.updated} atualizados · ${status.failed} falhas`
                            : 'Preenche autor, gênero, tags e sinopse dos livros sem autor (Google Books).'}
                    </span>
                    <button
                        onClick={start}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                        {status?.finished_at ? 'Continuar lote' : 'Iniciar lote'}
                    </button>
                </>
            )}

            {(error || (!running && status?.paused_reason)) && (
                <p className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800" role="status">
                    {error || status.paused_reason}
                </p>
            )}
        </div>
    );
}
