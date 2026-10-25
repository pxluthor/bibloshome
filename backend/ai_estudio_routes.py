import html
import json
import logging
import os
import re

import asyncio
import shutil
import tempfile
from pathlib import Path

import edge_tts
import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFont
import httpx
from fastapi.responses import Response
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

import unicodedata

from ai_routes import SSE_HEADERS, SYSTEM_CHAT, VOICE_MAP, _corrigir_pronuncia, _get_user_settings, build_provider
from auth import get_current_user
from database import get_session, engine
from models import utcnow, EstudioArtefato, Livro, Usuario
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

# Transformações em Markdown, adaptadas dos prompts padrão do open-notebook (MIT).
_MD_RULES = (
    " Escreva em PORTUGUES DO BRASIL, independentemente do idioma do conteudo. "
    "Retorne apenas o conteudo pedido em Markdown, sem introducoes nem comentarios."
)
TEXT_PROMPTS = {
    "resumo": (
        "Voce e um professor. Crie um resumo didatico do conteudo: um paragrafo de visao geral "
        "e depois os conceitos-chave em topicos curtos, cada um com uma explicacao de 1-2 frases."
        + _MD_RULES
    ),
    "insights": (
        "Extraia de 10 a 15 ideias mais importantes e surpreendentes do conteudo, em topicos "
        "de cerca de 15 palavras, sem comecar dois topicos com as mesmas palavras." + _MD_RULES
    ),
    "reflexao": (
        "Crie de 3 a 5 perguntas de reflexao profundas sobre o conteudo, que levem o leitor a "
        "conectar as ideias com a pratica e questionar suposicoes. Para cada pergunta, adicione "
        "uma linha 'Dica:' apontando o trecho do conteudo que ajuda a responder." + _MD_RULES
    ),
    "sumario": (
        "Crie um sumario comentado: liste na ordem em que aparecem todos os topicos e transicoes "
        "do conteudo, cada um com uma descricao curta do que e abordado." + _MD_RULES
    ),
}

SYSTEM_VIDEO_QUERIES = (
    "Com base no conteudo, gere 3 termos de busca curtos para encontrar videoaulas no YouTube "
    "que reforcem os conceitos centrais. Use 2 termos em portugues e 1 em ingles. "
    'Retorne APENAS um JSON array de strings: ["...", "...", "..."]. Sem markdown.'
)

# Roteiro em dois apresentadores, inspirado em prompts/podcast do open-notebook (MIT).
SYSTEM_PODCAST = (
    "Voce e roteirista de um podcast educativo em PORTUGUES DO BRASIL com dois apresentadores: "
    "Ana (professora, explica com clareza e exemplos) e Beto (estudante curioso, faz perguntas, "
    "resume com as proprias palavras e as vezes erra para Ana corrigir). "
    "Estruture o episodio em 3 partes: abertura com o tema, desenvolvimento dos conceitos centrais "
    "do conteudo e fechamento com recapitulacao em 3 pontos. "
    "Gere entre 14 e 22 falas alternadas, cada uma com no maximo 60 palavras, linguagem falada e "
    "natural, sem Markdown, sem simbolos, sem efeitos sonoros. Todo o texto em portugues, "
    "independentemente do idioma do conteudo. "
    'Retorne APENAS um JSON array: [{"speaker": "Ana", "text": "..."}, {"speaker": "Beto", "text": "..."}]. '
    "Sem markdown, sem texto extra."
)

SYSTEM_VIDEO_ROTEIRO = (
    "Voce e roteirista de videoaulas curtas em PORTUGUES DO BRASIL. Com base no conteudo, crie "
    "de 6 a 9 cenas de slides narrados. Layouts disponiveis: "
    '"titulo" (abertura: title + subtitle), "topicos" (title + 3 a 5 bullets curtos), '
    '"destaque" (title + text: uma definicao ou ideia central em ate 30 palavras), '
    '"codigo" (title + code: ate 12 linhas, so se o conteudo tiver codigo), '
    '"recap" (fechamento: title + 3 bullets). Comece com "titulo" e termine com "recap". '
    "Cada cena tem narration: texto falado, natural, ate 70 palavras, sem Markdown e sem simbolos, "
    "que explica o slide sem apenas le-lo. Todo o texto em portugues, independentemente do idioma do conteudo. "
    'Retorne APENAS um JSON array: [{"layout": "titulo", "title": "...", "subtitle": "...", '
    '"bullets": [], "text": "", "code": "", "narration": "..."}]. Sem markdown, sem texto extra.'
)

