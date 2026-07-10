from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Text


class UserOAuthCodex(SQLModel, table=True):
    __tablename__ = "user_oauth_codex"
    user_id: int = Field(primary_key=True)
    credentials: str = Field(sa_column=Column(Text))
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UserOAuthClaude(SQLModel, table=True):
    __tablename__ = "user_oauth_claude"
    user_id: int = Field(primary_key=True)
    credentials: str = Field(sa_column=Column(Text))
    updated_at: datetime = Field(default_factory=datetime.utcnow)
