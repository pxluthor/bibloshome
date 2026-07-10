import base64
import hashlib
import os
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import httpx
from sqlmodel import Session

from .claude_credentials import get_claude_credentials, set_claude_credentials

CLAUDE_OAUTH_SCOPES = [
    "org:create_api_key",
    "user:profile",
    "user:inference",
    "user:sessions:claude_code",
    "user:mcp_servers",
    "user:file_upload",
]
CLAUDE_INFERENCE_SCOPE = "user:inference"
CLAUDE_PROFILE_SCOPE = "user:profile"

CLIENT_ID = os.getenv("CLAUDE_OAUTH_CLIENT_ID", "9d1c250a-e61b-44d9-88ed-5944d1962f5e")
CALLBACK_URL = os.getenv("CLAUDE_OAUTH_CALLBACK_URL", "http://localhost:1456/callback")
AUTH_URL = os.getenv("CLAUDE_OAUTH_AUTHORIZE_URL", "https://claude.com/cai/oauth/authorize")
TOKEN_URL = os.getenv("CLAUDE_OAUTH_TOKEN_URL", "https://platform.claude.com/v1/oauth/token")
BASE_API_URL = os.getenv("CLAUDE_OAUTH_BASE_API_URL", "https://api.anthropic.com")
FLOW_TTL_SECS = 600

_pending_flows: dict[str, dict] = {}
_pending_lock = threading.Lock()
_callback_server: HTTPServer | None = None
_server_lock = threading.Lock()


# ── PKCE helpers ─────────────────────────────────────────────────────────────

def _random_b64url(n_bytes: int) -> str:
    return base64.urlsafe_b64encode(os.urandom(n_bytes)).rstrip(b"=").decode()


