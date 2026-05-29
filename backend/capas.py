import io
import os
from pathlib import PureWindowsPath

import fitz  # PyMuPDF
from dotenv import load_dotenv
from PIL import Image
from sqlmodel import Session, select

from database import engine
from models import Livro


load_dotenv()

PASTA_BIBLIOTECA = os.getenv("PASTA_BIBLIOTECA", "/data/biblioteca")


def _resolver_caminho(caminho: str) -> str:
    """Resolve caminho Windows ou Linux para caminho absoluto no container."""
    if '\\' in caminho:
        win_path = PureWindowsPath(caminho)
        parts = list(win_path.parts)
        # Remove drive (ex: "E:\\") e reconstrói relativo à PASTA_BIBLIOTECA
        if win_path.drive and len(parts) > 1:
            partes_rel = parts[2:] if len(parts) > 2 else parts[1:]
        else:
            partes_rel = parts
        return os.path.abspath(os.path.join(PASTA_BIBLIOTECA, *partes_rel))
    if os.path.isabs(caminho):
        return caminho
    return os.path.abspath(os.path.join(PASTA_BIBLIOTECA, caminho))


def _extrair_capa_epub(caminho: str) -> bytes | None:
    """
    Extrai a imagem de capa de um EPUB.
    Tenta: (1) meta name=cover → item por ID,
           (2) item com propriedade cover-image,
           (3) primeiro item cujo nome contenha 'cover',
           (4) primeira imagem do livro.
    Converte para JPEG e redimensiona para max 400px de largura.
    """
    try:
        from ebooklib import epub, ITEM_IMAGE  # import tardio — opcional
        book = epub.read_epub(caminho, options={'ignore_ncx': True})

        img_bytes: bytes | None = None

        # 1) meta name="cover"
        opf_meta = book.metadata.get('http://www.idpf.org/2007/opf', {}).get('meta', [])
        for entry in opf_meta:
            attrs = entry[1] if isinstance(entry, tuple) and len(entry) > 1 else {}
            if isinstance(attrs, dict) and attrs.get('name') == 'cover':
                item = book.get_item_with_id(attrs.get('content', ''))
                if item:
                    img_bytes = item.get_content()
                    break

        # 2) propriedade cover-image no manifest
        if not img_bytes:
            for item in book.get_items_of_type(ITEM_IMAGE):
                props = getattr(item, 'properties', []) or []
                if 'cover-image' in props:
                    img_bytes = item.get_content()
                    break

        # 3) nome do arquivo contém "cover"
        if not img_bytes:
            for item in book.get_items_of_type(ITEM_IMAGE):
                if 'cover' in item.get_name().lower():
                    img_bytes = item.get_content()
                    break

        # 4) primeira imagem disponível
        if not img_bytes:
            for item in book.get_items_of_type(ITEM_IMAGE):
                img_bytes = item.get_content()
                break

        if not img_bytes:
            return None

        # Converte para JPEG com resize proporcional (max 400px largura)
        img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        max_w = 400
        if img.width > max_w:
            ratio = max_w / img.width
            img = img.resize((max_w, int(img.height * ratio)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=80)
        return buf.getvalue()

    except Exception as exc:
        print(f"Erro ao extrair capa EPUB {caminho}: {exc}")
        return None


def gerar_capas_automaticas(commit_lote: int = 200):
    """
    Gera capas para livros sem capa.
    - Usa _resolver_caminho() para suportar paths Windows e Linux.
    - Realiza commit em lote para reduzir overhead.
    """
    with Session(engine) as session:
        statement = select(Livro).where(Livro.caminho != None, Livro.capa == None)
        livros = session.exec(statement).all()

        print(f"Processando {len(livros)} livros sem capa...")

        geradas = 0
        ignorados = 0
        erros = 0
        pendentes_commit = 0

        for livro in livros:
            caminho = (livro.caminho or "").strip()
            if not caminho:
                ignorados += 1
                continue

            caminho_completo = _resolver_caminho(caminho)

            if not os.path.exists(caminho_completo):
                print(f"Arquivo nao encontrado: {caminho_completo}")
                erros += 1
                continue

            ext = os.path.splitext(caminho_completo)[1].lower()
            img_bytes: bytes | None = None

            try:
                if ext == '.pdf':
                    doc = fitz.open(caminho_completo)
                    pagina = doc.load_page(0)
                    pix = pagina.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))
                    img_bytes = pix.tobytes("jpg")
                    doc.close()
                elif ext == '.epub':
                    img_bytes = _extrair_capa_epub(caminho_completo)
                    if img_bytes is None:
                        ignorados += 1
                        continue
                else:
                    ignorados += 1
                    continue

                livro.capa = img_bytes
                session.add(livro)
                geradas += 1
                pendentes_commit += 1

                if pendentes_commit >= commit_lote:
                    session.commit()
                    pendentes_commit = 0
            except Exception as e:
                print(f"Erro ao processar {livro.titulo}: {e}")
                erros += 1

        if pendentes_commit > 0:
            session.commit()

        resumo = {
            "total_sem_capa": len(livros),
            "geradas": geradas,
            "ignorados": ignorados,
            "erros": erros,
        }
        print(f"Resumo capas: {resumo}")
        return resumo


if __name__ == "__main__":
    gerar_capas_automaticas()
