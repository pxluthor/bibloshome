import os
from pathlib import PureWindowsPath

import fitz  # PyMuPDF
from dotenv import load_dotenv
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

            # Pipeline de capa atual: apenas PDF.
            if os.path.splitext(caminho_completo)[1].lower() != ".pdf":
                ignorados += 1
                continue

            try:
                doc = fitz.open(caminho_completo)
                pagina = doc.load_page(0)
                pix = pagina.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))
                img_bytes = pix.tobytes("jpg")
                doc.close()

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