VALID_TIPOS = {"quiz", "flashcards", "mindmap", "audio_resumo", "videos", "podcast", "video", *TEXT_PROMPTS}

SYSTEM_PROMPTS = {
    "quiz": SYSTEM_QUIZ,
    "flashcards": SYSTEM_FLASHCARDS,
    "mindmap": SYSTEM_MINDMAP,
    "audio_resumo": SYSTEM_AUDIO_RESUMO,
    "videos": SYSTEM_VIDEO_QUERIES,
    "podcast": SYSTEM_PODCAST,
    "video": SYSTEM_VIDEO_ROTEIRO,
    **TEXT_PROMPTS,
}

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"


async def _search_youtube(queries: list[str], per_query: int = 4) -> list[dict]:
    """Search YouTube Data API v3 (100 quota units per query); dedupes by video id."""
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="YOUTUBE_API_KEY não configurada no backend")

    videos: dict[str, dict] = {}
    async with httpx.AsyncClient(timeout=15) as client:
        for query in queries[:3]:
            resp = await client.get(YOUTUBE_SEARCH_URL, params={
                "key": api_key,
                "part": "snippet",
                "type": "video",
                "q": query,
                "maxResults": per_query,
                "relevanceLanguage": "pt",
                "safeSearch": "strict",
            })
            if resp.status_code != 200:
                logger.warning("YouTube search falhou (%s): %s", resp.status_code, resp.text[:200])
                raise HTTPException(status_code=502, detail="Falha na busca do YouTube")
            for item in resp.json().get("items", []):
                video_id = item.get("id", {}).get("videoId")
                if not video_id or video_id in videos:
                    continue
                snippet = item.get("snippet", {})
                videos[video_id] = {
                    "video_id": video_id,
                    "title": html.unescape(snippet.get("title", "")),
                    "channel": snippet.get("channelTitle", ""),
                    "thumbnail": snippet.get("thumbnails", {}).get("medium", {}).get("url", ""),
                    "query": query,
                }
    return list(videos.values())


def _strip_markdown_code_fences(text: str) -> str:
    clean = text.strip()
    clean = re.sub(r"^```(?:json)?\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s*```$", "", clean)
    return clean.strip()


# Valid JSON escape (kept) or a lone backslash (doubled); scanning left to right keeps "\\" pairs intact.
_JSON_ESCAPE_RE = re.compile(r'\\(["\\/bfnrt]|u[0-9a-fA-F]{4})|\\')


def _fix_json_escapes(text: str) -> str:
    """Escape lone backslashes, e.g. regex like \\d or \\1 written raw by the model."""
    return _JSON_ESCAPE_RE.sub(lambda m: m.group(0) if m.group(1) else "\\\\", text)


def _parse_json(text: str) -> Any:
    """Parseia JSON tolerando texto extra antes/depois (comum em modelos como gpt-oss)
    e barras invertidas sem escape (livros de regex, código)."""
    clean = _strip_markdown_code_fences(text)
    for candidate in (clean, _fix_json_escapes(clean)):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            starts = [i for i in (candidate.find("["), candidate.find("{")) if i != -1]
            if not starts:
                continue
            try:
                data, _ = json.JSONDecoder().raw_decode(candidate[min(starts):])
                return data
            except json.JSONDecodeError:
                continue
    raise json.JSONDecodeError("JSON inválido", clean, 0)


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


def _escopo(page_ranges: list[dict]) -> str:
    """Canonical key for a chapter selection; the frontend builds the same string."""
    parts = sorted(
        f"{int(r['start'])}-{int(r['end'])}" for r in page_ranges if "start" in r and "end" in r
    )
    return ",".join(parts)[:255]


