import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from auth import get_current_user
from database import get_session
from models import Usuario

from .codex_credentials import (
    clear_codex_credentials,
    get_codex_bearer_token,
    get_codex_credentials,
)
from .codex_service import (
    create_codex_oauth_url,
    get_codex_status,
)

CODEX_BACKEND_BASE_URL = "https://chatgpt.com/backend-api/codex"

router = APIRouter(prefix="/api/codex-oauth", tags=["codex-oauth"])


class ProbeBody(BaseModel):
    model: str = "gpt-5.5"


@router.get("/status")
def codex_status(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return get_codex_status(current_user.id, session)


@router.post("/start")
def codex_start(
    current_user: Usuario = Depends(get_current_user),
):
    auth_url = create_codex_oauth_url(current_user.id)
    return {"auth_url": auth_url}


@router.post("/logout")
def codex_logout(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    clear_codex_credentials(current_user.id, session)
    return {"ok": True}


@router.get("/usage")
def codex_usage(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    token = get_codex_bearer_token(current_user.id, session)
    if not token:
        raise HTTPException(status_code=401, detail="Codex não autenticado")
    try:
        resp = httpx.get(
            "https://chatgpt.com/backend-api/wham/usage",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/probe")
def codex_probe(
    body: ProbeBody,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    creds = get_codex_credentials(current_user.id, session)
    if not creds or not (creds.get("apiKey") or creds.get("accessToken")):
        raise HTTPException(status_code=401, detail="Codex não autenticado")

    token = creds.get("apiKey") or creds.get("accessToken")
    account_id = creds.get("accountId")

    # resolve aliases de modelo
    model_map = {"codexplan": "gpt-5.5", "codexspark": "gpt-5.3-codex-spark"}
    model = model_map.get(body.model, body.model)

    headers = {"Authorization": f"Bearer {token}"}
    if account_id:
        headers["chatgpt-account-id"] = account_id

    try:
        resp = httpx.post(
            f"{CODEX_BACKEND_BASE_URL}/responses",
            json={"model": model, "input": "ping", "stream": False},
            headers=headers,
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
