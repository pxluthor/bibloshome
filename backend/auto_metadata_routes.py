import asyncio
import json
import logging
import re
from datetime import datetime

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlmodel import Session, select

from ai_routes import _get_user_settings, build_provider
from auth import get_current_user
from database import engine, get_session
from models import Livro, Usuario, UsuarioAISettings
from services import get_pdf_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["Auto Metadata"])

OLLAMA_DEFAULT_CHAT = "llama3.1:8b"
OPENAI_DEFAULT_CHAT = "gpt-4o-mini"


def extract_search_query(caminho: str) -> str:
    filename = caminho.replace("\\", "/").split("/")[-1]
    filename = re.sub(r"\.(pdf|epub|mobi)$", "", filename, flags=re.IGNORECASE)
    filename = re.sub(r"\(Z-Library[^)]*\)", "", filename, flags=re.IGNORECASE)
    filename = re.sub(r"\[Z-Library[^\]]*\]", "", filename, flags=re.IGNORECASE)
    filename = re.sub(r"\(z-lib\.org\)", "", filename, flags=re.IGNORECASE)
    filename = re.sub(r"\(libgen\.[^)]*\)", "", filename, flags=re.IGNORECASE)
    filename = re.sub(r"\s+", " ", filename).strip()
    return filename


async def search_google_books(query: str) -> list:
    url = "https://www.googleapis.com/books/v1/volumes"
    params = {"q": query, "maxResults": 3, "printType": "books"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, params=params)
            if response.status_code != 200:
                return []
            data = response.json()
    except Exception:
        return []

    results = []
    for item in data.get("items", [])[:3]:
        info = item.get("volumeInfo", {})
        results.append({
            "titulo": info.get("title"),
            "subtitulo": info.get("subtitle"),
            "autores": info.get("authors", []),
            "editora": info.get("publisher"),
            "ano": info.get("publishedDate", "")[:4] if info.get("publishedDate") else None,
            "idioma": info.get("language"),
            "paginas": info.get("pageCount"),
            "categorias": info.get("categories", []),
            "sinopse": info.get("description", "")[:600] if info.get("description") else None,
        })
    return results


async def search_web_for_book(query: str) -> str:
    """Busca snippets via DuckDuckGo HTML (sem API key) — mesma abordagem do WebSearchTool."""
    try:
        search_q = f'livro "{query}" autor editora ano'
        url = f"https://html.duckduckgo.com/html/?q={httpx.QueryParams({'q': search_q})}"
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://html.duckduckgo.com/html/",
                params={"q": search_q},
                headers=headers,
                follow_redirects=True,
            )
        if response.status_code != 200:
            return ""

        soup = BeautifulSoup(response.text, "html.parser")
        snippets = []
        for el in soup.select(".result")[:5]:
            title = el.select_one(".result__title")
            snippet = el.select_one(".result__snippet")
            title_text = title.get_text(strip=True) if title else ""
            snippet_text = snippet.get_text(strip=True) if snippet else ""
            if title_text:
                snippets.append(f"- {title_text}: {snippet_text}")

        return "\n".join(snippets)
    except Exception:
        return ""


async def search_open_library(query: str) -> list:
    url = "https://openlibrary.org/search.json"
    params = {
        "q": query, "limit": 3,
        "fields": "title,author_name,publisher,first_publish_year,language,number_of_pages_median,subject"
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, params=params)
            if response.status_code != 200:
                return []
            data = response.json()
    except Exception:
        return []

    results = []
    for doc in data.get("docs", [])[:3]:
        results.append({
            "titulo": doc.get("title"),
            "autores": doc.get("author_name", []),
            "editora": doc.get("publisher", [None])[0] if doc.get("publisher") else None,
            "ano": doc.get("first_publish_year"),
            "idioma": doc.get("language", [None])[0] if doc.get("language") else None,
            "paginas": doc.get("number_of_pages_median"),
            "categorias": doc.get("subject", [])[:5],
        })
    return results


