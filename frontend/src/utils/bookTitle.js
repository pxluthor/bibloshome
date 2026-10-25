/**
 * Display-friendly book title: most titles are raw file names
 * ("Livro_Exemplo (Z-Library).pdf.pdf" -> "Livro Exemplo"). Display only; the stored title is untouched.
 */
export function cleanTitle(title) {
    if (typeof title !== 'string' || !title.trim()) return title;
    let clean = title.replace(/(\.(pdf|epub|mobi|djvu))+\s*$/i, '');
    clean = clean
        .replace(/\(\s*z-library\s*\)|\[\s*z-library\s*\]|\(\s*z-lib\.org\s*\)|\(\s*libgen[^)]*\)/gi, '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\s*-+\s*$/, '')
        .trim();
    return clean || title;
}
