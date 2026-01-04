import { useState, useEffect, useCallback } from 'react';

export const useSidebarResizer = (initialWidth = 400) => {
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('biblos_sidebar_width');
        return saved ? parseInt(saved, 10) : initialWidth;
    });
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = useCallback((e) => {
        // Suporta Mouse e Touch
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
        localStorage.setItem('biblos_sidebar_width', sidebarWidth.toString());
    }, [sidebarWidth]);

    const resize = useCallback((e) => {
        if (isResizing) {
            // Pega a posição X independente se for Mouse ou Touch
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const newWidth = window.innerWidth - clientX;
            
            if (newWidth > 200 && newWidth < window.innerWidth - 100) {
                setSidebarWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            // Eventos de Mouse
            window.addEventListener("mousemove", resize);
            window.addEventListener("mouseup", stopResizing);
            // Eventos de Touch
            window.addEventListener("touchmove", resize);
            window.addEventListener("touchend", stopResizing);
        } else {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
            window.removeEventListener("touchmove", resize);
            window.removeEventListener("touchend", stopResizing);
        }
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
            window.removeEventListener("touchmove", resize);
            window.removeEventListener("touchend", stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    return { sidebarWidth, isResizing, startResizing };
};