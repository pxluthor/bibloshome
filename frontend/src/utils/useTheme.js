import { useEffect, useState } from 'react';
import { getTheme, setTheme as persistTheme } from './theme';

// Current theme plus a setter; stays in sync between the sidebar and the mobile menu.
export function useTheme() {
    const [theme, setThemeState] = useState(getTheme);
    useEffect(() => {
        const onChange = (e) => setThemeState(e.detail);
        window.addEventListener('themechange', onChange);
        return () => window.removeEventListener('themechange', onChange);
    }, []);
    return [theme, persistTheme];
}