def _persist_artifact(session: Session, usuario_id: int, livro_id: int, tipo: str, escopo: str, conteudo: Any) -> str:
    """Upsert the generated artifact; returns saved_at as ISO string."""
    row = session.exec(
        select(EstudioArtefato)
        .where(EstudioArtefato.usuario_id == usuario_id)
        .where(EstudioArtefato.livro_id == livro_id)
        .where(EstudioArtefato.tipo == tipo)
        .where(EstudioArtefato.escopo == escopo)
    ).first()
    if row:
        row.conteudo = conteudo
        row.saved_at = utcnow()
    else:
        row = EstudioArtefato(usuario_id=usuario_id, livro_id=livro_id, tipo=tipo, escopo=escopo, conteudo=conteudo)
        session.add(row)
    session.commit()
    return row.saved_at.isoformat()


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
    provider = build_provider(settings, current_user.id, session)

    page_ranges = body.page_ranges or [{"start": 1, "end": livro.paginas or 9999}]
    texto = _extract_pages_text(livro, page_ranges, pdf_service)
    titulo = livro.titulo or "Desconhecido"
    user_content = f"Livro: {titulo}\n\nConteudo:\n{texto}"
    system = SYSTEM_PROMPTS[body.tipo]
    escopo = _escopo(body.page_ranges)
    usuario_id = current_user.id

    if body.tipo == "audio_resumo":
        async def generate():
            texto_gerado = ""
            try:
                async for token in provider.chat(
                    messages=[{"role": "user", "content": user_content}],
                    model=settings.chat_model,
                    system=system,
                    stream=True,
                ):
                    texto_gerado += token
                    yield f"data: {json.dumps({'token': token})}\n\n"
                if texto_gerado.strip():
                    # The request session is closed once streaming starts; open a fresh one.
                    with Session(engine) as stream_session:
                        saved_at = _persist_artifact(
                            stream_session, usuario_id, livro_id, body.tipo, escopo, texto_gerado.strip()
                        )
                    yield f"data: {json.dumps({'saved_at': saved_at})}\n\n"
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
    for _attempt in range(2):  # small models occasionally return an empty completion
        try:
            async for token in provider.chat(
                messages=[{"role": "user", "content": user_content}],
                model=settings.chat_model,
                system=system,
                stream=False,
            ):
                resposta += token
        except ValueError as exc:
            return {"tipo": body.tipo, "content": [], "error": str(exc)}
        if resposta.strip():
            break

    if body.tipo == "mindmap" or body.tipo in TEXT_PROMPTS:
        content = resposta.strip()
        if not content:
            return {"tipo": body.tipo, "content": "", "error": "O modelo devolveu uma resposta vazia"}
        saved_at = _persist_artifact(session, usuario_id, livro_id, body.tipo, escopo, content)
        return {"tipo": body.tipo, "content": content, "escopo": escopo, "saved_at": saved_at}

    try:
        data = _parse_json(resposta)
        if body.tipo == "videos":
            queries = [q for q in data if isinstance(q, str) and q.strip()] if isinstance(data, list) else []
            data = await _search_youtube(queries)
        saved_at = _persist_artifact(session, usuario_id, livro_id, body.tipo, escopo, data)
        return {"tipo": body.tipo, "content": data, "escopo": escopo, "saved_at": saved_at}
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
        .where(EstudioArtefato.tipo != CONTEXTO_TIPO)  # internal chat summary, not a user artifact
    ).all()
    return [
        {"tipo": r.tipo, "escopo": r.escopo, "conteudo": r.conteudo, "saved_at": r.saved_at.isoformat()}
        for r in rows
    ]


