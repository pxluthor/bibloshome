import json
import logging
import re

import fitz  # PyMuPDF
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ai.providers import get_provider
from ai_routes import SSE_HEADERS, _get_user_settings
from auth import get_current_user
from database import get_session, engine
from models import EstudioArtefato, Livro, Usuario
from services import PDFService, get_pdf_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Est\u00fadio"])

SYSTEM_QUIZ = (
    "Voce e um professor criando uma avaliacao em PORTUGUES DO BRASIL. "
    "IMPORTANTE: todas as perguntas, opcoes e explicacoes devem estar escritas em portugues, "
    "independentemente do idioma do conteudo fornecido. "
    "Gere 5 questoes de multipla escolha (A, B, C, D) com base no conteudo fornecido. "
    'Retorne APENAS um JSON array: [{"question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], '
    '"answer_index": 0, "explanation": "..."}] '
    "onde answer_index e o indice 0-3 da opcao correta. Sem markdown, sem texto extra."
)

SYSTEM_FLASHCARDS = (
    "Voce e um professor criando cartoes didaticos para revisao em PORTUGUES DO BRASIL. "
    "IMPORTANTE: todas as perguntas e respostas dos cartoes devem estar escritas em portugues, "
    "independentemente do idioma do conteudo fornecido. "
    "Gere 8 flashcards com base no conteudo fornecido. "
    'Retorne APENAS um JSON array: [{"frente": "...", "verso": "..."}] '
    "Sem markdown, sem texto adicional."
)

SYSTEM_MINDMAP = (
    "Voce e um professor criando um mapa mental estruturado em PORTUGUES DO BRASIL. "
    "IMPORTANTE: todo o conteudo do mapa mental deve estar em portugues, "
    "independentemente do idioma do conteudo fornecido. "
    "Com base no conteudo, crie um mapa mental hierarquico em Markdown. "
    "Use # para o tema central, ## para subtemas principais, ### para detalhes. "
    "Maximo 3 niveis de profundidade. "
    "Retorne APENAS o Markdown, sem explicacoes adicionais."
)

SYSTEM_AUDIO_RESUMO = (
    "Voce e um professor criando um resumo para ser narrado em audio. "
    "O resumo deve ser fluente e natural para leitura em voz alta "
    "(sem formatacao Markdown, sem listas com *, sem simbolos). "
    "Em portugues, claro e didatico. Maximo 500 palavras."
)

VALID_TIPOS = {"quiz", "flashcards", "mindmap", "audio_resumo"}

SYSTEM_PROMPTS = {
    "quiz": SYSTEM_QUIZ,
    "flashcards": SYSTEM_FLASHCARDS,
    "mindmap": SYSTEM_MINDMAP,
    "audio_resumo": SYSTEM_AUDIO_RESUMO,
}


def _strip_markdown_code_fences(text: str) -> str:
    clean = text.strip()
    clean = re.sub(r"^```(?:json)?\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s*```$", "", clean)
    return clean.strip()


