// Light/dark theme: class "dark" on <html>, styles in theme-dark.css.
// The same logic runs inline in index.html before first paint to avoid a white flash.
const KEY = 'theme';

export function getTheme() {
    try {
        const saved = localStorage.getItem(KEY);
        if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f131a' : '#2563eb');
}

export function setTheme(theme) {
    try { localStorage.setItem(KEY, theme); } catch {}
    applyTheme(theme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}
