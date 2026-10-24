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

from ai_routes import SSE_HEADERS, VOICE_MAP, _corrigir_pronuncia, _get_user_settings, build_provider
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
    provider = build_provider(settings, current_user.id, session)

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

    if body.tipo == "mindmap" or body.tipo in TEXT_PROMPTS:
        return {"tipo": body.tipo, "content": resposta.strip()}

    try:
        data = json.loads(_strip_markdown_code_fences(resposta))
        if body.tipo == "videos":
            queries = [q for q in data if isinstance(q, str) and q.strip()] if isinstance(data, list) else []
            data = await _search_youtube(queries)
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
        row.saved_at = utcnow()
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