def _extract_pages_text(
    livro: Livro,
    page_ranges: list[dict],
    pdf_service: PDFService,
    max_chars: int = 12000,
) -> str:
    try:
        file_path = pdf_service.get_file_path(livro.caminho)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Arquivo PDF n\u00e3o encontrado") from exc

    doc = None
    try:
        doc = fitz.open(file_path)
        total = len(doc)

        pages_to_read: set[int] = set()
        for page_range in page_ranges:
            start = max(1, int(page_range.get("start", 1)))
            end = min(int(page_range.get("end", total)), total)
            if end >= start:
                pages_to_read.update(range(start - 1, end))

        pages = sorted(pages_to_read)
        if len(pages) > 40:
            step = max(1, len(pages) // 40)
            pages = pages[::step][:40]

        textos = [
            doc[page_index].get_text("text").strip()
            for page_index in pages
            if 0 <= page_index < total
        ]
        return "\n".join(textos)[:max_chars]
    finally:
        if doc is not None:
            doc.close()


@router.get("/estudio/{livro_id}/chapters")
async def get_chapters(
    livro_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
    pdf_service: PDFService = Depends(get_pdf_service),
):
    livro = session.get(Livro, livro_id)
    if not livro or not livro.caminho:
        raise HTTPException(status_code=404, detail="Livro n\u00e3o encontrado")

    try:
        file_path = pdf_service.get_file_path(livro.caminho)
    except Exception:
        return {"chapters": [], "has_toc": False}

    doc = None
    try:
        doc = fitz.open(file_path)
        total_pages = len(doc)
        toc = doc.get_toc()
    except Exception as exc:
        logger.warning("Falha ao ler TOC do livro %s: %s", livro_id, exc)
        return {"chapters": [], "has_toc": False}
    finally:
        if doc is not None:
            doc.close()

    if not toc:
        return {"chapters": [], "has_toc": False}

    filtered = [
        (level, title, page_start)
        for level, title, page_start in toc
        if level <= 2
    ]

    chapters = []
    for index, (level, title, page_start) in enumerate(filtered):
        page_end = total_pages
        for next_level, _, next_page_start in filtered[index + 1 :]:
            if next_level <= level:
                page_end = next_page_start - 1
                break

        chapters.append(
            {
                "id": index,
                "title": title,
                "level": level,
                "page_start": page_start,
                "page_end": max(page_start, page_end),
            }
        )

    return {"chapters": chapters, "has_toc": True}


class ArtifactRequest(BaseModel):
    tipo: str
    page_ranges: list[dict] = Field(default_factory=list)


@router.post("/estudio/{livro_id}/artifact")
async def generate_artifact(
    livro_id: int,
    body: ArtifactRequest,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
    pdf_service: PDFService = Depends(get_pdf_service),
):
    if body.tipo not in VALID_TIPOS:
        raise HTTPException(
            status_code=400,
            detail=f"tipo inv\u00e1lido. Op\u00e7\u00f5es: {sorted(VALID_TIPOS)}",
        )

    livro = session.get(Livro, livro_id)
    if not livro or not livro.caminho:
        raise HTTPException(status_code=404, detail="Livro n\u00e3o encontrado")

    settings = await _get_user_settings(current_user.id, session)
    try:
        provider = get_provider(settings.provider, settings.openai_api_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    page_ranges = body.page_ranges or [{"start": 1, "end": livro.paginas or 9999}]
    texto = _extract_pages_text(livro, page_ranges, pdf_service)
    titulo = livro.titulo or "Desconhecido"
    user_content = f"Livro: {titulo}\n\nConteudo:\n{texto}"
    system = SYSTEM_PROMPTS[body.tipo]

    if body.tipo == "audio_resumo":
        async def generate():
            try:
                async for token in provider.chat(
                    messages=[{"role": "user", "content": user_content}],
                    model=settings.chat_model,
                    system=system,
                    stream=True,
                ):
                    yield f"data: {json.dumps({'token': token})}\n\n"
            except Exception as exc:
                yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            finally:
                yield "data: [DONE]\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers=SSE_HEADERS,
        )

    resposta = ""
    async for token in provider.chat(
        messages=[{"role": "user", "content": user_content}],
        model=settings.chat_model,
        system=system,
        stream=False,
    ):
        resposta += token

    if body.tipo == "mindmap":
        return {"tipo": body.tipo, "content": resposta.strip()}

    try:
        data = json.loads(_strip_markdown_code_fences(resposta))
        return {"tipo": body.tipo, "content": data}
    except json.JSONDecodeError:
        return {
            "tipo": body.tipo,
            "content": [],
            "error": "N\u00e3o foi poss\u00edvel parsear JSON",
            "raw": resposta,
        }


# \u2500\u2500 Persist\u00eancia de artefatos \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

class SaveArtifactRequest(BaseModel):
    conteudo: Any


@router.get("/estudio/{livro_id}/artifacts")
async def list_saved_artifacts(
    livro_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        select(EstudioArtefato)
        .where(EstudioArtefato.livro_id == livro_id)
        .where(EstudioArtefato.usuario_id == current_user.id)
    ).all()
    return [
        {"tipo": r.tipo, "conteudo": r.conteudo, "saved_at": r.saved_at.isoformat()}
        for r in rows
    ]


@router.post("/estudio/{livro_id}/artifacts/{tipo}")
async def save_artifact(
    livro_id: int,
    tipo: str,
    body: SaveArtifactRequest,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if tipo not in VALID_TIPOS:
        raise HTTPException(status_code=400, detail=f"tipo inv\u00e1lido: {tipo}")

    row = session.exec(
        select(EstudioArtefato)
        .where(EstudioArtefato.livro_id == livro_id)
        .where(EstudioArtefato.usuario_id == current_user.id)
        .where(EstudioArtefato.tipo == tipo)
    ).first()

    if row:
        row.conteudo = body.conteudo
        row.saved_at = datetime.utcnow()
    else:
        row = EstudioArtefato(
            usuario_id=current_user.id,
            livro_id=livro_id,
            tipo=tipo,
            conteudo=body.conteudo,
        )
        session.add(row)
    session.commit()
    return {"status": "saved", "tipo": tipo, "saved_at": row.saved_at.isoformat()}


@router.delete("/estudio/{livro_id}/artifacts/{tipo}")
async def delete_artifact(
    livro_id: int,
    tipo: str,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    row = session.exec(
        select(EstudioArtefato)
        .where(EstudioArtefato.livro_id == livro_id)
        .where(EstudioArtefato.usuario_id == current_user.id)
        .where(EstudioArtefato.tipo == tipo)
    ).first()
    if row:
        session.delete(row)
        session.commit()
    return {"status": "deleted", "tipo": tipo}
