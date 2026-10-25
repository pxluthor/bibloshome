// Back buttons: return to the screen the user came from (keeping its state, e.g. the
// Acervo scroll), falling back to a fixed route when the page was opened directly.
export function goBack(navigate, fallback = '/acervo') {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback, { replace: true });
}

// After an expired session, send the user back to the screen they were on.
const RETURN_KEY = 'returnTo';

export function rememberReturnPath() {
    const path = window.location.pathname + window.location.search;
    if (path.startsWith('/') && !path.startsWith('/login') && !path.startsWith('/register') && !path.startsWith('/redefinir-senha')) {
        try { sessionStorage.setItem(RETURN_KEY, path); } catch {}
    }
}

export function takeReturnPath(fallback = '/') {
    let path = null;
    try {
        path = sessionStorage.getItem(RETURN_KEY);
        sessionStorage.removeItem(RETURN_KEY);
    } catch {}
    // Only same-app paths (no "//host" open redirects)
    return path && path.startsWith('/') && !path.startsWith('//') ? path : fallback;
}
