import asyncio
import logging
import os
from typing import Awaitable, Callable, Optional

# ChromaDB requires SQLite >= 3.35 — override with pysqlite3-binary on python:slim images
try:
    __import__('pysqlite3')
    import sys
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
except ImportError:
    pass

import chromadb
import fitz  # PyMuPDF
import httpx

from ai.providers import OllamaProvider, get_provider

logger = logging.getLogger(__name__)

CHROMA_DIR = os.getenv("CHROMA_DIR", "/data/chromadb")
EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
EMBED_PROVIDER = os.getenv("EMBED_PROVIDER", "ollama")
OPENAI_API_KEY_GLOBAL = os.getenv("OPENAI_API_KEY", "")
# Embeddings run on the dedicated `ollama` container; chat via Ollama keeps OLLAMA_BASE_URL
OLLAMA_EMBED_URL = os.getenv("OLLAMA_EMBED_URL") or os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")

COLLECTION = "livros"            # one collection for every book; filtered by livro_id metadata
CHUNK_CHARS = 1200               # ~300 tokens: precise retrieval, fits nomic-embed-text easily
CHUNK_OVERLAP = 200              # keeps sentences cut at a boundary retrievable from both sides
MIN_PAGE_CHARS = 20
EMBED_BATCH = 16
EMBED_RETRIES = 3
# EPUB has no fixed pages: lay it out with constant dimensions so page numbers are stable
EPUB_LAYOUT = {"width": 500, "height": 700, "fontsize": 11}

_embed_ollama = OllamaProvider()
_embed_ollama.base_url = OLLAMA_EMBED_URL
_index_lock = asyncio.Semaphore(1)  # index one book at a time: the embedder is single-threaded on CPU
_model_ready = False


class NoTextError(ValueError):
    """Book without extractable text (scanned images): needs OCR."""


def embed_model_id() -> str:
    if EMBED_PROVIDER == "openai" and OPENAI_API_KEY_GLOBAL:
        return "openai:text-embedding-3-small"
    return f"ollama:{EMBED_MODEL}"


def get_chroma_client() -> chromadb.PersistentClient:
    return chromadb.PersistentClient(path=CHROMA_DIR)


def _collection():
    """The shared collection; refuses to mix vectors from different embedding models."""
    col = get_chroma_client().get_or_create_collection(
        COLLECTION,
        embedding_function=None,
        metadata={"embed_model": embed_model_id(), "hnsw:space": "cosine"},
    )
    stored = (col.metadata or {}).get("embed_model")
    if stored and stored != embed_model_id():
        raise RuntimeError(
            f"Índice criado com '{stored}', mas o modelo atual é '{embed_model_id()}'. "
            "Reindexe os livros (ou volte ao modelo anterior)."
        )
    return col


def open_document(path: str) -> fitz.Document:
    doc = fitz.open(path)
    if doc.is_reflowable:  # EPUB/MOBI/FB2
        doc.layout(**EPUB_LAYOUT)
    return doc


def _chunks(text: str) -> list[str]:
    text = " ".join(text.split())
    if len(text) <= CHUNK_CHARS:
        return [text]
    step = CHUNK_CHARS - CHUNK_OVERLAP
    return [text[i:i + CHUNK_CHARS] for i in range(0, len(text) - CHUNK_OVERLAP, step)]


async def _ensure_embed_model() -> None:
    """Pull the embedding model on first use (no-op when already present)."""
    global _model_ready
    if _model_ready or embed_model_id().startswith("openai:"):
        return
    async with httpx.AsyncClient(timeout=httpx.Timeout(600.0)) as client:
        r = await client.post(f"{OLLAMA_EMBED_URL}/api/pull", json={"model": EMBED_MODEL, "stream": False})
        r.raise_for_status()
    _model_ready = True


async def get_embedding(texts: list[str]) -> list[list[float]]:
    last_error = None
    for attempt in range(EMBED_RETRIES):
        try:
            if embed_model_id().startswith("openai:"):
                provider = get_provider("openai", OPENAI_API_KEY_GLOBAL)
                return await provider.embed(texts, model="text-embedding-3-small")
            await _ensure_embed_model()
            return await _embed_ollama.embed(texts, model=EMBED_MODEL)
        except Exception as exc:  # transient: Ollama loading the model, restarting, etc.
            last_error = exc
            await asyncio.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Falha ao gerar embeddings após {EMBED_RETRIES} tentativas: {last_error}")


