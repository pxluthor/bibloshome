import asyncio
import json
import logging
import os
import re

import edge_tts
import fitz  # PyMuPDF
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from ai.providers import get_provider, ollama_provider
from ai.rag import index_book, is_book_indexed, query_book
from auth import get_current_user
from database import engine, get_session
from models import (
    Livro,
    LivroIAStatus,
    Usuario,
    UsuarioAISettings,
    UsuarioAISettingsUpdate,
)

logger = logging.getLogger(__name__)

OLLAMA_DEFAULT_CHAT = os.getenv("OLLAMA_DEFAULT_CHAT_MODEL", "llama3.1:8b")
OPENAI_DEFAULT_CHAT = os.getenv("OPENAI_DEFAULT_CHAT_MODEL", "gpt-4o-mini")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")

FOR_INSERT_DIR = os.getenv("FOR_INSERT_DIR", "/data/for_insert")
PASTA_BIBLIOTECA = os.getenv("PASTA_BIBLIOTECA", "/data/biblioteca")

# In-memory indexing status tracker
indexing_tasks: dict[int, str] = {}

router = APIRouter(prefix="/ai", tags=["AI"])

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}

SYSTEM_EXTRACT_METADATA = """Você é um assistente especializado em extrair metadados de livros.
Dado o texto das primeiras páginas de um livro/documento PDF, extraia os seguintes campos em JSON puro (sem markdown, sem blocos de código).
Campos: titulo, autor, area (campo de conhecimento/disciplina), ano (int ou null), editora, idioma, sinopse (resumo curto do conteúdo, máx 3 sentenças), paginas (int ou null).
Se um campo não puder ser determinado, use null. Retorne APENAS o JSON, sem explicações."""

SYSTEM_SUMMARIZE = """Você é um assistente de resumo acadêmico. Gere um resumo claro e estruturado do conteúdo fornecido.
O resumo deve incluir: tema principal, principais tópicos abordados, e conclusões ou insights chave.
Escreva em português, seja conciso mas informativo. Máximo 400 palavras."""

SYSTEM_CHAT = """Você é um assistente de leitura que ajuda o usuário a entender o livro que está lendo.
Responda perguntas com base nos trechos relevantes do livro fornecidos no contexto.
Se a resposta não estiver no contexto, diga que não encontrou essa informação no livro.
Seja direto, claro e cite a página quando possível. Responda em português."""


# ---- HELPERS ----

