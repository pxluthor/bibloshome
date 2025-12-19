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

engine = create_engine(DATABASE_URL, echo=True)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