def _page_filter(livro_id: int, page_ranges: list[tuple[int, int]] | None) -> dict:
    where = {"livro_id": livro_id}
    if not page_ranges:
        return where
    ranges = [{"$and": [{"page": {"$gte": s}}, {"page": {"$lte": e}}]} for s, e in page_ranges]
    return {"$and": [where, ranges[0] if len(ranges) == 1 else {"$or": ranges}]}


async def index_book(
    livro_id: int,
    caminho: str,
    on_progress: Optional[Callable[[int, int], Awaitable[None]]] = None,
    page_ranges: list[tuple[int, int]] | None = None,
) -> dict:
    def read_pages():
        doc = open_document(caminho)
        try:
            total = len(doc)
            pages = []
            for i in range(total):
                number = i + 1
                if page_ranges and not any(s <= number <= e for s, e in page_ranges):
                    continue
                text = doc[i].get_text("text").strip()
                if len(text) >= MIN_PAGE_CHARS:
                    pages.append((number, text))
            return total, pages
        finally:
            doc.close()

    async with _index_lock:
        total_pages, pages = await asyncio.to_thread(read_pages)
        if not pages:
            raise NoTextError("Livro sem texto extraível (provavelmente escaneado): precisa de OCR para indexar.")

        items = [
            (f"{livro_id}_p{number}_c{n}", chunk, {"livro_id": livro_id, "page": number, "chunk": n})
            for number, text in pages
            for n, chunk in enumerate(_chunks(text))
        ]
        col = await asyncio.to_thread(_collection)

        # Upsert first, then drop leftovers of the same pages: a failure midway never empties the book
        done_pages: set[int] = set()
        for start in range(0, len(items), EMBED_BATCH):
            batch = items[start:start + EMBED_BATCH]
            embeddings = await get_embedding([text for _, text, _ in batch])
            await asyncio.to_thread(
                col.upsert,
                ids=[i for i, _, _ in batch],
                documents=[t for _, t, _ in batch],
                embeddings=embeddings,
                metadatas=[m for _, _, m in batch],
            )
            done_pages.update(m["page"] for _, _, m in batch)
            if on_progress:
                await on_progress(len(done_pages), len(pages))

        new_ids = {i for i, _, _ in items}
        indexed_pages = sorted({number for number, _ in pages})
        existing = await asyncio.to_thread(
            col.get, where=_page_filter(livro_id, [(indexed_pages[0], indexed_pages[-1])]), include=[]
        )
        stale = [i for i in existing["ids"] if i not in new_ids and int(i.split("_p")[1].split("_")[0]) in set(indexed_pages)]
        if stale:
            await asyncio.to_thread(col.delete, ids=stale)

    return {"pages_total": total_pages, "pages_indexed": len(pages), "chunks": len(items),
            "skipped": total_pages - len(pages)}


async def query_book(
    livro_id: int,
    query: str,
    n_results: int = 5,
    page_ranges: list[tuple[int, int]] | None = None,
) -> list[dict]:
    if not await asyncio.to_thread(is_book_indexed, livro_id):
        return []
    col = await asyncio.to_thread(_collection)
    query_embedding = await get_embedding([query])
    results = await asyncio.to_thread(
        col.query, query_embeddings=query_embedding, n_results=n_results,
        where=_page_filter(livro_id, page_ranges),
    )
    return [
        {"page": meta["page"], "text": doc, "distance": dist}
        for doc, meta, dist in zip(results["documents"][0], results["metadatas"][0], results["distances"][0])
    ]


def is_book_indexed(livro_id: int) -> bool:
    try:
        return bool(_collection().get(where={"livro_id": livro_id}, limit=1, include=[])["ids"])
    except Exception:
        return False


def count_indexed_pages(livro_id: int) -> int:
    try:
        metas = _collection().get(where={"livro_id": livro_id}, include=["metadatas"])["metadatas"]
        return len({m["page"] for m in metas})
    except Exception:
        return 0
