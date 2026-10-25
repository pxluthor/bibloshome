import asyncio
import json
import logging
import os
import re
from urllib.parse import urlsplit, urlunsplit

import edge_tts
import fitz  # PyMuPDF
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from ai.providers import (
    get_provider,
    ollama_provider,
    AIProvider,
    CodexOAuthProvider,
    ClaudeOAuthProvider,
)
from oauth.codex_service import get_codex_status
from oauth.claude_service import get_claude_status, refresh_claude_if_needed
from oauth.codex_credentials import get_codex_credentials
from oauth.claude_credentials import get_claude_credentials
from ai.rag import index_book, is_book_indexed, query_book, count_indexed_pages
from auth import get_current_user
from database import engine, get_session
from deep_translator import GoogleTranslator
from services import get_pdf_service, PDFService
from models import (
    Livro,
    LivroIAStatus,
    Usuario,
    UsuarioAISettings,
    UsuarioAISettingsUpdate,
    UsuarioAIProviderAccount,
)

logger = logging.getLogger(__name__)

OLLAMA_DEFAULT_CHAT = os.getenv("OLLAMA_DEFAULT_CHAT_MODEL", "llama3.1:8b")
OPENAI_DEFAULT_CHAT = os.getenv("OPENAI_DEFAULT_CHAT_MODEL", "gpt-4o-mini")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
PROVIDER_ACCOUNT_PREFIX = "account:"

FOR_INSERT_DIR = os.getenv("FOR_INSERT_DIR", "/data/for_insert")
PASTA_BIBLIOTECA = os.getenv("PASTA_BIBLIOTECA", "/data/biblioteca")

# In-memory indexing status tracker — stores {status, pages_indexed, total_pages, error_msg}
indexing_tasks: dict[int, dict] = {}

router = APIRouter(prefix="/ai", tags=["AI"])

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}

SYSTEM_EXTRACT_METADATA = """Você é um assistente especializado em extrair metadados de livros.
Dado o texto das primeiras páginas de um livro/documento PDF, extraia os seguintes campos em JSON puro (sem markdown, sem blocos de código).
Campos: titulo, autor, area (campo de conhecimento/disciplina), ano (int ou null), editora, idioma, sinopse (resumo curto do conteúdo, máx 3 sentenças), paginas (int ou null).
Se um campo não puder ser determinado, use null. Retorne APENAS o JSON, sem explicações."""

SYSTEM_SUMMARIZE = """Você é um assistente de resumo acadêmico. Gere um resumo claro e estruturado do conteúdo fornecido.
O resumo deve incluir: tema principal, principais tópicos abordados, e conclusões ou insights chave.
Escreva em português, seja conciso mas informativo. Máximo 400 palavras."""

SYSTEM_CHAT = """Você é um assistente de leitura que ajuda o usuário a entender o livro que está lendo.
Responda perguntas com base nos trechos relevantes do livro fornecidos no contexto.
Se a resposta não estiver no contexto, diga que não encontrou essa informação no livro.
Seja direto e claro. Responda em português.
CITAÇÕES: cada trecho do contexto vem marcado com [Página N]. Ao final de cada afirmação tirada do livro,
cite a página no formato (p. N). Nunca invente páginas que não aparecem no contexto."""


# ---- HELPERS ----