@router.post("/estudio/{livro_id}/artifacts/{tipo}")
async def save_artifact(
    livro_id: int,
    tipo: str,
    body: SaveArtifactRequest,
    escopo: str = "",
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if tipo not in VALID_TIPOS | {CHAT_TIPO}:
        raise HTTPException(status_code=400, detail=f"tipo inv\u00e1lido: {tipo}")

    saved_at = _persist_artifact(session, current_user.id, livro_id, tipo, escopo[:255], body.conteudo)
    return {"status": "saved", "tipo": tipo, "escopo": escopo, "saved_at": saved_at}


@router.delete("/estudio/{livro_id}/artifacts/{tipo}")
async def delete_artifact(
    livro_id: int,
    tipo: str,
    escopo: str = "",
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    row = session.exec(
        select(EstudioArtefato)
        .where(EstudioArtefato.livro_id == livro_id)
        .where(EstudioArtefato.usuario_id == current_user.id)
        .where(EstudioArtefato.tipo == tipo)
        .where(EstudioArtefato.escopo == escopo)
    ).first()
    if row:
        session.delete(row)
        session.commit()
    return {"status": "deleted", "tipo": tipo}


# ── Podcast em MP3 (edge-tts + ffmpeg) ───────────────────────────────────────

PODCAST_VOICES = {"Ana": "Francisca", "Beto": "Antonio"}
PODCAST_GAP_SECONDS = 0.35


class PodcastLine(BaseModel):
    speaker: str
    text: str = Field(max_length=2000)


class PodcastMp3Request(BaseModel):
    lines: list[PodcastLine] = Field(min_length=1, max_length=40)


def _podcast_filter(count: int) -> str:
    """Normalize each line's loudness, add a short pause, then concatenate."""
    parts = [
        f"[{i}:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=24000,apad=pad_dur={PODCAST_GAP_SECONDS}[a{i}]"
        for i in range(count)
    ]
    inputs = "".join(f"[a{i}]" for i in range(count))
    return ";".join(parts) + f";{inputs}concat=n={count}:v=0:a=1[out]"


async def _synth_all(items: list[tuple[str, str]], paths: list[Path]) -> None:
    """TTS each (text, voice name) into its path, at most 4 requests at a time."""
    sem = asyncio.Semaphore(4)  # avoid hammering the edge-tts service

    async def synth(text: str, voice: str, path: Path):
        async with sem:
            voice_id = VOICE_MAP.get(voice, VOICE_MAP["Francisca"])
            await edge_tts.Communicate(_corrigir_pronuncia(text.strip()), voice_id, rate="+5%").save(str(path))

    try:
        await asyncio.gather(*(synth(text, voice, path) for (text, voice), path in zip(items, paths)))
    except Exception as exc:
        logger.warning("Falha no TTS: %s", exc)
        raise HTTPException(status_code=502, detail="Falha ao gerar as vozes") from exc


async def _run_ffmpeg(cmd: list[str], error_detail: str) -> None:
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        logger.warning("ffmpeg falhou: %s", stderr.decode(errors="ignore")[:500])
        raise HTTPException(status_code=500, detail=error_detail)


@router.post("/estudio/podcast/mp3")
async def podcast_mp3(
    body: PodcastMp3Request,
    current_user: Usuario = Depends(get_current_user),
):
    if not shutil.which("ffmpeg"):
        raise HTTPException(status_code=503, detail="ffmpeg não está instalado no backend")

    lines = [line for line in body.lines if line.text.strip()]
    if not lines:
        raise HTTPException(status_code=400, detail="Roteiro vazio")

    with tempfile.TemporaryDirectory(prefix="podcast_") as tmp:
        tmp_dir = Path(tmp)
        paths = [tmp_dir / f"{i:03d}.mp3" for i in range(len(lines))]
        await _synth_all([(line.text, PODCAST_VOICES.get(line.speaker, "Francisca")) for line in lines], paths)

        output = tmp_dir / "podcast.mp3"
        cmd = ["ffmpeg", "-y", "-loglevel", "error"]
        for path in paths:
            cmd += ["-i", str(path)]
        cmd += [
            "-filter_complex", _podcast_filter(len(paths)),
            "-map", "[out]", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", str(output),
        ]
        await _run_ffmpeg(cmd, "Falha ao compor o MP3")
        data = output.read_bytes()

    return Response(
        content=data,
        media_type="audio/mpeg",
        headers={"Content-Disposition": 'attachment; filename="podcast.mp3"'},
    )


# ── Vídeo explicativo (slides Pillow + narração edge-tts + ffmpeg) ──────────

VIDEO_SIZE = (1280, 720)
VIDEO_VOICE = "Francisca"
VIDEO_GAP_SECONDS = 0.6
VIDEO_COLORS = {"bg": (248, 250, 252), "fg": (15, 23, 42), "muted": (71, 85, 105),
                "accent": (13, 148, 136), "code_bg": (30, 41, 59), "code_fg": (226, 232, 240)}
_FONT_CANDIDATES = {
    "regular": ["DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "arial.ttf"],
    "bold": ["DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "arialbd.ttf"],
    "mono": ["DejaVuSansMono.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "consola.ttf"],
}


class VideoScene(BaseModel):
    layout: str = "topicos"
    title: str = Field(default="", max_length=200)
    subtitle: str = Field(default="", max_length=300)
    bullets: list[str] = Field(default_factory=list, max_length=8)
    text: str = Field(default="", max_length=600)
    code: str = Field(default="", max_length=2000)
    narration: str = Field(max_length=2000)


class VideoMp4Request(BaseModel):
    scenes: list[VideoScene] = Field(min_length=1, max_length=15)


def _font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for name in _FONT_CANDIDATES[kind]:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    lines, current = [], ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _draw_lines(draw, lines: list[str], font, x: int, y: int, fill, spacing: float = 1.35) -> int:
    line_h = int(font.size * spacing)
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += line_h
    return y


def _render_slide(scene: VideoScene, index: int, total: int, path: Path) -> None:
    w, h = VIDEO_SIZE
    c = VIDEO_COLORS
    img = Image.new("RGB", VIDEO_SIZE, c["bg"])
    draw = ImageDraw.Draw(img)
    margin, max_w = 90, w - 180
    draw.rectangle([0, 0, 14, h], fill=c["accent"])
    draw.text((w - margin, h - 50), f"{index + 1}/{total}", font=_font("regular", 22), fill=c["muted"], anchor="ra")

    if scene.layout == "titulo":
        title_font = _font("bold", 60)
        lines = _wrap(draw, scene.title, title_font, max_w)[:3]
        y = h // 2 - len(lines) * 42 - 30
        y = _draw_lines(draw, lines, title_font, margin, y, c["fg"], 1.25)
        draw.rectangle([margin, y + 15, margin + 120, y + 21], fill=c["accent"])
        _draw_lines(draw, _wrap(draw, scene.subtitle, _font("regular", 32), max_w)[:3], _font("regular", 32),
                    margin, y + 45, c["muted"])
        img.save(path)
        return

    title_font = _font("bold", 46)
    y = _draw_lines(draw, _wrap(draw, scene.title, title_font, max_w)[:2], title_font, margin, 70, c["fg"], 1.2)
    draw.rectangle([margin, y + 10, margin + 90, y + 15], fill=c["accent"])
    y += 50

    if scene.layout == "codigo" and scene.code.strip():
        code_font = _font("mono", 24)
        code_lines = [line[:80] for line in scene.code.strip("\n").splitlines()[:14]]
        box_h = len(code_lines) * int(code_font.size * 1.4) + 50
        draw.rounded_rectangle([margin, y, w - margin, min(y + box_h, h - 80)], radius=16, fill=c["code_bg"])
        _draw_lines(draw, code_lines, code_font, margin + 30, y + 25, c["code_fg"], 1.4)
    elif scene.layout == "destaque" and scene.text.strip():
        text_font = _font("regular", 38)
        lines = _wrap(draw, scene.text, text_font, max_w - 80)[:6]
        box_h = len(lines) * int(text_font.size * 1.4) + 70
        top = max(y, (h - box_h) // 2 + 30)
        draw.rounded_rectangle([margin, top, w - margin, top + box_h], radius=20, fill=(204, 251, 241))
        _draw_lines(draw, lines, text_font, margin + 40, top + 35, c["fg"], 1.4)
    else:  # topicos | recap | fallback
        bullet_font = _font("regular", 34)
        for n, bullet in enumerate(scene.bullets[:6]):
            marker = f"{n + 1}." if scene.layout == "recap" else "•"
            draw.text((margin, y), marker, font=bullet_font, fill=c["accent"])
            y = _draw_lines(draw, _wrap(draw, bullet, bullet_font, max_w - 60)[:2], bullet_font,
                            margin + 55, y, c["fg"], 1.3) + 22
            if y > h - 110:
                break
    img.save(path)


@router.post("/estudio/video/mp4")
async def video_mp4(
    body: VideoMp4Request,
    current_user: Usuario = Depends(get_current_user),
):
    if not shutil.which("ffmpeg"):
        raise HTTPException(status_code=503, detail="ffmpeg não está instalado no backend")

    scenes = [scene for scene in body.scenes if scene.narration.strip()]
    if not scenes:
        raise HTTPException(status_code=400, detail="Roteiro vazio")

    with tempfile.TemporaryDirectory(prefix="video_") as tmp:
        tmp_dir = Path(tmp)
        audios = [tmp_dir / f"{i:03d}.mp3" for i in range(len(scenes))]
        slides = [tmp_dir / f"{i:03d}.png" for i in range(len(scenes))]
        segments = [tmp_dir / f"{i:03d}.mp4" for i in range(len(scenes))]

        await _synth_all([(scene.narration, VIDEO_VOICE) for scene in scenes], audios)
        await asyncio.to_thread(
            lambda: [_render_slide(s, i, len(scenes), p) for i, (s, p) in enumerate(zip(scenes, slides))]
        )

        # One segment per scene with identical codecs, so the concat demuxer can copy streams.
        for slide, audio, segment in zip(slides, audios, segments):
            await _run_ffmpeg([
                "ffmpeg", "-y", "-loglevel", "error",
                "-loop", "1", "-framerate", "24", "-i", str(slide), "-i", str(audio),
                "-af", f"loudnorm=I=-16:TP=-1.5:LRA=11,aresample=24000,apad=pad_dur={VIDEO_GAP_SECONDS}",
                "-shortest", "-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast",
                "-pix_fmt", "yuv420p", "-r", "24", "-c:a", "aac", "-b:a", "96k", "-ac", "1",
                str(segment),
            ], "Falha ao renderizar uma cena do vídeo")

        concat_list = tmp_dir / "list.txt"
        concat_list.write_text("".join(f"file '{s.name}'\n" for s in segments), encoding="utf-8")
        output = tmp_dir / "video.mp4"
        await _run_ffmpeg([
            "ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
            "-i", str(concat_list), "-c", "copy", "-movflags", "+faststart", str(output),
        ], "Falha ao montar o vídeo")
        data = output.read_bytes()

    return Response(
        content=data,
        media_type="video/mp4",
        headers={"Content-Disposition": 'attachment; filename="video.mp4"'},
    )


# ── Chat do Estúdio: resumo salvo como contexto + busca de páginas sob demanda ──

CHAT_TIPO = "chat"  # saved Estúdio conversation per chapter selection (saved, never generated)
CONTEXTO_TIPO = "contexto"  # hidden artifact: dense summary of a chapter selection, reused by the chat
CONTEXTO_SOURCE_CHARS = 14000
BUSCA_MAX_PAGES = 6
BUSCA_PAGE_CHARS = 2000
BUSCA_PREFIX = "BUSCAR:"
RESUMO_EXTRA_PAGES = 3
RESUMO_EXTRA_PAGE_CHARS = 1500

# Adapted from open-notebook's "Dense Summary" (SPR) transformation (MIT)
SYSTEM_CONTEXTO = (
    "Voce cria um resumo denso que sera lido por outro modelo de linguagem, nao por humanos. "
    "Capture o maximo de conceitos, definicoes, regras, exemplos e relacoes com o minimo de palavras, "
    "em frases completas e curtas, agrupadas por topico. Preserve termos tecnicos e trechos de codigo curtos. "
    "Ao final de cada frase, cite a pagina de origem no formato (p. N) usando os marcadores [Pagina N] do conteudo. "
    "Escreva em portugues, independentemente do idioma do conteudo. Maximo 900 palavras. "
    "Retorne apenas o resumo."
)

# Not built on SYSTEM_CHAT: its "say you didn't find it" rule made models refuse instead of asking for a lookup.
SYSTEM_CHAT_RESUMO = (
    "Voce e um assistente de leitura que ajuda o usuario a entender o livro. Responda em portugues, direto e claro."
    "\nO contexto abaixo e um RESUMO dos capitulos selecionados, com referencias (p. N), as vezes seguido de"
    " trechos literais de paginas marcados com [Pagina N]. Prefira os trechos literais para detalhes exatos."
    "\nSe o contexto basta, responda normalmente citando as paginas no formato (p. N)."
    "\nNunca diga que a informacao nao esta no livro: o resumo e parcial, o texto completo pode ser consultado."
    "\nSe a pergunta exigir detalhes que o resumo nao traz (definicao exata, codigo, exemplo, numero, citacao), "
    f"responda APENAS com uma linha no formato '{BUSCA_PREFIX} termo1; termo2' com 1 a 4 termos de busca "
    "(palavras que aparecem no texto do livro, de preferencia no idioma do livro). Nada mais."
)


class EstudioChatRequest(BaseModel):
    message: str = Field(max_length=4000)
    history: list[dict] = Field(default_factory=list)
    page_ranges: list[dict] = Field(min_length=1)


def _read_pages(livro: Livro, page_ranges: list[dict], pdf_service: PDFService) -> list[tuple[int, str]]:
    """All non-empty pages of the selection as (page_number, text)."""
    try:
        file_path = pdf_service.get_file_path(livro.caminho)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Arquivo PDF não encontrado") from exc
    doc = fitz.open(file_path)
    try:
        wanted: set[int] = set()
        for r in page_ranges:
            start, end = max(1, int(r.get("start", 1))), min(int(r.get("end", len(doc))), len(doc))
            wanted.update(range(start, end + 1))
        pages = []
        for number in sorted(wanted):
            text = doc[number - 1].get_text("text").strip()
            if len(text) >= 20:
                pages.append((number, text))
        return pages
    finally:
        doc.close()


def _sample_marked(pages: list[tuple[int, str]], max_chars: int) -> str:
    """Evenly sampled pages with [Pagina N] markers, within max_chars."""
    if not pages:
        return ""
    per_page = max(400, max_chars // len(pages))
    step = max(1, len(pages) * per_page // max_chars) if len(pages) * per_page > max_chars else 1
    return "\n\n".join(f"[Pagina {n}]\n{t[:per_page]}" for n, t in pages[::step])[:max_chars]


def _fold(text: str) -> str:
    """Casefold and strip accents so 'expressao' matches 'Expressão'."""
    return "".join(c for c in unicodedata.normalize("NFKD", text.casefold()) if not unicodedata.combining(c))


_STOPWORDS = {
    "qual", "quais", "como", "onde", "quando", "porque", "sobre", "livro", "exatamente", "mostre", "exemplo",
    "literal", "capitulo", "capitulos", "pagina", "paginas", "explique", "existe", "usado", "usada", "para",
    "esse", "essa", "este", "esta", "isso", "isto", "pelo", "pela", "entre", "mais", "menos", "muito", "voce",
}
# Phrases a model uses when it gives up instead of asking for a lookup
_NOT_FOUND_PREFIXES = ("nao encontrei", "nao ha informac", "o resumo nao", "nao consta", "nao foi possivel encontrar")


def _question_terms(question: str) -> list[str]:
    """Fallback search terms: the question's meaningful words."""
    words = re.findall(r"[\w\-\[\]\\^$.*+?|(){}]{4,}", question)
    seen, terms = set(), []
    for word in words:
        word = word.rstrip(".,;:!?")  # sentence punctuation, not part of a regex token
        key = _fold(word)
        if len(word) >= 4 and key not in _STOPWORDS and key not in seen:
            seen.add(key)
            terms.append(word)
    return terms[:6]


def _search_pages(pages: list[tuple[int, str]], terms: list[str]) -> list[tuple[int, str]]:
    """Top pages by term hits, returned in reading order."""
    folded_terms = [_fold(t) for t in terms if t.strip()]
    scored = []
    for number, text in pages:
        folded = _fold(text)
        hits = sum(folded.count(t) for t in folded_terms)
        if hits:
            scored.append((hits, number, text))
    best = sorted(scored, key=lambda s: -s[0])[:BUSCA_MAX_PAGES]
    return sorted(((n, t) for _, n, t in best), key=lambda p: p[0])


@router.post("/estudio/{livro_id}/chat")
async def estudio_chat(
    livro_id: int,
    body: EstudioChatRequest,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
    pdf_service: PDFService = Depends(get_pdf_service),
):
    livro = session.get(Livro, livro_id)
    if not livro or not livro.caminho:
        raise HTTPException(status_code=404, detail="Livro não encontrado")

    settings = await _get_user_settings(current_user.id, session)
    provider = build_provider(settings, current_user.id, session)
    escopo = _escopo(body.page_ranges)
    usuario_id = current_user.id
    pages = _read_pages(livro, body.page_ranges, pdf_service)
    if not pages:
        raise HTTPException(status_code=422, detail="Não foi possível ler texto dessas páginas")

    saved = session.exec(
        select(EstudioArtefato)
        .where(EstudioArtefato.usuario_id == usuario_id)
        .where(EstudioArtefato.livro_id == livro_id)
        .where(EstudioArtefato.tipo == CONTEXTO_TIPO)
        .where(EstudioArtefato.escopo == escopo)
    ).first()
    resumo = saved.conteudo if saved and isinstance(saved.conteudo, str) else ""
    history = [m for m in body.history if m.get("role") in ("user", "assistant")][-12:]

    def event(payload: dict) -> str:
        return f"data: {json.dumps(payload)}\n\n"

    async def generate():
        nonlocal resumo
        try:
            if not resumo:
                yield event({"status": "Preparando o resumo destes capítulos (só na primeira vez)…"})
                resumo = ""
                async for token in provider.chat(
                    messages=[{"role": "user", "content": _sample_marked(pages, CONTEXTO_SOURCE_CHARS)}],
                    model=settings.chat_model, system=SYSTEM_CONTEXTO, stream=False,
                ):
                    resumo += token
                resumo = resumo.strip()
                if resumo:
                    with Session(engine) as s:
                        _persist_artifact(s, usuario_id, livro_id, CONTEXTO_TIPO, escopo, resumo)

            if resumo:
                # Small models rarely ask for a lookup on their own, so ship the pages that best match
                # the question's words alongside the summary; BUSCAR still covers wording mismatches.
                relevantes = _search_pages(pages, _question_terms(body.message))[:RESUMO_EXTRA_PAGES]
                extras = "".join(
                    f"\n\n[Página {n}]\n{t[:RESUMO_EXTRA_PAGE_CHARS]}" for n, t in relevantes
                )
                content = f"Resumo dos capítulos:\n{resumo}"
                if extras:
                    content += f"\n\nTrechos possivelmente relevantes:{extras}"
                stream = provider.chat(
                    messages=history + [{"role": "user", "content": f"{content}\n\nPergunta: {body.message}"}],
                    model=settings.chat_model, system=SYSTEM_CHAT_RESUMO, stream=True,
                )
                def needs_lookup(head: str) -> bool:
                    folded = _fold(head).lstrip("*_# ")
                    return head.upper().startswith(BUSCA_PREFIX) or folded.startswith(_NOT_FOUND_PREFIXES)

                # Hold back the first ~40 chars: enough to spot a lookup request or a "not found" refusal.
                buffer, decided, wants_search = "", False, False
                async for token in stream:
                    if decided and not wants_search:
                        yield event({"token": token})
                        continue
                    buffer += token
                    if not decided and len(buffer.lstrip()) >= 40:
                        decided, wants_search = True, needs_lookup(buffer.lstrip())
                        if not wants_search:
                            yield event({"token": buffer})
                if not decided:
                    # Short answer, or an empty completion (which falls through to the page lookup).
                    wants_search = not buffer.strip() or needs_lookup(buffer.lstrip())
                    if not wants_search:
                        yield event({"token": buffer})
                if not wants_search:
                    return
                head = buffer.strip()
                terms = (
                    [t.strip() for t in head[len(BUSCA_PREFIX):].split(";") if t.strip()][:4]
                    if head.upper().startswith(BUSCA_PREFIX) else []
                ) or _question_terms(body.message)
            else:
                terms = []

            found = _search_pages(pages, terms) if terms else []
            if found:
                yield event({"status": "Consultando as páginas " + ", ".join(str(n) for n, _ in found) + "…"})
                trechos = "\n\n".join(f"[Página {n}]\n{t[:BUSCA_PAGE_CHARS]}" for n, t in found)
            else:
                trechos = _sample_marked(pages, 12000).replace("[Pagina ", "[Página ")
            contexto = (f"Resumo dos capítulos:\n{resumo}\n\n" if resumo else "") + f"Trechos do livro:\n{trechos}"
            async for token in provider.chat(
                messages=history + [{"role": "user", "content": f"{contexto}\n\nPergunta: {body.message}"}],
                model=settings.chat_model, system=SYSTEM_CHAT, stream=True,
            ):
                yield event({"token": token})
        except Exception as exc:
            logger.warning("Falha no chat do Estúdio: %s", exc)
            yield event({"error": str(exc)})
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers=SSE_HEADERS)
