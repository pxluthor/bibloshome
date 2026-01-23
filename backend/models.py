
from typing import Optional, Dict, Any, List
from sqlmodel import Field, SQLModel
from datetime import datetime
from sqlalchemy import Column, JSON

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
    capa: Optional[bytes] = Field(default=None)  
    data_adicao: Optional[datetime] = Field(default_factory=datetime.utcnow)
    # capa: blob is skipped for now as we don't need it for this feature yet

class LivroRead(SQLModel):
    id: int
    titulo: Optional[str]
    autor: Optional[str]
    ano: Optional[int]
    genero: Optional[str]
    idioma: Optional[str]
    paginas: Optional[int]
    area: Optional[str]
    editora: Optional[str]
    sinopse: Optional[str]
    caminho: Optional[str]

class LivroUpdate(SQLModel):
    titulo: Optional[str] = None
    autor: Optional[str] = None
    area: Optional[str] = None
    caminho: Optional[str] = None
    editora: Optional[str] = None
    ano: Optional[int] = None
    paginas: Optional[int] = None
    genero: Optional[str] = None
    idioma: Optional[str] = None
    sinopse: Optional[str] = None

# --- USUÁRIOS ---
class Usuario(SQLModel, table=True):
    __tablename__ = "usuario"

    id: Optional[int] = Field(default=None, primary_key=True)
    nome: str
    email: str = Field(unique=True, index=True)
    senha_hash: str
    is_admin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

# --- LISTA DE LEITURA ---
class ListaLeitura(SQLModel, table=True):
    __tablename__ = "listaleitura" 

    id: Optional[int] = Field(default=None, primary_key=True)
    usuario_id: int = Field(foreign_key="usuario.id")
    livro_id: int = Field(foreign_key="livros.id") 
    status: str = Field(default="quero_ler") 
    data_adicao: datetime = Field(default_factory=datetime.utcnow)

class ListaLeituraUpdate(SQLModel):
    status: str

# Modelos Pydantic para validação de entrada (Request Body)
class UsuarioCreate(SQLModel):
    nome: str
    email: str
    senha: str
    is_admin: bool = Field(default=False)

class UsuarioLogin(SQLModel):
    email: str
    senha: str


class Anotacao(SQLModel, table=True):
    __tablename__ = "anotacoes"

    id: Optional[int] = Field(default=None, primary_key=True)
    usuario_id: int = Field(foreign_key="usuario.id")
    livro_id: int = Field(foreign_key="livros.id")
    
    # Campo JSON para armazenar o objeto complexo do frontend
    dados_json: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column_kwargs={"onupdate": datetime.utcnow}
    )

# Modelo para validação do que o frontend envia
class AnotacaoUpdate(SQLModel):
    bookmarks: List[int]
    notes: Dict[str, str]
    highlights: Dict[str, Any]
    lastPage: Optional[int] = None
    totalPages: Optional[int] = None

# --- PEDIDOS DE LIVROS ---
class PedidoLivro(SQLModel, table=True):
    __tablename__ = "pedidos_livros"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    usuario_id: int = Field(foreign_key="usuario.id")
    titulo: str
    autor: str
    editora: str
    status: str = Field(default="pendente")  # pendente, em_analise, aprovado, recusado
    data_criacao: datetime = Field(default_factory=datetime.utcnow)
    data_atualizacao: datetime = Field(default_factory=datetime.utcnow)
    observacoes: Optional[str] = Field(default=None)

# Modelos Pydantic para validação de pedidos
class PedidoLivroCreate(SQLModel):
    titulo: str
    autor: str
    editora: str
    observacoes: Optional[str] = None

class PedidoLivroUpdate(SQLModel):
    status: str  # pendente, em_analise, aprovado, recusado