SYSTEM_METADATA = """Voce e um assistente especializado em metadados de livros para biblioteca digital.

Com base no nome do arquivo e nos resultados de busca fornecidos, retorne APENAS um JSON puro (sem markdown, sem blocos de codigo) com os campos:
{
  "titulo": "titulo limpo sem extensao e sem tags de origem",
  "autor": "nome completo ou autores separados por virgula",
  "editora": "nome da editora ou null",
  "ano": numero inteiro ou null,
  "idioma": "Portugues" ou "Ingles" ou outro idioma em portugues,
  "paginas": numero inteiro ou null,
  "sinopse": "resumo em portugues max 3 sentencas ou null",
  "genero": "escolha UM de: Historia, Literatura, Ciencia e Tecnologia, Ciencias Sociais, Artes e Cultura, Religiao e Filosofia, Lifestyle, Educacao, Saude e Medicina, Direito, Negocios",
  "tags": ["max 6 tags especificas em minusculo"],
  "fonte": "Google Books" ou "Open Library" ou "inferido"
}

Se os resultados de busca nao forem relevantes, infira os metadados a partir do nome do arquivo.
Responda APENAS com o JSON, sem nenhum texto adicional."""


def _count_pages_from_file(file_path: str) -> int | None:
    """Conta páginas do arquivo real — PDF via pdfplumber, EPUB via ebooklib."""
    try:
        if file_path.lower().endswith(".pdf"):
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                return len(pdf.pages)
        if file_path.lower().endswith(".epub"):
            from ebooklib import epub
            book = epub.read_epub(file_path, options={"ignore_ncx": True})
            # Aproximação: conta documentos de conteúdo (spine items)
            items = [i for i in book.get_items() if i.get_type() == 9]  # ITEM_DOCUMENT
            # Estima ~2 páginas por capítulo
            return max(1, len(items) * 2) if items else None
    except Exception:
        pass
    return None


