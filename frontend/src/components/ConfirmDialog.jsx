import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

// In-app replacement for window.confirm: `if (!(await confirmDialog('…'))) return;`
// <ConfirmHost /> is mounted once in App.jsx (same pattern as the Toaster).
let openDialog = null;

export function confirmDialog(message, { title = 'Confirmar ação', confirmLabel = 'Confirmar', danger = true } = {}) {
    if (!openDialog) return Promise.resolve(window.confirm(message)); // host not mounted (should not happen)
    return new Promise((resolve) => openDialog({ message, title, confirmLabel, danger, resolve }));
}

export function ConfirmHost() {
    const [dialog, setDialog] = useState(null);
    const cancelRef = useRef(null);

    useEffect(() => {
        openDialog = setDialog;
        return () => { openDialog = null; };
    }, []);

    const close = (result) => {
        dialog?.resolve(result);
        setDialog(null);
    };

    useEffect(() => {
        if (!dialog) return;
        cancelRef.current?.focus(); // destructive actions: safe default is "Cancelar"
        const onKey = (e) => { if (e.key === 'Escape') close(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [dialog]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!dialog) return null;

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => close(false)}>
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby="confirm-message"
                className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-3">
                    {dialog.danger && (
                        <span className="flex-shrink-0 grid place-items-center w-10 h-10 rounded-full bg-red-50 text-red-600">
                            <AlertTriangle size={20} />
                        </span>
                    )}
                    <div className="min-w-0">
                        <h3 id="confirm-title" className="text-base font-bold text-gray-900">{dialog.title}</h3>
                        <p id="confirm-message" className="mt-1 text-sm text-gray-600 break-words">{dialog.message}</p>
                    </div>
                </div>
                <div className="mt-6 flex gap-3">
                    <button
                        ref={cancelRef}
                        onClick={() => close(false)}
                        className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => close(true)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition ${dialog.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {dialog.confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
