import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from auth import get_current_user
from database import get_session
from models import Usuario

from .claude_credentials import clear_claude_credentials, get_claude_credentials
from .claude_service import (
    BASE_API_URL,
    create_claude_oauth_url,
    get_claude_status,
    refresh_claude_if_needed,
)

router = APIRouter(prefix="/api/claude-oauth", tags=["claude-oauth"])


@router.get("/status")
def claude_status(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    refresh_claude_if_needed(current_user.id, session)
    return get_claude_status(current_user.id, session)


@router.post("/start")
def claude_start(
    current_user: Usuario = Depends(get_current_user),
):
    auth_url = create_claude_oauth_url(current_user.id)
    return {"auth_url": auth_url}


@router.post("/logout")
def claude_logout(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    clear_claude_credentials(current_user.id, session)
    return {"ok": True}


@router.get("/usage")
def claude_usage(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    creds = get_claude_credentials(current_user.id, session)
    if not creds or not creds.get("accessToken"):
        raise HTTPException(status_code=401, detail="Claude não autenticado")

    token = creds["accessToken"]
    try:
        resp = httpx.get(
            f"{BASE_API_URL.rstrip('/')}/api/oauth/usage",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
