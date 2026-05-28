import json
import re

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ai.providers import get_provider
from ai_routes import _get_user_settings
from auth import get_current_user
from database import get_session
from models import Livro, Usuario, UsuarioAISettings

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


@router.post("/{doc_id}/auto-metadata")
async def auto_fill_metadata(
    doc_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Apenas administradores podem usar esta feature")

    livro = session.get(Livro, doc_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Livro nao encontrado")

    settings = await _get_user_settings(current_user.id, session)

    if settings.provider == "openai" and not settings.openai_api_key:
        raise HTTPException(
            status_code=400,
            detail="Chave OpenAI nao configurada. Configure nas configuracoes de IA ou mude para Ollama."
        )

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

    # 3. Monta prompt com os resultados para o LLM sintetizar
    if results:
        results_text = json.dumps(results, ensure_ascii=False, indent=2)
        context_section = f"Resultados da busca ({fonte}):\n{results_text}"
    elif web_snippets:
        context_section = f"Resultados de busca na web ({fonte}):\n{web_snippets}"
    else:
        context_section = "Nenhum resultado encontrado nas APIs."

    user_message = (
        f"Nome do arquivo: {search_query}\n\n"
        f"{context_section}"
    )

    debug_results = {
        "fonte": fonte,
        "search_query": search_query,
        "api_results": results,
        "web_snippets": web_snippets or None,
    }

    # 4. Chama o LLM configurado pelo usuario (Ollama ou OpenAI)
    model = settings.chat_model or (
        OPENAI_DEFAULT_CHAT if settings.provider == "openai" else OLLAMA_DEFAULT_CHAT
    )
    provider = get_provider(settings.provider, settings.openai_api_key)

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
        raise HTTPException(status_code=500, detail=f"Erro ao chamar LLM: {str(e)}")

    if not full_response.strip():
        raise HTTPException(status_code=500, detail="LLM nao retornou resposta")

    # 5. Parse do JSON
    try:
        clean = re.sub(r"```json\s*", "", full_response)
        clean = re.sub(r"```\s*", "", clean).strip()
        # Extrai o JSON mesmo se houver texto antes/depois
        match = re.search(r'\{.*\}', clean, re.DOTALL)
        if match:
            clean = match.group(0)
        metadata = json.loads(clean)
        metadata["fonte"] = fonte
        metadata["_debug"] = debug_results
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail=f"LLM retornou formato invalido: {full_response[:300]}"
        )

    return metadata
