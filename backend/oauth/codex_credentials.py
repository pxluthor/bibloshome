import json
from datetime import datetime

from sqlalchemy import text
from sqlmodel import Session


def get_codex_credentials(user_id: int, session: Session) -> dict | None:
    row = session.execute(
        text("SELECT credentials FROM user_oauth_codex WHERE user_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    if not row:
        return None
    try:
        creds = json.loads(row[0])
    except Exception:
        return None
    if not creds.get("apiKey") and not creds.get("accessToken"):
        return None
    return creds


def set_codex_credentials(user_id: int, creds: dict, session: Session) -> None:
    session.execute(
        text(
            "INSERT INTO user_oauth_codex (user_id, credentials, updated_at) "
            "VALUES (:uid, :creds, :now) "
            "ON DUPLICATE KEY UPDATE credentials = :creds, updated_at = :now"
        ),
        {"uid": user_id, "creds": json.dumps(creds), "now": datetime.utcnow()},
    )
    session.commit()


def clear_codex_credentials(user_id: int, session: Session) -> None:
    session.execute(
        text("DELETE FROM user_oauth_codex WHERE user_id = :uid"),
        {"uid": user_id},
    )
    session.commit()


def get_codex_bearer_token(user_id: int, session: Session) -> str | None:
    creds = get_codex_credentials(user_id, session)
    if not creds:
        return None
    return creds.get("apiKey") or creds.get("accessToken") or None
