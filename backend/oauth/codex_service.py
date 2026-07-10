import base64
import hashlib
import json
import os
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import httpx
from sqlmodel import Session

from .codex_credentials import get_codex_credentials, set_codex_credentials

CODEX_OAUTH_ISSUER = "https://auth.openai.com"
CODEX_OAUTH_SCOPE = "openid profile email offline_access api.connectors.read api.connectors.invoke"
CODEX_OAUTH_ORIGINATOR = "codex_cli_rs"
CODEX_TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange"
CODEX_ID_TOKEN_SUBJECT_TYPE = "urn:ietf:params:oauth:token-type:id_token"
CODEX_API_KEY_TOKEN_NAME = "openai-api-key"

CLIENT_ID = os.getenv("CODEX_OAUTH_CLIENT_ID", "app_EMoamEEZ73f0CkXaXp7hrann")
CALLBACK_URL = os.getenv("CODEX_OAUTH_CALLBACK_URL", "http://localhost:1455/auth/callback")
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


# ── JWT helpers ───────────────────────────────────────────────────────────────

def decode_jwt_payload(token: str | None) -> dict | None:
    if not token:
        return None
    parts = token.split(".")
    if len(parts) < 2:
        return None
    try:
        padded = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
        normalized = padded.replace("-", "+").replace("_", "/")
        return json.loads(base64.b64decode(normalized).decode())
    except Exception:
        return None


def parse_chatgpt_account_id(token: str | None) -> str | None:
    payload = decode_jwt_payload(token)
    if not payload:
        return None
    nested = payload.get("https://api.openai.com/auth")
    if isinstance(nested, dict):
        account_id = nested.get("chatgpt_account_id")
        if isinstance(account_id, str) and account_id.strip():
            return account_id.strip()
    account_id = payload.get("https://api.openai.com/auth.chatgpt_account_id") or payload.get("chatgpt_account_id")
    if isinstance(account_id, str) and account_id.strip():
        return account_id.strip()
    return None


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
            complete_codex_flow(code, state, session)
        except Exception as exc:
            print(f"[codex-oauth] Erro ao completar flow em background: {exc}")


class _CodexCallbackHandler(BaseHTTPRequestHandler):
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
            self._respond_html(400, _render_page("Codex OAuth falhou", desc))
            return

        code = params.get("code")
        state = params.get("state")
        if not code or not state:
            self._respond_html(400, _render_page("Codex OAuth incompleto", "A resposta não trouxe code/state."))
            return

        threading.Thread(target=_complete_flow_thread, args=(code, state), daemon=True).start()
        self._respond_html(200, _render_page("Codex conectado", "Autenticado com sucesso! Pode voltar ao app."))

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
        pass  # silencioso


def _ensure_callback_server() -> None:
    global _callback_server
    with _server_lock:
        if _callback_server is not None:
            return
        port = int(urlparse(CALLBACK_URL).port or 80)
        # 0.0.0.0 para ser alcançável via porta publicada quando o backend roda em Docker
        server = HTTPServer(("0.0.0.0", port), _CodexCallbackHandler)
        _callback_server = server
        threading.Thread(target=server.serve_forever, daemon=True).start()


# ── Token exchange ────────────────────────────────────────────────────────────

def _exchange_id_token_for_api_key(id_token: str) -> str | None:
    try:
        resp = httpx.post(
            f"{CODEX_OAUTH_ISSUER}/oauth/token",
            data={
                "grant_type": CODEX_TOKEN_EXCHANGE_GRANT,
                "client_id": CLIENT_ID,
                "requested_token": CODEX_API_KEY_TOKEN_NAME,
                "subject_token": id_token,
                "subject_token_type": CODEX_ID_TOKEN_SUBJECT_TYPE,
            },
            timeout=15,
        )
        if not resp.is_success:
            return None
        payload = resp.json()
        api_key = payload.get("access_token")
        return api_key if isinstance(api_key, str) and api_key.strip() else None
    except Exception:
        return None


# ── Public API ────────────────────────────────────────────────────────────────

def _cleanup_expired_flows() -> None:
    cutoff = time.time() - FLOW_TTL_SECS
    with _pending_lock:
        expired = [s for s, f in _pending_flows.items() if f["created_at"] < cutoff]
        for s in expired:
            del _pending_flows[s]


def create_codex_oauth_url(user_id: int) -> str:
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
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": CALLBACK_URL,
        "scope": CODEX_OAUTH_SCOPE,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "id_token_add_organizations": "true",
        "codex_cli_simplified_flow": "true",
        "state": state,
        "originator": CODEX_OAUTH_ORIGINATOR,
    }
    return f"{CODEX_OAUTH_ISSUER}/oauth/authorize?{urlencode(params)}"


def complete_codex_flow(code: str, state: str, session: Session) -> dict:
    _cleanup_expired_flows()

    with _pending_lock:
        flow = _pending_flows.pop(state, None)

    if not flow:
        raise ValueError("Fluxo Codex OAuth expirado ou inválido. Inicie o login novamente.")

    resp = httpx.post(
        f"{CODEX_OAUTH_ISSUER}/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": CALLBACK_URL,
            "client_id": CLIENT_ID,
            "code_verifier": flow["code_verifier"],
        },
        timeout=15,
    )
    if not resp.is_success:
        raise ValueError(f"Falha no token exchange do Codex OAuth ({resp.status_code}): {resp.text[:200]}")

    payload = resp.json()
    access_token = payload.get("access_token", "")
    refresh_token = payload.get("refresh_token")
    id_token = payload.get("id_token")

    if not access_token:
        raise ValueError("Codex OAuth retornou resposta sem access_token.")

    api_key = _exchange_id_token_for_api_key(id_token) if id_token else None

    creds = {
        "apiKey": api_key,
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "idToken": id_token,
        "accountId": parse_chatgpt_account_id(id_token) or parse_chatgpt_account_id(access_token),
        "obtainedAt": int(time.time() * 1000),
    }
    set_codex_credentials(flow["user_id"], creds, session)
    return creds


def get_codex_status(user_id: int, session: Session) -> dict:
    creds = get_codex_credentials(user_id, session)
    return {
        "authenticated": bool(creds and (creds.get("apiKey") or creds.get("accessToken"))),
        "hasApiKey": bool(creds and creds.get("apiKey")),
        "hasAccessToken": bool(creds and creds.get("accessToken")),
        "accountId": creds.get("accountId") if creds else None,
        "obtainedAt": creds.get("obtainedAt") if creds else None,
    }
