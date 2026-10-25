import React from 'react';
import { CheckCircle, Loader2, Sparkles } from 'lucide-react';

// Confirmation the chat agent asks for before generating an artifact (gerar_artefato tool).
// state: 'pending' | 'running' | 'done' | 'cancelled' | 'error'
export default function ArtifactActionCard({ tipo, state, onConfirm, onCancel, onOpen }) {
    const label = tipo.replace(/_/g, ' ');
    return (
        <div className="mt-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5 text-sm" role="group" aria-label={`Gerar ${label}`}>
            {state === 'pending' && (
                <div className="flex flex-wrap items-center gap-2">
                    <Sparkles size={15} className="text-purple-600 flex-shrink-0" />
                    <span className="flex-1 min-w-[120px] text-gray-700">Gerar <strong>{label}</strong>?</span>
                    <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-xs font-semibold hover:bg-gray-50">
                        Cancelar
                    </button>
                    <button onClick={onConfirm} className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700">
                        Gerar
                    </button>
                </div>
            )}
            {state === 'running' && (
                <p className="flex items-center gap-2 text-gray-600"><Loader2 size={14} className="animate-spin" /> Gerando {label}…</p>
            )}
            {state === 'done' && (
                <p className="flex flex-wrap items-center gap-2 text-gray-700">
                    <CheckCircle size={14} className="text-green-600" /> {label} pronto e salvo.
                    {onOpen && <button onClick={onOpen} className="font-semibold text-purple-700 hover:underline">Abrir</button>}
                </p>
            )}
            {state === 'cancelled' && <p className="text-gray-500">Geração cancelada.</p>}
            {state === 'error' && <p className="text-red-600">Não foi possível gerar. Tente pela aba Artefatos.</p>}
        </div>
    );
}
