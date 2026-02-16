from sqlmodel import SQLModel, create_engine, Session
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Ensure we have a database URL, fallback for dev if needed (though user specified MySQL)
if not DATABASE_URL:
    # Default to a local sqlite for safety if env not set, but user asked for MySQL.
    # We will assume user sets it correctly.
    pass

# Configuração robusta do pool de conexões
engine = create_engine(
    DATABASE_URL,
    echo=True,
    pool_size=20,              # Número de conexões principais no pool
    max_overflow=20,           # Número máximo de conexões extras permitidas
    pool_recycle=3600,         # Recicla conexões a cada 1 hora (evita conexões estagnadas)
    pool_pre_ping=True,        # Verifica se a conexão está válida antes de usar
    pool_timeout=30,           # Tempo máximo de espera por uma conexão
    connect_args={
        "charset": "utf8mb4",  # Suporte completo a UTF-8
        "connect_timeout": 10  # Timeout de conexão inicial
    }
)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