def _s256(s: str) -> str:
    digest = hashlib.sha256(s.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


# ── Profile + credentials helpers ────────────────────────────────────────────

def _infer_subscription_type(profile: dict | None) -> str | None:
    if not profile:
        return None
    org = profile.get("organization", {}) or {}
    caps = org.get("capabilities") or []
    if "claude_max" in caps:
        return "max"
    if "claude_pro" in caps:
        return "pro"
    org_type = org.get("organization_type", "")
    if org_type == "enterprise":
        return "enterprise"
    if org_type == "team":
        return "team"
    sub = profile.get("subscription_type") or org.get("subscription_type")
    return str(sub) if sub else None


def _fetch_claude_profile(access_token: str) -> dict | None:
    try:
        resp = httpx.get(
            f"{BASE_API_URL.rstrip('/')}/api/oauth/profile",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if not resp.is_success:
            return None
        return resp.json()
    except Exception:
        return None


def _build_credentials(payload: dict, existing_refresh: str | None, profile: dict | None) -> dict:
    access_token = payload.get("access_token", "")
    if not access_token:
        raise ValueError("Claude OAuth retornou resposta sem access_token.")

    scope_str = payload.get("scope", "")
    scopes = [s for s in scope_str.split() if s] if scope_str else []
    expires_in = payload.get("expires_in")
    expires_at = int(time.time() * 1000) + int(expires_in) * 1000 if expires_in else None

    org = (profile or {}).get("organization", {}) or {}
    account = (profile or {}).get("account") or (profile or {}).get("user") or {}

    def _str(v) -> str | None:
        return str(v).strip() if v and str(v).strip() else None

    return {
        "accessToken": access_token,
        "refreshToken": payload.get("refresh_token") or existing_refresh,
        "scopes": scopes,
        "expiresAt": expires_at,
        "obtainedAt": int(time.time() * 1000),
        "subscriptionType": _infer_subscription_type(profile),
        "rateLimitTier": _str(org.get("rate_limit_tier")),
        "accountEmail": _str(account.get("email")) or _str((profile or {}).get("email")),
        "accountUuid": _str(account.get("uuid")) or _str((profile or {}).get("account_uuid")),
        "organizationUuid": _str(org.get("uuid")) or _str((profile or {}).get("organization_uuid")),
    }


# ── Callback HTTP server ──────────────────────────────────────────────────────

def _render_page(title: str, message: str) -> str:
    return (
        f"<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'/><title>{title}</title>"
        "<style>body{font-family:system-ui,sans-serif;padding:32px;color:#0f172a}"
        ".card{max-width:560px;border:1px solid #d8e4ef;border-radius:16px;padding:24px;background:#f8fbff}"
        "h1{margin:0 0 8px;font-size:22px}p{margin:0;color:#475569}</style></head>"
        f"<body><div class='card'><h1>{title}</h1><p>{message}</p></div>"
        "<script>setTimeout(()=>window.close(),1800);</script></body></html>"
    )


def _complete_flow_thread(code: str, state: str) -> None:
    from database import engine  # importado aqui para evitar circular import

    with Session(engine) as session:
        try:
            complete_claude_flow(code, state, session)
        except Exception as exc:
            print(f"[claude-oauth] Erro ao completar flow em background: {exc}")


class _ClaudeCallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        expected_path = urlparse(CALLBACK_URL).path
        if parsed.path != expected_path:
            self._respond(404, "Not found")
            return

        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        error = params.get("error")
        if error:
            desc = params.get("error_description", error)
            self._respond_html(400, _render_page("Claude OAuth falhou", desc))
            return

        code = params.get("code")
        state = params.get("state")
        if not code or not state:
            self._respond_html(400, _render_page("Claude OAuth incompleto", "A resposta não trouxe code/state."))
            return

        threading.Thread(target=_complete_flow_thread, args=(code, state), daemon=True).start()
        self._respond_html(200, _render_page("Claude conectado", "Autenticado com sucesso! Pode voltar ao app."))

        def _close_server():
            time.sleep(1.5)
            global _callback_server
            with _server_lock:
                if _callback_server:
                    _callback_server.shutdown()
                    _callback_server = None

        threading.Thread(target=_close_server, daemon=True).start()

    def _respond(self, status: int, body: str) -> None:
        encoded = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _respond_html(self, status: int, body: str) -> None:
        encoded = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, fmt, *args):
        pass


def _ensure_callback_server() -> None:
    global _callback_server
    with _server_lock:
        if _callback_server is not None:
            return
        port = int(urlparse(CALLBACK_URL).port or 80)
        server = HTTPServer(("localhost", port), _ClaudeCallbackHandler)
        _callback_server = server
        threading.Thread(target=server.serve_forever, daemon=True).start()


# ── Public API ────────────────────────────────────────────────────────────────

def _cleanup_expired_flows() -> None:
    cutoff = time.time() - FLOW_TTL_SECS
    with _pending_lock:
        expired = [s for s, f in _pending_flows.items() if f["created_at"] < cutoff]
        for s in expired:
            del _pending_flows[s]


def create_claude_oauth_url(user_id: int) -> str:
    _cleanup_expired_flows()
    _ensure_callback_server()

    state = secrets.token_urlsafe(32)
    code_verifier = _random_b64url(48)
    code_challenge = _s256(code_verifier)

    with _pending_lock:
        _pending_flows[state] = {
            "code_verifier": code_verifier,
            "user_id": user_id,
            "created_at": time.time(),
        }

    params = {
        "code": "true",
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": CALLBACK_URL,
        "scope": " ".join(CLAUDE_OAUTH_SCOPES),
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def complete_claude_flow(code: str, state: str, session: Session) -> dict:
    _cleanup_expired_flows()

    with _pending_lock:
        flow = _pending_flows.pop(state, None)

    if not flow:
        raise ValueError("Fluxo Claude OAuth expirado ou inválido. Inicie o login novamente.")

    resp = httpx.post(
        TOKEN_URL,
        json={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": CALLBACK_URL,
            "client_id": CLIENT_ID,
            "code_verifier": flow["code_verifier"],
            "state": state,
        },
        timeout=15,
    )
    if not resp.is_success:
        raise ValueError(f"Falha no token exchange do Claude OAuth ({resp.status_code}): {resp.text[:200]}")

    payload = resp.json()
    access_token = payload.get("access_token", "")
    profile = _fetch_claude_profile(access_token) if access_token else None
    creds = _build_credentials(payload, None, profile)
    set_claude_credentials(flow["user_id"], creds, session)
    return creds


def refresh_claude_if_needed(user_id: int, session: Session) -> dict | None:
    creds = get_claude_credentials(user_id, session)
    if not creds:
        return None

    expires_at = creds.get("expiresAt")
    refresh_token = creds.get("refreshToken")
    if not expires_at or not refresh_token:
        return creds

    # refresh quando expira em menos de 60s
    if expires_at - int(time.time() * 1000) > 60_000:
        return creds

    scopes_without_create = [s for s in CLAUDE_OAUTH_SCOPES if s != "org:create_api_key"]
    try:
        resp = httpx.post(
            TOKEN_URL,
            json={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": CLIENT_ID,
                "scope": " ".join(scopes_without_create),
            },
            timeout=15,
        )
        if not resp.is_success:
            return creds
        payload = resp.json()
        access_token = payload.get("access_token", "")
        profile = _fetch_claude_profile(access_token) if access_token else None
        refreshed = _build_credentials(payload, refresh_token, profile)
        set_claude_credentials(user_id, refreshed, session)
        return refreshed
    except Exception:
        return creds


def get_claude_status(user_id: int, session: Session) -> dict:
    creds = get_claude_credentials(user_id, session)
    scopes = creds.get("scopes", []) if creds else []
    return {
        "authenticated": bool(creds and creds.get("accessToken")),
        "hasAccessToken": bool(creds and creds.get("accessToken")),
        "hasRefreshToken": bool(creds and creds.get("refreshToken")),
        "scopes": scopes,
        "expiresAt": creds.get("expiresAt") if creds else None,
        "obtainedAt": creds.get("obtainedAt") if creds else None,
        "subscriptionType": creds.get("subscriptionType") if creds else None,
        "rateLimitTier": creds.get("rateLimitTier") if creds else None,
        "accountEmail": creds.get("accountEmail") if creds else None,
        "accountUuid": creds.get("accountUuid") if creds else None,
        "organizationUuid": creds.get("organizationUuid") if creds else None,
        "hasInferenceScope": CLAUDE_INFERENCE_SCOPE in scopes,
        "hasProfileScope": CLAUDE_PROFILE_SCOPE in scopes,
    }
