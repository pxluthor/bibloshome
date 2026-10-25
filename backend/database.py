from sqlalchemy import inspect, text
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
    echo=False,
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
    _ensure_ai_provider_account_columns()
    _ensure_estudio_artefato_escopo()


def _ensure_estudio_artefato_escopo():
    """Artefatos passam a ser únicos por (usuário, livro, tipo, escopo de páginas)."""
    table_name = "estudio_artefatos"
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns(table_name)}
    uniques = {u["name"] for u in inspector.get_unique_constraints(table_name)}
    with engine.begin() as connection:
        if "escopo" not in columns:
            connection.execute(text(
                f"ALTER TABLE {table_name} ADD COLUMN escopo VARCHAR(255) NOT NULL DEFAULT ''"
            ))
        if "uq_estudio_artefato" in uniques:
            connection.execute(text(f"ALTER TABLE {table_name} DROP INDEX uq_estudio_artefato"))
        if "uq_estudio_artefato_escopo" not in uniques:
            connection.execute(text(
                f"ALTER TABLE {table_name} ADD CONSTRAINT uq_estudio_artefato_escopo "
                "UNIQUE (usuario_id, livro_id, tipo, escopo)"
            ))


def _ensure_ai_provider_account_columns():
    """Adiciona campos novos sem depender de um runner externo de migrations."""
    table_name = "usuario_ai_provider_accounts"
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns(table_name)}
    required = {
        "temperature": "FLOAT NULL",
        "top_p": "FLOAT NULL",
        "max_tokens": "INTEGER NULL",
        "reasoning_effort": "VARCHAR(20) NULL",
    }
    missing = {name: ddl for name, ddl in required.items() if name not in existing}
    if not missing:
        return

    with engine.begin() as connection:
        for name, ddl in missing.items():
            connection.execute(
                text(f"ALTER TABLE {table_name} ADD COLUMN {name} {ddl}")
            )

def get_session():
    with Session(engine) as session:
        yield session