@router.post("/{doc_id}/auto-metadata")
async def auto_fill_metadata(
    doc_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
    pdf_service=Depends(get_pdf_service),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Apenas administradores podem usar esta feature")

    livro = session.get(Livro, doc_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Livro nao encontrado")
    return await suggest_metadata(livro, current_user, session, pdf_service)


async def suggest_metadata(livro: Livro, current_user: Usuario, session: Session, pdf_service) -> dict:
    """Suggested metadata for a book (APIs + LLM); does not save anything."""
    settings = await _get_user_settings(current_user.id, session)

    if settings.provider == "openai" and not settings.openai_api_key:
        raise HTTPException(
            status_code=400,
            detail="Chave OpenAI nao configurada. Configure nas configuracoes de IA ou mude para Ollama."
        )

    # 0. Conta páginas do arquivo real (independente do LLM)
    paginas_arquivo = None
    try:
        file_path = pdf_service.get_file_path(livro.caminho)
        paginas_arquivo = _count_pages_from_file(file_path)
    except Exception:
        pass

    # 1. Extrai query limpa do filename
    search_query = extract_search_query(livro.caminho or livro.titulo or "")
    if not search_query:
        raise HTTPException(status_code=400, detail="Nao foi possivel extrair informacao do caminho do arquivo")

    # 2. Busca metadados (Google Books → Open Library → Web)
    results = await search_google_books(search_query)
    fonte = "Google Books"
    web_snippets = ""

    if not results:
        results = await search_open_library(search_query)
        fonte = "Open Library"

    if not results:
        web_snippets = await search_web_for_book(search_query)
        fonte = "Web Search"

    # 3. Monta mapeamento direto dos dados estruturados (alta confiança)
    best = results[0] if results else {}
    direct_data = {}
    if best.get("editora"):   direct_data["editora"]  = best["editora"]
    if best.get("ano"):       direct_data["ano"]       = int(best["ano"])
    if best.get("idioma"):    direct_data["idioma"]    = best["idioma"]
    if best.get("paginas"):   direct_data["paginas"]   = best["paginas"]
    if paginas_arquivo:       direct_data["paginas"]   = paginas_arquivo  # arquivo real tem prioridade
    if best.get("sinopse"):   direct_data["sinopse"]   = best["sinopse"]
    autores = best.get("autores", [])
    if autores:               direct_data["autor"]     = ", ".join(autores)
    if best.get("titulo"):    direct_data["titulo"]    = best["titulo"]

    # Monta prompt: dados estruturados confiáveis + contexto de busca
    if results:
        results_text = json.dumps(results, ensure_ascii=False, indent=2)
        context_section = f"Resultados da busca ({fonte}):\n{results_text}"
    elif web_snippets:
        context_section = f"Resultados de busca na web ({fonte}):\n{web_snippets}"
    else:
        context_section = "Nenhum resultado encontrado nas APIs."

    # Dados já extraídos diretamente das APIs — LLM deve confirmar/corrigir e completar
    direct_section = ""
    if direct_data:
        direct_section = (
            "\n\nDados já extraídos com alta confiança (confirme ou corrija se necessário):\n"
            + json.dumps(direct_data, ensure_ascii=False, indent=2)
        )

    user_message = (
        f"Nome do arquivo: {search_query}\n\n"
        f"{context_section}"
        f"{direct_section}"
    )

    debug_results = {
        "fonte": fonte,
        "search_query": search_query,
        "api_results": results,
        "web_snippets": web_snippets or None,
    }

    # 4. Tenta LLM sempre (Ollama/OpenAI/Codex/Claude) — fallback para mapeamento direto só se falhar
    if settings.provider == "openai" and not settings.openai_api_key:
        llm_available = False
    else:
        llm_available = True

    if llm_available:
        model = settings.chat_model or (
            OPENAI_DEFAULT_CHAT if settings.provider == "openai" else OLLAMA_DEFAULT_CHAT
        )
        try:
            provider = build_provider(settings, current_user.id, session)
        except HTTPException:
            llm_available = False

    if llm_available:
        full_response = ""
        try:
            async for chunk in provider.chat(
                messages=[{"role": "user", "content": user_message}],
                model=model,
                system=SYSTEM_METADATA,
                stream=False,
            ):
                full_response += (chunk or "")
        except Exception as e:
            llm_available = False  # conexão falhou → fallback para mapeamento direto

        if llm_available and full_response.strip():
            try:
                clean = re.sub(r"```json\s*", "", full_response)
                clean = re.sub(r"```\s*", "", clean).strip()
                match = re.search(r'\{.*\}', clean, re.DOTALL)
                if match:
                    clean = match.group(0)
                metadata = json.loads(clean)
                metadata["fonte"] = fonte
                metadata["_debug"] = debug_results
                # Páginas do arquivo real têm prioridade sobre estimativa do LLM
                if paginas_arquivo:
                    metadata["paginas"] = paginas_arquivo
                return metadata
            except json.JSONDecodeError:
                pass  # JSON inválido → fallback para mapeamento direto

    # 5. Fallback: mapeamento direto (LLM indisponível ou retornou JSON inválido)
    #    Usa os dados estruturados já calculados em direct_data
    titulo_limpo = direct_data.get("titulo") or search_query
    if best.get("subtitulo"):
        titulo_limpo = f"{titulo_limpo}: {best['subtitulo']}"

    categorias = best.get("categorias", [])
    generos_map = {
        "history": "Historia", "literature": "Literatura", "science": "Ciencia e Tecnologia",
        "technology": "Ciencia e Tecnologia", "computers": "Ciencia e Tecnologia",
        "social": "Ciencias Sociais", "art": "Artes e Cultura", "philosophy": "Religiao e Filosofia",
        "religion": "Religiao e Filosofia", "education": "Educacao", "health": "Saude e Medicina",
        "medical": "Saude e Medicina", "law": "Direito", "business": "Negocios",
        "economics": "Negocios", "fiction": "Literatura", "mathematics": "Ciencia e Tecnologia",
    }
    genero = None
    for cat in categorias:
        for key, val in generos_map.items():
            if key in cat.lower():
                genero = val
                break
        if genero:
            break

    tags = [c.lower().split("/")[0].strip() for c in categorias[:6]] if categorias else []

    return {
        "titulo": titulo_limpo,
        "autor": direct_data.get("autor"),
        "editora": direct_data.get("editora"),
        "ano": direct_data.get("ano"),
        "idioma": direct_data.get("idioma"),
        "paginas": direct_data.get("paginas"),
        "sinopse": direct_data.get("sinopse"),
        "genero": genero,
        "tags": tags,
        "fonte": fonte,
        "_debug": debug_results,
    }


# ── Preenchimento em lote (admin) ────────────────────────────────────────────
# Runs in-process in the background; only fills EMPTY fields, never overwrites, never touches titulo.

batch_router = APIRouter(prefix="/admin/metadata-batch", tags=["Auto Metadata"])

BATCH_DELAY_SECONDS = 2.0  # be gentle with Google Books / Open Library / the LLM provider
_FIELD_LIMITS = {"autor": 255, "editora": 255, "idioma": 255, "genero": 255}

_batch = {
    "running": False, "stop": False, "total": 0, "processed": 0, "updated": 0, "failed": 0,
    "current": None, "started_at": None, "finished_at": None, "errors": [],
}
_batch_task: asyncio.Task | None = None


def _require_admin(user: Usuario):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Apenas administradores")


def _apply_missing(livro: Livro, meta: dict) -> bool:
    """Copy suggested values into empty fields only. Returns True if anything changed."""
    changed = False
    for field, limit in _FIELD_LIMITS.items():
        value = meta.get(field)
        if not getattr(livro, field) and isinstance(value, str) and value.strip() and value.strip().lower() != "null":
            setattr(livro, field, value.strip()[:limit])
            changed = True
    sinopse = meta.get("sinopse")
    if not livro.sinopse and isinstance(sinopse, str) and len(sinopse.strip()) > 20:
        livro.sinopse = sinopse.strip()[:2000]
        changed = True
    for field in ("ano", "paginas"):
        try:
            value = int(meta.get(field)) if meta.get(field) is not None else None
        except (TypeError, ValueError):
            value = None
        valid = value and (1400 <= value <= 2100 if field == "ano" else 0 < value < 20000)
        if not getattr(livro, field) and valid:
            setattr(livro, field, value)
            changed = True
    tags = meta.get("tags")
    if not livro.tags and isinstance(tags, list):
        clean = [t.strip().lower()[:40] for t in tags if isinstance(t, str) and t.strip()][:6]
        if clean:
            livro.tags = clean
            changed = True
    return changed


async def _run_batch(admin_id: int, limit: int | None):
    _batch.update(running=True, stop=False, processed=0, updated=0, failed=0, errors=[],
                  started_at=datetime.utcnow().isoformat(), finished_at=None, current=None)
    try:
        with Session(engine) as session:
            stmt = select(Livro.id).where(or_(Livro.autor == None, Livro.autor == "")).order_by(Livro.id)  # noqa: E711
            ids = list(session.exec(stmt).all())
        if limit:
            ids = ids[:limit]
        _batch["total"] = len(ids)
        pdf_service = get_pdf_service()

        for livro_id in ids:
            if _batch["stop"]:
                break
            try:
                with Session(engine) as session:
                    livro = session.get(Livro, livro_id)
                    admin = session.get(Usuario, admin_id)
                    if not livro or livro.autor:
                        continue
                    _batch["current"] = livro.titulo
                    meta = await suggest_metadata(livro, admin, session, pdf_service)
                    if _apply_missing(livro, meta):
                        session.add(livro)
                        session.commit()
                        _batch["updated"] += 1
            except Exception as exc:  # one bad book must not stop the batch
                _batch["failed"] += 1
                _batch["errors"] = (_batch["errors"] + [f"{livro_id}: {exc}"])[-10:]
                logger.warning("Metadados em lote falharam para o livro %s: %s", livro_id, exc)
            finally:
                _batch["processed"] += 1
            await asyncio.sleep(BATCH_DELAY_SECONDS)
    finally:
        _batch.update(running=False, current=None, finished_at=datetime.utcnow().isoformat())


@batch_router.post("/start")
async def start_metadata_batch(
    limit: int | None = Query(default=None, ge=1, le=5000),
    current_user: Usuario = Depends(get_current_user),
):
    """Start filling metadata for books without author. `limit` processes only the first N (useful to test)."""
    global _batch_task
    _require_admin(current_user)
    if _batch["running"]:
        raise HTTPException(status_code=409, detail="Já existe um lote em andamento")
    _batch_task = asyncio.create_task(_run_batch(current_user.id, limit))
    return {"status": "started"}


@batch_router.post("/stop")
async def stop_metadata_batch(current_user: Usuario = Depends(get_current_user)):
    _require_admin(current_user)
    _batch["stop"] = True
    return {"status": "stopping"}


@batch_router.get("/status")
async def metadata_batch_status(current_user: Usuario = Depends(get_current_user)):
    _require_admin(current_user)
    return {k: v for k, v in _batch.items() if k != "stop"}