async def _get_user_settings(user_id: int, session: Session) -> UsuarioAISettings:
    settings = session.exec(
        select(UsuarioAISettings).where(UsuarioAISettings.usuario_id == user_id)
    ).first()
    if not settings:
        settings = UsuarioAISettings(
            usuario_id=user_id,
            provider="ollama",
            chat_model=OLLAMA_DEFAULT_CHAT,
            openai_api_key=None,
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


async def _upsert_ia_status(
    livro_id: int,
    status: str,
    pages_indexed: int = 0,
    error_msg: str | None = None,
):
    with Session(engine) as s:
        row = s.exec(
            select(LivroIAStatus).where(LivroIAStatus.livro_id == livro_id)
        ).first()
        if not row:
            row = LivroIAStatus(livro_id=livro_id)
            s.add(row)
        row.status = status
        row.pages_indexed = pages_indexed
        row.error_msg = error_msg
        s.commit()


# ---- BACKGROUND INDEXER ----

async def _run_index(livro_id: int, caminho: str):
    try:
        indexing_tasks[livro_id] = "indexing"
        await _upsert_ia_status(livro_id, "indexing")

        result = await index_book(livro_id, caminho)

        indexing_tasks[livro_id] = "ready"
        await _upsert_ia_status(livro_id, "ready", pages_indexed=result["pages_indexed"])
        logger.info(
            f"Livro {livro_id} indexado: {result['pages_indexed']} páginas"
        )
    except Exception as e:
        logger.error(f"Erro ao indexar livro {livro_id}: {e}")
        indexing_tasks[livro_id] = "error"
        await _upsert_ia_status(livro_id, "error", error_msg=str(e))


# ---- TTS ----

VOICE_MAP = {
    "Francisca": "pt-BR-FranciscaNeural",
    "Antonio": "pt-BR-AntonioNeural",
    "Thalita": "pt-BR-ThalitaNeural",
}

_PRONUNCIA_PT = {
    r"\bIA\b": "IÁ",
    r"\bIAs\b": "IÁS",
    r"\bIA's\b": "IÁss",
    r"\bLLM\b": "ÉLe Éle M",
    r"\bLLMs\b": "ÉLe Éle ÊMES",
    r"\bAPI\b": "Á P Í",
    r"\bAPIs\b": "Á P ÍS",
    r"\bCPU\b": "C P Ú",
    r"\bGPU\b": "G P Ú",
    r"\bGPT\b": "G P T",
    r"\bJSON\b": "JÊIZON",
    r"\bHTTP\b": "Ága T T P",
}


def _corrigir_pronuncia(texto: str) -> str:
    for padrao, repl in _PRONUNCIA_PT.items():
        texto = re.sub(padrao, repl, texto, flags=re.IGNORECASE)
    return texto


class TTSRequest(BaseModel):
    text: str
    voice: str = "Francisca"
    rate: float = 1.0  # 0.5–2.0 → "-50%" a "+100%"


# ---- ROUTES ----


@router.get("/providers")
async def list_providers(current_user: Usuario = Depends(get_current_user)):
    available_ollama = await ollama_provider.is_available()
    ollama_models: list[str] = []
    if available_ollama:
        try:
            ollama_models = await ollama_provider.list_models()
        except Exception:
            pass

    return {
        "ollama": {"available": available_ollama, "models": ollama_models},
        "openai": {
            "available": True,
            "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        },
    }


@router.get("/settings")
async def get_ai_settings(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    settings = await _get_user_settings(current_user.id, session)
    return {
        "provider": settings.provider,
        "chat_model": settings.chat_model,
        "has_openai_key": bool(settings.openai_api_key),
    }


@router.put("/settings")
async def update_ai_settings(
    body: UsuarioAISettingsUpdate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    settings = await _get_user_settings(current_user.id, session)
    settings.provider = body.provider
    settings.chat_model = body.chat_model or (
        OPENAI_DEFAULT_CHAT if body.provider == "openai" else OLLAMA_DEFAULT_CHAT
    )
    if body.openai_api_key is not None:
        settings.openai_api_key = body.openai_api_key or None
    session.add(settings)
    session.commit()
    return {
        "provider": settings.provider,
        "chat_model": settings.chat_model,
        "has_openai_key": bool(settings.openai_api_key),
    }


class ExtractMetadataRequest(BaseModel):
    caminho: str


@router.post("/extract-metadata")
async def extract_metadata(
    body: ExtractMetadataRequest,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    abs_path = os.path.abspath(body.caminho)
    allowed = [os.path.abspath(FOR_INSERT_DIR), os.path.abspath(PASTA_BIBLIOTECA)]
    if not any(abs_path.startswith(a + os.sep) or abs_path == a for a in allowed):
        raise HTTPException(status_code=403, detail="Caminho fora dos diretórios permitidos")

    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    try:
        doc = fitz.open(abs_path)
        pages_to_read = min(5, len(doc))
        texto = "\n".join(doc[i].get_text("text") for i in range(pages_to_read))
        doc.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler PDF: {e}")

    texto = texto[:4000]

    settings = await _get_user_settings(current_user.id, session)
    try:
        provider = get_provider(settings.provider, settings.openai_api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    resposta = ""
    async for token in provider.chat(
        messages=[{"role": "user", "content": f"Texto do livro:\n\n{texto}"}],
        model=settings.chat_model,
        system=SYSTEM_EXTRACT_METADATA,
        stream=False,
    ):
        resposta += token

    try:
        # Strip possible markdown code fences
        clean = resposta.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        return json.loads(clean)
    except json.JSONDecodeError:
        return {"error": "Não foi possível parsear JSON", "raw": resposta}


@router.post("/summarize/{livro_id}")
async def summarize_book(
    livro_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    livro = session.get(Livro, livro_id)
    if not livro or not livro.caminho:
        raise HTTPException(status_code=404, detail="Livro não encontrado")

    if not os.path.exists(livro.caminho):
        raise HTTPException(status_code=404, detail="Arquivo PDF não encontrado")

    try:
        doc = fitz.open(livro.caminho)
        total = len(doc)

        if total > 50:
            # Stratified sample: first 5, last 5, 10 spread in middle
            indices = (
                list(range(0, 5))
                + [int(total * i / 10) for i in range(2, 10)]
                + list(range(total - 5, total))
            )
            indices = sorted(set(i for i in indices if 0 <= i < total))
        else:
            indices = list(range(total))

        texto = "\n".join(doc[i].get_text("text") for i in indices)
        doc.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler PDF: {e}")

    texto = texto[:8000]

    settings = await _get_user_settings(current_user.id, session)
    try:
        provider = get_provider(settings.provider, settings.openai_api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    titulo = livro.titulo or "Desconhecido"

    async def generate():
        try:
            async for token in provider.chat(
                messages=[
                    {
                        "role": "user",
                        "content": f"Livro: {titulo}\n\nConteúdo:\n{texto}",
                    }
                ],
                model=settings.chat_model,
                system=SYSTEM_SUMMARIZE,
                stream=True,
            ):
                yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers=SSE_HEADERS)


@router.get("/chat/{livro_id}/status")
async def chat_status(
    livro_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Check in-memory task status first
    mem_status = indexing_tasks.get(livro_id)
    if mem_status in ("indexing", "error"):
        row = session.exec(
            select(LivroIAStatus).where(LivroIAStatus.livro_id == livro_id)
        ).first()
        return {
            "status": mem_status,
            "pages_indexed": row.pages_indexed if row else 0,
        }

    # Check persistent status
    row = session.exec(
        select(LivroIAStatus).where(LivroIAStatus.livro_id == livro_id)
    ).first()

    if row and row.status == "ready":
        return {"status": "ready", "pages_indexed": row.pages_indexed}

    # Fallback: check ChromaDB directly
    indexed = is_book_indexed(livro_id)
    if indexed:
        return {"status": "ready", "pages_indexed": row.pages_indexed if row else 0}

    return {"status": "not_indexed", "pages_indexed": 0}


@router.post("/chat/{livro_id}/index")
async def trigger_index(
    livro_id: int,
    background_tasks: BackgroundTasks,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if indexing_tasks.get(livro_id) == "indexing":
        return {"message": "Indexação já em andamento", "livro_id": livro_id}

    livro = session.get(Livro, livro_id)
    if not livro or not livro.caminho:
        raise HTTPException(status_code=404, detail="Livro não encontrado")

    if not os.path.exists(livro.caminho):
        raise HTTPException(status_code=404, detail="Arquivo PDF não encontrado")

    background_tasks.add_task(_run_index, livro_id, livro.caminho)
    return {"message": "Indexação iniciada", "livro_id": livro_id}


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


@router.post("/chat/{livro_id}")
async def chat_with_book(
    livro_id: int,
    body: ChatRequest,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    livro = session.get(Livro, livro_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Livro não encontrado")

    settings = await _get_user_settings(current_user.id, session)
    try:
        provider = get_provider(settings.provider, settings.openai_api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Check if indexed
    if not is_book_indexed(livro_id):
        async def not_indexed_gen():
            yield f"data: {json.dumps({'error': 'Livro não indexado. Clique em Indexar primeiro.'})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(not_indexed_gen(), media_type="text/event-stream", headers=SSE_HEADERS)

    # Retrieve relevant chunks
    chunks = await query_book(livro_id, body.message, n_results=5)
    context = "\n\n".join(
        f"[Página {c['page']}]\n{c['text']}" for c in chunks
    )
    user_content = f"Contexto do livro:\n{context}\n\nPergunta: {body.message}"

    messages = list(body.history) + [{"role": "user", "content": user_content}]

    async def generate():
        try:
            async for token in provider.chat(
                messages=messages,
                model=settings.chat_model,
                system=SYSTEM_CHAT,
                stream=True,
            ):
                yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers=SSE_HEADERS)


@router.post("/tts")
async def text_to_speech(
    body: TTSRequest,
    current_user: Usuario = Depends(get_current_user),
):
    """Gera áudio MP3 via edge_tts (vozes neurais pt-BR) e retorna como stream."""
    if body.voice not in VOICE_MAP:
        raise HTTPException(status_code=400, detail=f"Voz inválida: {body.voice}. Opções: {list(VOICE_MAP)}")

    text = _corrigir_pronuncia(body.text.strip())
    if not text:
        raise HTTPException(status_code=400, detail="Texto vazio")

    voice_id = VOICE_MAP[body.voice]

    # Converter rate float (0.5–2.0) para formato edge_tts: "+10%", "-30%", etc.
    rate_pct = int((body.rate - 1.0) * 100)
    rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"

    async def audio_stream():
        communicate = edge_tts.Communicate(text, voice_id, rate=rate_str)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                yield chunk["data"]

    return StreamingResponse(
        audio_stream(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
