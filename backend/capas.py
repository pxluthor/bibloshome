import fitz  # PyMuPDF
from sqlmodel import Session, select
from database import engine
from sqlmodel import Field, SQLModel
from typing import Optional
from datetime import datetime
from sqlalchemy import Column, LargeBinary
import os

class Livro(SQLModel, table=True):
    __tablename__ = "livros"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    titulo: Optional[str]
    autor: Optional[str]
    ano: Optional[int]
    editora: Optional[str]
    genero: Optional[str]
    area: Optional[str]
    idioma: Optional[str]
    paginas: Optional[int]
    sinopse: Optional[str]
    caminho: Optional[str]
    capa: Optional[bytes] = Field(
        default=None,
        sa_column=Column(LargeBinary)
    )
    data_adicao: Optional[datetime] = Field(default_factory=datetime.utcnow)
    # capa: blob is skipped for now as we don't need it for this feature yet




def gerar_capas_automaticas():
    # Defina o caminho base onde os seus PDFs estão guardados
    # Ex: BASE_PDF_PATH = "D:/workstation/bibloshome/backend/pdfs"
    BASE_PDF_PATH = "SEU_CAMINHO_AQUI" 

    with Session(engine) as session:
        # Busca livros que possuem caminho mas não possuem capa
        statement = select(Livro).where(Livro.caminho != None, Livro.capa == None)
        livros = session.exec(statement).all()

        print(f"Processando {len(livros)} livros...")

        for livro in livros:
            caminho_completo = os.path.join(BASE_PDF_PATH, livro.caminho)

            if os.path.exists(caminho_completo):
                try:
                    # Abre o PDF
                    doc = fitz.open(caminho_completo)
                    # Pega a primeira página (index 0)
                    pagina = doc.load_page(0)
                    # Renderiza a página para uma imagem (pixmap)
                    pix = pagina.get_pixmap(matrix=fitz.Matrix(0.5, 0.5)) # 0.5 reduz o tamanho/qualidade para economizar banco
                    # Converte para bytes (formato JPEG)
                    img_bytes = pix.tobytes("jpg")
                    
                    # Salva no campo capa (BLOB)
                    livro.capa = img_bytes
                    session.add(livro)
                    session.commit()
                    print(f"Capa gerada para: {livro.titulo}")
                    
                    doc.close()
                except Exception as e:
                    print(f"Erro ao processar {livro.titulo}: {e}")
            else:
                print(f"Arquivo não encontrado: {livro.caminho}")


# Para rodar, você pode chamar gerar_capas_automaticas()
if __name__ == "__main__":
    gerar_capas_automaticas()