async def _get_user_settings(user_id: int, session: Session) -> UsuarioAISettings:
    settings = session.exec(
        select(UsuarioAISettings).where(UsuarioAISettings.usuario_id == user_id)
    ).first()
    if not settings:
        settings = UsuarioAISettings(
            usuario_id=user_id,
            provider="ollama",
            chat_model=OLLAMA_DEFAULT_CHAT,
            openai_api_key=None,
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


def build_provider(
    settings: UsuarioAISettings, user_id: int, session: Session
) -> AIProvider:
    """Constrói o provider de chat a partir das settings do usuário.

    Centraliza a lógica dos 4 providers (ollama/openai/codex/claude) para que os
    sites de inferência não divirjam. Credenciais OAuth são buscadas (e
    refreshadas, no caso do Claude) aqui, onde há sessão + usuário.
    """
    provider_name = settings.provider

    if provider_name.startswith(PROVIDER_ACCOUNT_PREFIX):
        try:
            account_id = int(provider_name.removeprefix(PROVIDER_ACCOUNT_PREFIX))
        except ValueError:
            raise HTTPException(status_code=400, detail="Conta de provedor inválida.")
        account = session.get(UsuarioAIProviderAccount, account_id)
        if not account or account.usuario_id != user_id or not account.enabled:
            raise HTTPException(
                status_code=400,
                detail="Conta de provedor não encontrada ou desativada.",
            )
        return get_provider(
            "openai",
            account.api_key,
            account.base_url,
            temperature=account.temperature,
            top_p=account.top_p,
            max_tokens=account.max_tokens,
            reasoning_effort=account.reasoning_effort,
        )

    if provider_name == "codex":
        creds = get_codex_credentials(user_id, session)
        token = creds.get("apiKey") or creds.get("accessToken") if creds else None
        if not token:
            raise HTTPException(
                status_code=400,
                detail="Codex não conectado. Conecte sua conta em Configurações.",
            )
        return CodexOAuthProvider(token=token, account_id=creds.get("accountId"))

    if provider_name == "claude":
        creds = refresh_claude_if_needed(user_id, session) or get_claude_credentials(
            user_id, session
        )
        access_token = creds.get("accessToken") if creds else None
        if not access_token:
            raise HTTPException(
                status_code=400,
                detail="Claude não conectado. Conecte sua conta em Configurações.",
            )
        return ClaudeOAuthProvider(access_token=access_token)

    try:
        return get_provider(provider_name, settings.openai_api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class ProviderAccountCreate(BaseModel):
    name: str
    base_url: str
    api_key: str
    default_model: str
    temperature: float | None = None
    top_p: float | None = None
    max_tokens: int | None = None
    reasoning_effort: str | None = None
    enabled: bool = True


class ProviderAccountUpdate(BaseModel):
    name: str
    base_url: str
    api_key: str | None = None
    default_model: str
    temperature: float | None = None
    top_p: float | None = None
    max_tokens: int | None = None
    reasoning_effort: str | None = None
    enabled: bool = True


class ProviderAccountActivate(BaseModel):
    chat_model: str | None = None


class ProviderAccountDiscover(BaseModel):
    base_url: str
    api_key: str | None = None
    account_id: int | None = None  # editando: usa a chave salva se api_key vier vazia


def _normalize_provider_url(value: str) -> str:
    raw = value.strip().rstrip("/")
    parsed = urlsplit(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(
            status_code=422,
            detail="A URL base deve ser uma URL HTTP ou HTTPS válida.",
        )
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(
            status_code=422,
            detail="A URL base não pode conter credenciais, query ou fragmento.",
        )
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


def _validate_inference_parameters(body: ProviderAccountCreate | ProviderAccountUpdate):
    if body.temperature is not None and not 0 <= body.temperature <= 2:
        raise HTTPException(status_code=422, detail="Temperature deve estar entre 0 e 2.")
    if body.top_p is not None and not 0 <= body.top_p <= 1:
        raise HTTPException(status_code=422, detail="Top P deve estar entre 0 e 1.")
    if body.max_tokens is not None and not 1 <= body.max_tokens <= 131072:
        raise HTTPException(status_code=422, detail="Max tokens deve estar entre 1 e 131072.")
    if body.reasoning_effort not in {None, "low", "medium", "high"}:
        raise HTTPException(status_code=422, detail="Nível de raciocínio inválido.")


def _account_or_404(
    account_id: int, user_id: int, session: Session
) -> UsuarioAIProviderAccount:
    account = session.get(UsuarioAIProviderAccount, account_id)
    if not account or account.usuario_id != user_id:
        raise HTTPException(status_code=404, detail="Conta de provedor não encontrada.")
    return account


def _serialize_account(
    account: UsuarioAIProviderAccount, selected_provider: str
) -> dict:
    return {
        "id": account.id,
        "name": account.nome,
        "provider_type": account.provider_type,
        "base_url": account.base_url,
        "default_model": account.default_model,
        "temperature": account.temperature,
        "top_p": account.top_p,
        "max_tokens": account.max_tokens,
        "reasoning_effort": account.reasoning_effort,
        "enabled": account.enabled,
        "has_api_key": bool(account.api_key),
        "selected": selected_provider == f"{PROVIDER_ACCOUNT_PREFIX}{account.id}",
    }


async def _upsert_ia_status(
    livro_id: int,
    status: str,
    pages_indexed: int = 0,
    error_msg: str | None = None,
):
    with Session(engine) as s:
        row = s.exec(
            select(LivroIAStatus).where(LivroIAStatus.livro_id == livro_id)
        ).first()
        if not row:
            row = LivroIAStatus(livro_id=livro_id)
            s.add(row)
        row.status = status
        row.pages_indexed = pages_indexed
        row.error_msg = error_msg
        s.commit()


# ---- BACKGROUND INDEXER ----

async def _run_index(
    livro_id: int,
    caminho: str,
    page_ranges: list[tuple[int, int]] | None = None,
):
    try:
        # Quick scan to get total pages for progress tracking
        doc = fitz.open(caminho)
        total_pages = len(doc)
        doc.close()

        indexing_tasks[livro_id] = {
            "status": "indexing",
            "pages_indexed": 0,
            "total_pages": total_pages,
        }
        await _upsert_ia_status(livro_id, "indexing")

        async def on_progress(done: int, _total: int) -> None:
            indexing_tasks[livro_id]["pages_indexed"] = done
            await _upsert_ia_status(livro_id, "indexing", pages_indexed=done)

        result = await index_book(
            livro_id, caminho, on_progress=on_progress, page_ranges=page_ranges
        )

        indexing_tasks[livro_id] = {
            "status": "ready",
            "pages_indexed": result["pages_indexed"],
            "total_pages": total_pages,
        }
        await _upsert_ia_status(livro_id, "ready", pages_indexed=result["pages_indexed"])
        logger.info(f"Livro {livro_id} indexado: {result['pages_indexed']} páginas")
    except Exception as e:
        logger.error(f"Erro ao indexar livro {livro_id}: {e}")
        indexing_tasks[livro_id] = {
            "status": "error",
            "pages_indexed": 0,
            "total_pages": 0,
            "error_msg": str(e),
        }
        await _upsert_ia_status(livro_id, "error", error_msg=str(e))


# ---- TTS ----

VOICE_MAP = {
    "Francisca": "pt-BR-FranciscaNeural",
    "Antonio": "pt-BR-AntonioNeural",
    "Thalita": "pt-BR-ThalitaNeural",
}

_PRONUNCIA_PT = {
    r"\bIA\b": "IÁ",
    r"\bIAs\b": "IÁS",
    r"\bIA's\b": "IÁss",
    r"\bLLM\b": "ÉLe Éle M",
    r"\bLLMs\b": "ÉLe Éle ÊMES",
    r"\bAPI\b": "Á P Í",
    r"\bAPIs\b": "Á P ÍS",
    r"\bCPU\b": "C P Ú",
    r"\bGPU\b": "G P Ú",
    r"\bGPT\b": "G P T",
    r"\bJSON\b": "JÊIZON",
    r"\bHTTP\b": "Ága T T P",
}


def _corrigir_pronuncia(texto: str) -> str:
    for padrao, repl in _PRONUNCIA_PT.items():
        texto = re.sub(padrao, repl, texto, flags=re.IGNORECASE)
    return texto


class TTSRequest(BaseModel):
    text: str
    voice: str = "Francisca"
    rate: float = 1.0  # 0.5–2.0 → "-50%" a "+100%"
    translate: bool = False  # Traduzir para PT antes de gerar áudio


# ---- ROUTES ----


@router.get("/providers")
async def list_providers(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    available_ollama = await ollama_provider.is_available()
    ollama_models: list[str] = []
    if available_ollama:
        try:
            ollama_models = await ollama_provider.list_models()
        except Exception:
            pass

    codex_status = get_codex_status(current_user.id, session)
    claude_status = get_claude_status(current_user.id, session)

    # Live model catalogs: the subscriptions retire and add models (e.g. gpt-5.5 disappeared)
    codex_models: list[str] = []
    if codex_status["authenticated"]:
        creds = get_codex_credentials(current_user.id, session) or {}
        token = creds.get("apiKey") or creds.get("accessToken")
        if token:
            codex_models = await CodexOAuthProvider(token, creds.get("accountId")).list_models()
    claude_models: list[str] = []
    if claude_status["authenticated"]:
        creds = refresh_claude_if_needed(current_user.id, session) or {}
        if creds.get("accessToken"):
            claude_models = await ClaudeOAuthProvider(creds["accessToken"]).list_models()

    # Saved model no longer offered: switch to a valid one so the chat keeps working
    settings = await _get_user_settings(current_user.id, session)
    live = {"codex": codex_models, "claude": claude_models}.get(settings.provider)
    if live and settings.chat_model not in live:
        preferred = next((m for m in live if "sonnet" in m), live[0]) if settings.provider == "claude" else live[0]
        logger.info("Modelo %s indisponível em %s; trocando para %s", settings.chat_model, settings.provider, preferred)
        settings.chat_model = preferred
        session.add(settings)
        session.commit()

    return {
        "ollama": {"available": available_ollama, "models": ollama_models},
        "openai": {
            "available": True,
            "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        },
        "codex": {
            "available": codex_status["authenticated"],
            "authenticated": codex_status["authenticated"],
            "hasApiKey": codex_status["hasApiKey"],
            "accountId": codex_status["accountId"],
            "models": codex_models,
        },
        "claude": {
            "available": claude_status["authenticated"],
            "authenticated": claude_status["authenticated"],
            "subscriptionType": claude_status["subscriptionType"],
            "accountEmail": claude_status["accountEmail"],
            "hasInferenceScope": claude_status["hasInferenceScope"],
            "models": claude_models,
        },
    }


@router.get("/settings")
async def get_ai_settings(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    settings = await _get_user_settings(current_user.id, session)
    active_account_id = None
    if settings.provider.startswith(PROVIDER_ACCOUNT_PREFIX):
        try:
            active_account_id = int(
                settings.provider.removeprefix(PROVIDER_ACCOUNT_PREFIX)
            )
        except ValueError:
            pass
    return {
        "provider": settings.provider,
        "chat_model": settings.chat_model,
        "has_openai_key": bool(settings.openai_api_key),
        "active_provider_account_id": active_account_id,
    }


@router.put("/settings")
async def update_ai_settings(
    body: UsuarioAISettingsUpdate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    settings = await _get_user_settings(current_user.id, session)
    allowed_providers = {"ollama", "openai", "codex", "claude"}
    if body.provider.startswith(PROVIDER_ACCOUNT_PREFIX):
        try:
            account_id = int(body.provider.removeprefix(PROVIDER_ACCOUNT_PREFIX))
        except ValueError:
            raise HTTPException(status_code=422, detail="Conta de provedor inválida.")
        account = _account_or_404(account_id, current_user.id, session)
        if not account.enabled:
            raise HTTPException(status_code=400, detail="Esta conta está desativada.")
    elif body.provider not in allowed_providers:
        raise HTTPException(status_code=422, detail="Provedor inválido.")

    settings.provider = body.provider
    settings.chat_model = body.chat_model or (
        OPENAI_DEFAULT_CHAT if body.provider == "openai" else OLLAMA_DEFAULT_CHAT
    )
    if body.openai_api_key is not None:
        settings.openai_api_key = body.openai_api_key or None
    session.add(settings)
    session.commit()
    return {
        "provider": settings.provider,
        "chat_model": settings.chat_model,
        "has_openai_key": bool(settings.openai_api_key),
    }


@router.get("/provider-accounts")
async def list_provider_accounts(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    settings = await _get_user_settings(current_user.id, session)
    accounts = session.exec(
        select(UsuarioAIProviderAccount)
        .where(UsuarioAIProviderAccount.usuario_id == current_user.id)
        .order_by(UsuarioAIProviderAccount.nome)
    ).all()
    return [_serialize_account(account, settings.provider) for account in accounts]


@router.post("/provider-accounts", status_code=201)
async def create_provider_account(
    body: ProviderAccountCreate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    name = body.name.strip()
    api_key = body.api_key.strip()
    default_model = body.default_model.strip()
    if not name or not api_key or not default_model:
        raise HTTPException(
            status_code=422,
            detail="Nome, chave da API e modelo padrão são obrigatórios.",
        )
    _validate_inference_parameters(body)
    duplicate = session.exec(
        select(UsuarioAIProviderAccount).where(
            UsuarioAIProviderAccount.usuario_id == current_user.id,
            UsuarioAIProviderAccount.nome == name,
        )
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Já existe uma conta com esse nome.")

    account = UsuarioAIProviderAccount(
        usuario_id=current_user.id,
        nome=name,
        base_url=_normalize_provider_url(body.base_url),
        api_key=api_key,
        default_model=default_model,
        temperature=body.temperature,
        top_p=body.top_p,
        max_tokens=body.max_tokens,
        reasoning_effort=body.reasoning_effort,
        enabled=body.enabled,
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    settings = await _get_user_settings(current_user.id, session)
    return _serialize_account(account, settings.provider)


@router.put("/provider-accounts/{account_id}")
async def update_provider_account(
    account_id: int,
    body: ProviderAccountUpdate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    account = _account_or_404(account_id, current_user.id, session)
    name = body.name.strip()
    default_model = body.default_model.strip()
    if not name or not default_model:
        raise HTTPException(status_code=422, detail="Nome e modelo padrão são obrigatórios.")
    _validate_inference_parameters(body)
    duplicate = session.exec(
        select(UsuarioAIProviderAccount).where(
            UsuarioAIProviderAccount.usuario_id == current_user.id,
            UsuarioAIProviderAccount.nome == name,
            UsuarioAIProviderAccount.id != account_id,
        )
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Já existe uma conta com esse nome.")

    account.nome = name
    account.base_url = _normalize_provider_url(body.base_url)
    account.default_model = default_model
    account.temperature = body.temperature
    account.top_p = body.top_p
    account.max_tokens = body.max_tokens
    account.reasoning_effort = body.reasoning_effort
    account.enabled = body.enabled
    if body.api_key is not None and body.api_key.strip():
        account.api_key = body.api_key.strip()

    settings = await _get_user_settings(current_user.id, session)
    if not account.enabled and settings.provider == f"{PROVIDER_ACCOUNT_PREFIX}{account.id}":
        settings.provider = "ollama"
        settings.chat_model = OLLAMA_DEFAULT_CHAT
        session.add(settings)
    session.add(account)
    session.commit()
    session.refresh(account)
    return _serialize_account(account, settings.provider)


@router.delete("/provider-accounts/{account_id}", status_code=204)
async def delete_provider_account(
    account_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    account = _account_or_404(account_id, current_user.id, session)
    settings = await _get_user_settings(current_user.id, session)
    if settings.provider == f"{PROVIDER_ACCOUNT_PREFIX}{account.id}":
        settings.provider = "ollama"
        settings.chat_model = OLLAMA_DEFAULT_CHAT
        session.add(settings)
    session.delete(account)
    session.commit()


@router.post("/provider-accounts/{account_id}/activate")
async def activate_provider_account(
    account_id: int,
    body: ProviderAccountActivate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    account = _account_or_404(account_id, current_user.id, session)
    if not account.enabled:
        raise HTTPException(status_code=400, detail="Esta conta está desativada.")
    chosen_model = (body.chat_model or account.default_model).strip()
    if not chosen_model:
        raise HTTPException(status_code=422, detail="Informe um modelo para ativar a conta.")
    settings = await _get_user_settings(current_user.id, session)
    settings.provider = f"{PROVIDER_ACCOUNT_PREFIX}{account.id}"
    settings.chat_model = chosen_model
    session.add(settings)
    session.commit()
    return {
        "provider": settings.provider,
        "chat_model": settings.chat_model,
        "active_provider_account_id": account.id,
    }


@router.post("/provider-accounts/{account_id}/test")
async def test_provider_account(
    account_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    account = _account_or_404(account_id, current_user.id, session)
    try:
        provider = get_provider(
            "openai",
            account.api_key,
            account.base_url,
            temperature=account.temperature,
            top_p=account.top_p,
            max_tokens=account.max_tokens,
            reasoning_effort=account.reasoning_effort,
        )
        try:
            models = await provider.list_models()
            return {"ok": True, "models": models[:100], "model_discovery": True}
        except Exception:
            # Alguns gateways OpenAI-compatible não expõem GET /models.
            # Nesse caso, valida a credencial com uma inferência mínima.
            async for _ in provider.chat(
                messages=[{"role": "user", "content": "Responda apenas OK."}],
                model=account.default_model,
                stream=False,
            ):
                break
            return {
                "ok": True,
                "models": [account.default_model],
                "model_discovery": False,
            }
    except Exception as exc:
        logger.warning("Falha ao testar conta de provedor %s: %s", account.id, exc)
        raise HTTPException(
            status_code=400,
            detail="Não foi possível conectar ao provedor. Verifique URL, chave e disponibilidade do serviço.",
        )


@router.post("/provider-accounts/discover")
async def discover_provider_models(
    body: ProviderAccountDiscover,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Testa URL + chave antes de salvar e devolve os modelos (GET /models)."""
    base_url = _normalize_provider_url(body.base_url)
    api_key = (body.api_key or "").strip()
    if not api_key and body.account_id is not None:
        api_key = _account_or_404(body.account_id, current_user.id, session).api_key
    if not api_key:
        raise HTTPException(status_code=422, detail="Informe a chave da API.")
    try:
        models = await get_provider("openai", api_key, base_url).list_models()
    except Exception as exc:
        logger.warning("Falha ao listar modelos de %s: %s", base_url, exc)
        raise HTTPException(
            status_code=400,
            detail=f"Não foi possível listar os modelos: {str(exc)[:300]}",
        )
    return {"ok": True, "models": models}


class ExtractMetadataRequest(BaseModel):
    caminho: str


@router.post("/extract-metadata")
async def extract_metadata(
    body: ExtractMetadataRequest,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    abs_path = os.path.abspath(body.caminho)
    allowed = [os.path.abspath(FOR_INSERT_DIR), os.path.abspath(PASTA_BIBLIOTECA)]
    if not any(abs_path.startswith(a + os.sep) or abs_path == a for a in allowed):
        raise HTTPException(status_code=403, detail="Caminho fora dos diretórios permitidos")

    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    try:
        doc = fitz.open(abs_path)
        pages_to_read = min(5, len(doc))
        texto = "\n".join(doc[i].get_text("text") for i in range(pages_to_read))
        doc.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler PDF: {e}")

    texto = texto[:4000]

    settings = await _get_user_settings(current_user.id, session)
    provider = build_provider(settings, current_user.id, session)

    resposta = ""
    async for token in provider.chat(
        messages=[{"role": "user", "content": f"Texto do livro:\n\n{texto}"}],
        model=settings.chat_model,
        system=SYSTEM_EXTRACT_METADATA,
        stream=False,
    ):
        resposta += token

    try:
        # Strip possible markdown code fences
        clean = resposta.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        return json.loads(clean)
    except json.JSONDecodeError:
        return {"error": "Não foi possível parsear JSON", "raw": resposta}


@router.post("/summarize/{livro_id}")
async def summarize_book(
    livro_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
    pdf_service: PDFService = Depends(get_pdf_service),
):
    livro = session.get(Livro, livro_id)
    if not livro or not livro.caminho:
        raise HTTPException(status_code=404, detail="Livro não encontrado")

    try:
        file_path = pdf_service.get_file_path(livro.caminho)
    except Exception:
        raise HTTPException(status_code=404, detail="Arquivo PDF não encontrado")

    try:
        doc = fitz.open(file_path)
        total = len(doc)

        if total > 50:
            # Stratified sample: first 5, last 5, 10 spread in middle
            indices = (
                list(range(0, 5))
                + [int(total * i / 10) for i in range(2, 10)]
                + list(range(total - 5, total))
            )
            indices = sorted(set(i for i in indices if 0 <= i < total))
        else:
            indices = list(range(total))

        texto = "\n".join(doc[i].get_text("text") for i in indices)
        doc.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler PDF: {e}")

    texto = texto[:8000]

    settings = await _get_user_settings(current_user.id, session)
    provider = build_provider(settings, current_user.id, session)

    titulo = livro.titulo or "Desconhecido"

    async def generate():
        try:
            async for token in provider.chat(
                messages=[
                    {
                        "role": "user",
                        "content": f"Livro: {titulo}\n\nConteúdo:\n{texto}",
                    }
                ],
                model=settings.chat_model,
                system=SYSTEM_SUMMARIZE,
                stream=True,
            ):
                yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers=SSE_HEADERS)


@router.get("/chat/{livro_id}/status")
async def chat_status(
    livro_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Check in-memory task status first (most up-to-date during active indexing)
    mem = indexing_tasks.get(livro_id)
    if mem and mem.get("status") in ("indexing", "error"):
        return {
            "status": mem["status"],
            "pages_indexed": mem.get("pages_indexed", 0),
            "total_pages": mem.get("total_pages", 0),
            "error_msg": mem.get("error_msg") if mem["status"] == "error" else None,
        }

    # Check persistent status
    row = session.exec(
        select(LivroIAStatus).where(LivroIAStatus.livro_id == livro_id)
    ).first()

    if row and row.status == "error":
        return {"status": "error", "pages_indexed": 0, "total_pages": 0, "error_msg": row.error_msg}

    if row and row.status == "ready":
        return {"status": "ready", "pages_indexed": row.pages_indexed, "total_pages": row.pages_indexed, "error_msg": None}

    # Fallback: check ChromaDB directly
    indexed = is_book_indexed(livro_id)
    if indexed:
        # Use DB value if available, otherwise count from ChromaDB
        pi = row.pages_indexed if (row and row.pages_indexed > 0) else count_indexed_pages(livro_id)
        return {"status": "ready", "pages_indexed": pi, "total_pages": pi, "error_msg": None}

    return {"status": "not_indexed", "pages_indexed": 0, "total_pages": 0, "error_msg": None}


class IndexRequest(BaseModel):
    page_ranges: list[dict] = []  # [{"start": int, "end": int}] — empty = full book


@router.post("/chat/{livro_id}/index")
async def trigger_index(
    livro_id: int,
    background_tasks: BackgroundTasks,
    body: IndexRequest | None = None,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
    pdf_service: PDFService = Depends(get_pdf_service),
):
    if indexing_tasks.get(livro_id, {}).get("status") == "indexing":
        return {"message": "Indexação já em andamento", "livro_id": livro_id}

    livro = session.get(Livro, livro_id)
    if not livro or not livro.caminho:
        raise HTTPException(status_code=404, detail="Livro não encontrado")

    try:
        file_path = pdf_service.get_file_path(livro.caminho)
    except Exception:
        raise HTTPException(status_code=404, detail="Arquivo PDF não encontrado")

    pr = (
        [(r["start"], r["end"]) for r in body.page_ranges if "start" in r and "end" in r]
        if body and body.page_ranges
        else None
    )
    background_tasks.add_task(_run_index, livro_id, file_path, pr)
    return {"message": "Indexação iniciada", "livro_id": livro_id}


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []
    page_ranges: list[dict] = []  # [{"start": int, "end": int}] — optional chapter filter


def _read_chapter_context(
    livro: "Livro",
    page_ranges: list[tuple[int, int]],
    pdf_service: PDFService,
) -> str:
    """Read pages directly from PDF for chapter-scoped context (no ChromaDB needed)."""
    try:
        file_path = pdf_service.get_file_path(livro.caminho)
    except Exception:
        return ""
    try:
        doc = fitz.open(file_path)
        pages: list[tuple[int, str]] = []
        for s, e in page_ranges:
            for i in range(s - 1, min(e, len(doc))):
                text = doc[i].get_text("text").strip()
                if text and len(text) >= 20:
                    pages.append((i + 1, text[:2000]))
        doc.close()
    except Exception:
        return ""

    # Stratified sample if many pages — keep total context manageable
    if len(pages) > 25:
        step = max(1, len(pages) // 25)
        pages = pages[::step][:25]

    full = "\n\n".join(f"[Página {p}]\n{t}" for p, t in pages)
    return full[:12000]  # hard cap


@router.post("/chat/{livro_id}")
async def chat_with_book(
    livro_id: int,
    body: ChatRequest,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
    pdf_service: PDFService = Depends(get_pdf_service),
):
    livro = session.get(Livro, livro_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Livro não encontrado")

    settings = await _get_user_settings(current_user.id, session)
    provider = build_provider(settings, current_user.id, session)

    if body.page_ranges:
        # ── Estúdio mode: lê páginas direto do PDF (sem ChromaDB) ────────────
        pr = [(r["start"], r["end"]) for r in body.page_ranges]
        context = _read_chapter_context(livro, pr, pdf_service)
        if not context:
            async def pdf_err_gen():
                yield f"data: {json.dumps({'error': 'Não foi possível ler o PDF.'})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(pdf_err_gen(), media_type="text/event-stream", headers=SSE_HEADERS)
    else:
        # ── Reader mode: busca semântica no ChromaDB (requer indexação) ──────
        if not is_book_indexed(livro_id):
            async def not_indexed_gen():
                yield f"data: {json.dumps({'error': 'Livro não indexado. Use o Estúdio para indexar.'})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(not_indexed_gen(), media_type="text/event-stream", headers=SSE_HEADERS)
        chunks = await query_book(livro_id, body.message, n_results=5)
        context = "\n\n".join(f"[Página {c['page']}]\n{c['text']}" for c in chunks)

    user_content = f"Contexto do livro:\n{context}\n\nPergunta: {body.message}"
    messages = list(body.history) + [{"role": "user", "content": user_content}]

    async def generate():
        try:
            async for token in provider.chat(
                messages=messages,
                model=settings.chat_model,
                system=SYSTEM_CHAT,
                stream=True,
            ):
                yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers=SSE_HEADERS)


@router.post("/tts")
async def text_to_speech(
    body: TTSRequest,
    current_user: Usuario = Depends(get_current_user),
):
    """Gera áudio MP3 via edge_tts (vozes neurais pt-BR) e retorna como stream."""
    if body.voice not in VOICE_MAP:
        raise HTTPException(status_code=400, detail=f"Voz inválida: {body.voice}. Opções: {list(VOICE_MAP)}")

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texto vazio")

    if body.translate:
        try:
            text = GoogleTranslator(source='auto', target='pt').translate(text)
        except Exception as e:
            logger.warning(f"Falha na tradução Google: {e} — usando texto original")

    text = _corrigir_pronuncia(text)
    voice_id = VOICE_MAP[body.voice]

    # Converter rate float (0.5–2.0) para formato edge_tts: "+10%", "-30%", etc.
    rate_pct = int((body.rate - 1.0) * 100)
    rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"

    async def audio_stream():
        communicate = edge_tts.Communicate(text, voice_id, rate=rate_str)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                yield chunk["data"]

    return StreamingResponse(
        audio_stream(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
