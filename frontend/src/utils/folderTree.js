/**
 * Constrói uma árvore de pastas a partir de uma lista plana.
 * @param {Array} items  - Array de { rel, depth, nome }
 * @param {string} separator - Separador de path (default ' / ' para DocumentList, '/' para AdminBd)
 * @returns {Array} Árvore com children
 */
export function buildFolderTree(items, separator = ' / ') {
    const map = {};
    const roots = [];
    items.forEach(item => {
        map[item.rel] = { ...item, children: [] };
    });
    items.forEach(item => {
        if (!item.rel) return;
        const lastSlash = item.rel.lastIndexOf(separator);
        const parentRel = lastSlash >= 0 ? item.rel.substring(0, lastSlash) : '';
        if (parentRel && map[parentRel]) {
            map[parentRel].children.push(map[item.rel]);
        } else {
            roots.push(map[item.rel]);
        }
    });
    return roots;
}
