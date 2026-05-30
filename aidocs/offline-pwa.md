# Offline PWA — Download de livros para leitura offline

## Status atual (implementado)

O PWA está configurado com `vite-plugin-pwa` e cobre:
- **Precache**: app shell (JS/CSS/HTML/ícones) — app abre offline
- **Runtime cache**: capas dos livros visitados (`CacheFirst`, 7 dias, max 500 entradas)

O que **não funciona** offline: lista de livros, conteúdo dos PDFs/EPUBs, autenticação.

---

## Objetivo

Permitir que o usuário baixe livros específicos para ler sem internet.
Fluxo esperado:
1. Usuário toca "⬇ Baixar" no card do livro
2. PDF/EPUB é baixado e salvo no IndexedDB do browser
3. Na seção "Disponível offline" (aba ou filtro), livros baixados aparecem mesmo sem conexão
4. Service worker intercepta a requisição do arquivo e serve do cache local

---

## Arquitetura proposta

### Frontend

**Estado global de downloads** (`useOfflineStore` — Zustand ou Context)
```js
{
  downloads: Map<livroId, { status: 'downloading'|'done'|'error', progress: 0-100, size }>,
  offlineIds: Set<livroId>,
}
```

**IndexedDB** (via `idb` lib) — banco `libraryoffline`, store `books`:
```
key: livroId (number)
value: { id, titulo, caminho_ext (.pdf|.epub), blob: ArrayBuffer, savedAt }
```

**Componente `DownloadButton`** — substitui o botão de download, mostra progresso circular.

**Aba "Offline"** em DocumentList (ao lado de Acervo / Meus Livros) — lista livros do IndexedDB, funciona 100% offline.

**`handleRead` atualizado**:
```js
const handleRead = async (docId) => {
  const offline = await getOfflineBook(docId); // lê IndexedDB
  if (offline) {
    const url = URL.createObjectURL(new Blob([offline.blob]));
    navigate(`/document/${docId}?src=${encodeURIComponent(url)}`);
    return;
  }
  // fallback online normal
  navigate(isEpub ? `/epub/${docId}` : `/document/${docId}`);
};
```

### Backend

Nenhuma mudança necessária. O download usa o endpoint existente:
- PDF: `GET /documents/{id}/file`
- EPUB: `GET /documents/{id}/epub`

### Service Worker (vite.config.js)

Adicionar handler para interceptar requests a blobs offline:
```js
// Já coberto pelo navigateFallback — nenhuma mudança necessária para blobs locais
// Os blobs são criados no frontend com URL.createObjectURL()
```

---

## Implementação passo a passo

### 1. Instalar dependências
```bash
npm install idb  # wrapper IndexedDB tipado
```

### 2. Criar `src/services/offlineStorage.js`
```js
import { openDB } from 'idb';

const DB_NAME = 'libraryoffline';
const STORE = 'books';

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) { db.createObjectStore(STORE); }
  });
}

export async function saveOfflineBook(id, titulo, ext, arrayBuffer) {
  const db = await getDb();
  await db.put(STORE, { id, titulo, ext, blob: arrayBuffer, savedAt: Date.now() }, id);
}

export async function getOfflineBook(id) {
  const db = await getDb();
  return db.get(STORE, id);
}

export async function deleteOfflineBook(id) {
  const db = await getDb();
  return db.delete(STORE, id);
}

export async function listOfflineBooks() {
  const db = await getDb();
  return db.getAll(STORE);
}
```

### 3. Criar `src/components/DownloadButton.jsx`
- Botão com ícone `Download` / `CheckCircle` / spinner de progresso
- Usa `fetch` com `ReadableStream` para mostrar % de download
- Ao completar, chama `saveOfflineBook()`
- Botão secundário para deletar do cache

### 4. Adicionar aba "Offline" em DocumentList
```jsx
// Nova tab junto com Acervo / Meus Livros
<button onClick={() => setViewMode('offline')}>
  <WifiOff size={15} />
  <span className="hidden sm:inline">Offline</span>
</button>
```

No modo `offline`:
- Carrega livros via `listOfflineBooks()` (sem API)
- Não tem busca server-side, filtra client-side
- Mostra badge de tamanho (ex: "12 MB")

### 5. Atualizar `handleRead` para usar blob local (ver acima)

### 6. PDFReader e EpubReader — aceitar `?src=` como URL do arquivo
```jsx
// PDFReader.jsx
const searchParams = new URLSearchParams(location.search);
const src = searchParams.get('src') || `${api.defaults.baseURL}/documents/${id}/file`;
```

---

## Estimativas

| Etapa | Tempo |
|-------|-------|
| offlineStorage.js | 30 min |
| DownloadButton | 1h |
| Aba Offline em DocumentList | 1h |
| handleRead + PDFReader + EpubReader | 1h |
| Testes + ajustes | 30 min |
| **Total** | **~4h** |

---

## Limitações conhecidas

- **Espaço**: PDFs grandes (100MB+) podem exceder quota do browser. Avisar usuário antes de baixar.
- **iOS Safari**: IndexedDB funciona mas tem quota menor (~50MB por origem). Implementar aviso de espaço.
- **Atualização**: livro atualizado no servidor não reflete no cache — botão "Re-baixar" seria necessário.
- **Sincronização de progresso**: offline o progresso é salvo localmente via anotações existentes e sincronizado quando voltar online (já funciona — as anotações são salvas na API).

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `frontend/src/services/offlineStorage.js` | CRIAR |
| `frontend/src/components/DownloadButton.jsx` | CRIAR |
| `frontend/src/components/DocumentList.jsx` | MODIFICAR — aba offline, handleRead |
| `frontend/src/components/PDFReader.jsx` | MODIFICAR — aceitar `?src=` |
| `frontend/src/components/EpubReader.jsx` | MODIFICAR — aceitar `?src=` |
| `frontend/package.json` | MODIFICAR — adicionar `idb` |
