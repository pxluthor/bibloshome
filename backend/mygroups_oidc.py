"""Entrar com MyGroups (OpenID Connect, Authorization Code + PKCE S256, client_secret_basic).

O navegador só vê redirecionamentos e um cookie HttpOnly de uso único; tokens do MyGroups ficam no servidor.
"""
import base64
import hashlib
import logging
import os
import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from jose import jwt
from jose.exceptions import JOSEError
from sqlmodel import Session, select

from auth import get_current_user, get_password_hash
from database import get_session
from models import Usuario, UsuarioIdentidade

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/mygroups", tags=["MyGroups OIDC"])

ISSUER = os.getenv("MYGROUPS_ISSUER", "https://mygroups.pxluthor.com.br/oidc")
CLIENT_ID = os.getenv("MYGROUPS_CLIENT_ID", "bibloshome")
CLIENT_SECRET = os.getenv("MYGROUPS_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("MYGROUPS_REDIRECT_URI", "https://library.pxluthor.com.br/api/auth/mygroups/callback")
APP_URL = os.getenv("PUBLIC_APP_URL", "https://library.pxluthor.com.br").rstrip("/")
SCOPES = "openid profile email"
AUTH_TTL = 600         # state/nonce/verifier: 10 min
HANDOFF_TTL = 60       # one-time cookie that becomes a BiblosHome session
HANDOFF_COOKIE = "mg_handoff"

# shortcut: in-memory, one uvicorn process (Dockerfile CMD has no --workers); move to a DB table if that changes
_pending: dict[str, dict] = {}   # state -> {nonce, verifier, exp}
_handoffs: dict[str, dict] = {}  # handoff -> {user_id, exp}


def _purge(store: dict) -> None:
    now = time.time()
    for key in [k for k, v in store.items() if v["exp"] < now]:
        store.pop(key, None)


def _take(store: dict, key: str | None) -> dict | None:
    """Single use: removed on first read, rejected when expired."""
    _purge(store)
    return store.pop(key, None) if key else None


def _fail(reason: str) -> RedirectResponse:
    return RedirectResponse(f"{APP_URL}/login?mygroups_erro={reason}", status_code=302)


async def _discovery(client: httpx.AsyncClient) -> dict:
    r = await client.get(f"{ISSUER}/.well-known/openid-configuration")
    r.raise_for_status()
    meta = r.json()
    if meta.get("issuer") != ISSUER:
        raise ValueError("issuer do discovery não confere")
    return meta


async def _authorize_url(link_user_id: int | None = None) -> str:
    """Authorization URL with fresh state/nonce/PKCE; raises when the provider is unavailable."""
    if not CLIENT_SECRET:
        raise RuntimeError("MYGROUPS_CLIENT_SECRET não configurado")
    async with httpx.AsyncClient(timeout=10) as client:
        meta = await _discovery(client)
    state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    _purge(_pending)
    _pending[state] = {"nonce": nonce, "verifier": verifier, "link_user_id": link_user_id, "exp": time.time() + AUTH_TTL}
    query = urlencode({
        "response_type": "code", "client_id": CLIENT_ID, "redirect_uri": REDIRECT_URI, "scope": SCOPES,
        "state": state, "nonce": nonce, "code_challenge": challenge, "code_challenge_method": "S256",
    })
    return f"{meta['authorization_endpoint']}?{query}"


@router.get("/login")
async def iniciar():
    try:
        return RedirectResponse(await _authorize_url(), status_code=302)
    except Exception as exc:
        logger.warning("MyGroups indisponível (início do login): %s", exc)
        return _fail("indisponivel")


def _identidade(session: Session, sub: str) -> UsuarioIdentidade | None:
    return session.exec(
        select(UsuarioIdentidade).where(UsuarioIdentidade.issuer == ISSUER, UsuarioIdentidade.sub == sub)
    ).first()


@router.get("/link")
def status_vinculo(current_user: Usuario = Depends(get_current_user), session: Session = Depends(get_session)):
    ident = session.exec(select(UsuarioIdentidade).where(
        UsuarioIdentidade.usuario_id == current_user.id, UsuarioIdentidade.issuer == ISSUER)).first()
    return {"vinculado": bool(ident), "desde": ident.criado_em if ident else None}


@router.post("/link")
async def iniciar_vinculo(current_user: Usuario = Depends(get_current_user)):
    """Same-origin call with the BiblosHome login; the page then navigates to the returned URL."""
    try:
        return {"url": await _authorize_url(link_user_id=current_user.id)}
    except Exception as exc:
        logger.warning("MyGroups indisponível (início do vínculo): %s", exc)
        raise HTTPException(status_code=503, detail="O MyGroups está indisponível no momento.")


def _vincular_conta_existente(session: Session, user_id: int, sub: str) -> str:
    """Links the MyGroups identity to an account the user proved (password login). Returns a status code."""
    user = session.get(Usuario, user_id)
    if not user or user.bloqueado:
        return "bloqueado"
    own = session.exec(select(UsuarioIdentidade).where(
        UsuarioIdentidade.usuario_id == user_id, UsuarioIdentidade.issuer == ISSUER)).first()
    ident = _identidade(session, sub)
    if own and own.sub != sub:
        return "outra_conta_mygroups"
    if ident and ident.usuario_id == user_id:
        return "vinculado"
    if ident:
        previous = session.get(Usuario, ident.usuario_id)
        # Only an account created by "Entrar com MyGroups" itself may be absorbed; never a password account
        if not previous or not previous.email.endswith("@mygroups.invalid"):
            return "ja_vinculado"
        ident.usuario_id = user_id
        session.add(ident)
        session.commit()
        from admin_bd_routes import excluir_usuario  # late import: avoids a cycle at startup
        excluir_usuario(session, previous)
        return "vinculado"
    session.add(UsuarioIdentidade(usuario_id=user_id, issuer=ISSUER, sub=sub))
    session.commit()
    return "vinculado"


def _vincular(session: Session, sub: str, claims: dict) -> Usuario:
    """Find or create the local account by (issuer, sub) only; the MyGroups e-mail is never trusted."""
    ident = session.exec(
        select(UsuarioIdentidade).where(UsuarioIdentidade.issuer == ISSUER, UsuarioIdentidade.sub == sub)
    ).first()
    if ident:
        return session.get(Usuario, ident.usuario_id)
    nome = (claims.get("name") or claims.get("preferred_username") or "Leitor MyGroups").strip()[:100]
    user = Usuario(
        nome=nome,
        # .invalid is reserved (RFC 2606): nobody can register or confirm this address with a password
        email=f"{sub}@mygroups.invalid",
        senha_hash=get_password_hash(secrets.token_urlsafe(32)),  # no password login for these accounts
        email_verificado=True,
    )
    session.add(user)
    session.flush()
    session.add(UsuarioIdentidade(usuario_id=user.id, issuer=ISSUER, sub=sub))
    session.commit()
    session.refresh(user)
    return user


@router.get("/callback")
async def callback(request: Request, session: Session = Depends(get_session)):
    params = request.query_params
    pending = _take(_pending, params.get("state"))
    linking = bool(pending and pending.get("link_user_id"))
    fail = (lambda reason: RedirectResponse(f"{APP_URL}/configuracoes?mygroups_erro={reason}", status_code=302))         if linking else _fail
    if params.get("error"):
        return fail("cancelado" if params["error"] == "access_denied" else "recusado")
    if not pending:
        return fail("state_invalido")
    if not params.get("code"):
        return fail("invalido")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            meta = await _discovery(client)
            token_resp = await client.post(
                meta["token_endpoint"],
                data={"grant_type": "authorization_code", "code": params["code"],
                      "redirect_uri": REDIRECT_URI, "code_verifier": pending["verifier"]},
                auth=(CLIENT_ID, CLIENT_SECRET),  # client_secret_basic
            )
            if token_resp.status_code == 400 and token_resp.json().get("error") == "invalid_grant":
                return fail("expirado")
            token_resp.raise_for_status()
            tokens = token_resp.json()
            jwks = (await client.get(meta["jwks_uri"])).raise_for_status().json()

            claims = jwt.decode(
                tokens["id_token"], jwks, algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER,
                access_token=tokens.get("access_token"),  # also checks at_hash when present
            )
            if not secrets.compare_digest(str(claims.get("nonce", "")), pending["nonce"]):
                raise JOSEError("nonce não confere")

            info = (await client.get(meta["userinfo_endpoint"],
                                     headers={"Authorization": f"Bearer {tokens['access_token']}"})).raise_for_status().json()
            if info.get("sub") != claims["sub"]:
                raise JOSEError("sub do userinfo difere do ID token")
    except (JOSEError, KeyError) as exc:
        logger.warning("ID token/userinfo do MyGroups rejeitado: %s", exc)
        return fail("invalido")
    except Exception as exc:
        logger.warning("MyGroups indisponível no callback: %s", exc)
        return fail("indisponivel")

    if pending.get("link_user_id"):
        resultado = _vincular_conta_existente(session, pending["link_user_id"], claims["sub"])
        param = "mygroups" if resultado == "vinculado" else "mygroups_erro"
        return RedirectResponse(f"{APP_URL}/configuracoes?{param}={resultado}", status_code=302)

    user = _vincular(session, claims["sub"], {**info, **claims})
    if user.bloqueado:
        return fail("bloqueado")

    handoff = secrets.token_urlsafe(32)
    _purge(_handoffs)
    _handoffs[handoff] = {"user_id": user.id, "exp": time.time() + HANDOFF_TTL}
    response = RedirectResponse(f"{APP_URL}/login?mygroups=ok", status_code=302)
    response.set_cookie(HANDOFF_COOKIE, handoff, max_age=HANDOFF_TTL, httponly=True, secure=True,
                        samesite="lax", path="/api/auth/mygroups")
    return response


@router.post("/session")
def trocar_por_sessao(request: Request, session: Session = Depends(get_session)):
    """Same-origin call from /login: turns the one-time cookie into the normal BiblosHome session."""
    from routes import _login_payload  # late import: routes imports many routers

    entry = _take(_handoffs, request.cookies.get(HANDOFF_COOKIE))
    user = session.get(Usuario, entry["user_id"]) if entry else None
    if not user or user.bloqueado:
        raise HTTPException(status_code=401, detail="Login com MyGroups expirado. Tente novamente.")
    response = JSONResponse(_login_payload(user))
    response.delete_cookie(HANDOFF_COOKIE, path="/api/auth/mygroups")
    return response
