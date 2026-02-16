import os
from typing import Optional

import fitz  # PyMuPDF
from dotenv import load_dotenv
from sqlmodel import Session, select

from database import engine
from models import Livro


load_dotenv()


def gerar_capas_automaticas(base_pdf_path: Optional[str] = None, commit_lote: int = 200):
    """
    Gera capas para livros sem capa.
    - Usa PDF_SOURCE_DIR do .env como fallback para caminhos relativos.
    - Realiza commit em lote para reduzir overhead.
    """
    base_path = base_pdf_path or os.getenv("PDF_SOURCE_DIR", "")
    if base_path:
        base_path = os.path.normpath(base_path)

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

            if os.path.isabs(caminho):
                caminho_completo = caminho
            else:
                if not base_path:
                    print(f"PDF_SOURCE_DIR ausente e caminho relativo: {livro.caminho}")
                    erros += 1
                    continue
                caminho_completo = os.path.join(base_path, caminho)

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
