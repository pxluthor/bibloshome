import os
import logging
from typing import Optional, Callable, Awaitable

# ChromaDB requires SQLite >= 3.35 — override with pysqlite3-binary on python:slim images
try:
    __import__('pysqlite3')
    import sys
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
except ImportError:
    pass

import fitz  # PyMuPDF
import chromadb

from ai.providers import ollama_provider, get_provider

logger = logging.getLogger(__name__)

CHROMA_DIR = os.getenv("CHROMA_DIR", "/data/chromadb")
EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
EMBED_PROVIDER = os.getenv("EMBED_PROVIDER", "ollama")
OPENAI_API_KEY_GLOBAL = os.getenv("OPENAI_API_KEY", "")


def get_chroma_client() -> chromadb.PersistentClient:
    return chromadb.PersistentClient(path=CHROMA_DIR)


def collection_name(livro_id: int) -> str:
    return f"livro_{livro_id}"


async def get_embedding(texts: list[str]) -> list[list[float]]:
    if EMBED_PROVIDER == "openai" and OPENAI_API_KEY_GLOBAL:
        provider = get_provider("openai", OPENAI_API_KEY_GLOBAL)
        return await provider.embed(texts, model="text-embedding-3-small")
    return await ollama_provider.embed(texts, model=EMBED_MODEL)


async def index_book(
    livro_id: int,
    caminho: str,
    on_progress: Optional[Callable[[int, int], Awaitable[None]]] = None,
    page_ranges: list[tuple[int, int]] | None = None,
) -> dict:
    doc = fitz.open(caminho)
    total_pages = len(doc)

    # Collect non-empty pages
    valid_pages: list[tuple[int, str]] = []
    for i in range(total_pages):
        text = doc[i].get_text("text").strip()
        if text and len(text) >= 20:
            valid_pages.append((i + 1, text[:3000]))  # cap at 3000 chars per page

    doc.close()

    # Filter to requested page ranges (partial/chapter-scoped indexing)
    if page_ranges:
        valid_pages = [
            (pnum, text) for pnum, text in valid_pages
            if any(s <= pnum <= e for s, e in page_ranges)
        ]

    client = get_chroma_client()
    col = client.get_or_create_collection(collection_name(livro_id), embedding_function=None)

    # Clear existing documents for this book
    existing = col.get()
    if existing["ids"]:
        col.delete(ids=existing["ids"])

    # Process in batches of 10
    batch_size = 10
    processed = 0
    for batch_start in range(0, len(valid_pages), batch_size):
        batch = valid_pages[batch_start : batch_start + batch_size]
        texts_batch = [t for _, t in batch]
        ids = [f"p{pnum}_{livro_id}" for pnum, _ in batch]
        metadatas = [{"page": pnum, "livro_id": livro_id} for pnum, _ in batch]

        try:
            embeddings = await get_embedding(texts_batch)
            col.add(
                ids=ids,
                documents=texts_batch,
                embeddings=embeddings,
                metadatas=metadatas,
            )
        except Exception as e:
            logger.error(f"Erro ao indexar batch livro_id={livro_id}: {e}")
            raise

        processed += len(batch)
        if on_progress:
            await on_progress(processed, len(valid_pages))

    return {
        "pages_total": total_pages,
        "pages_indexed": len(valid_pages),
        "skipped": total_pages - len(valid_pages),
    }


async def query_book(
    livro_id: int,
    query: str,
    n_results: int = 5,
    page_ranges: list[tuple[int, int]] | None = None,
) -> list[dict]:
    client = get_chroma_client()
    try:
        col = client.get_collection(collection_name(livro_id))
    except Exception:
        return []

    if col.count() == 0:
        return []

    query_embedding = await get_embedding([query])

    # Build optional page filter for chapter-scoped queries
    where = None
    if page_ranges:
        if len(page_ranges) == 1:
            s, e = page_ranges[0]
            where = {"$and": [{"page": {"$gte": s}}, {"page": {"$lte": e}}]}
        else:
            where = {
                "$or": [
                    {"$and": [{"page": {"$gte": s}}, {"page": {"$lte": e}}]}
                    for s, e in page_ranges
                ]
            }

    results = col.query(
        query_embeddings=query_embedding,
        n_results=min(n_results, col.count()),
        **({"where": where} if where else {}),
    )

    chunks = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        chunks.append({"page": meta["page"], "text": doc, "distance": dist})

    return chunks


def is_book_indexed(livro_id: int) -> bool:
    """Sync check — ChromaDB is synchronous."""
    try:
        client = get_chroma_client()
        col = client.get_collection(collection_name(livro_id))
        return col.count() > 0
    except Exception:
        return False


def count_indexed_pages(livro_id: int) -> int:
    """Return the number of chunks in the ChromaDB collection (approximates pages indexed)."""
    try:
        client = get_chroma_client()
        col = client.get_collection(collection_name(livro_id))
        return col.count()
    except Exception:
        return 0
