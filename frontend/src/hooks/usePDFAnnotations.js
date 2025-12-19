import { useState, useEffect, useRef } from 'react';
import api from '../services/api';

export const usePDFAnnotations = (docId) => {
    const [bookmarks, setBookmarks] = useState([]);
    const [notes, setNotes] = useState({});
    const [highlights, setHighlights] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const saveTimeoutRef = useRef(null);

    // Carregar dados iniciais do banco de dados MySQL
    useEffect(() => {
        const load = async () => {
            try {
                const response = await api.get(`/documents/${docId}/annotations`);
                // Garante que o estado seja iniciado corretamente mesmo se o banco retornar vazio
                setBookmarks(response.data.bookmarks || []);
                setNotes(response.data.notes || {});
                setHighlights(response.data.highlights || {});
            } catch (err) {
                console.error("Erro ao carregar anotações", err);
            }
        };
        if (docId) load();
    }, [docId]);

    const sync = async (updated) => {
        setIsSaving(true);
        try {
            // Esta chamada envia o objeto JSON completo para o campo 'dados_json' no banco
            await api.post(`/documents/${docId}/annotations`, {
                bookmarks: updated.bookmarks ?? bookmarks,
                notes: updated.notes ?? notes,
                highlights: updated.highlights ?? highlights
            });
        } catch (err) {
            console.error("Erro ao sincronizar com o banco:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleBookmark = (page) => {
        const next = bookmarks.includes(page) ? bookmarks.filter(p => p !== page) : [...bookmarks, page];
        setBookmarks(next);
        sync({ bookmarks: next });
    };

    const updateNote = (page, text) => {
        const next = { ...notes, [page]: text };
        setNotes(next);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => sync({ notes: next }), 1500); // Debounce de 1.5s
    };

    const addHighlight = (page, highlight) => {
        const pageHighlights = highlights[page] || [];
        const next = { ...highlights, [page]: [...pageHighlights, highlight] };
        setHighlights(next);
        sync({ highlights: next });
    };

    const removeHighlight = (page, id) => {
        if (!window.confirm("Remover destaque?")) return;
        const next = { ...highlights, [page]: highlights[page].filter(h => h.id !== id) };
        setHighlights(next);
        sync({ highlights: next });
    };

    return { bookmarks, notes, highlights, isSaving, toggleBookmark, updateNote, addHighlight, removeHighlight };
};