import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Body, Response, Query, Header, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)
logger = logging.getLogger(__name__)
from fastapi.responses import FileResponse
from sqlmodel import Session, select, func
import hashlib
import re
import secrets
from datetime import timedelta
import unicodedata
from datetime import timezone
from pydantic import BaseModel, Field
from sqlalchemy import String, and_, case, cast, or_, func as sa_func
from sqlalchemy.orm import defer
from typing import List, Optional
from datetime import datetime
from database import get_session
from models import utcnow, Feedback, LivroAcesso, Usuario, UsuarioCreate, UsuarioLogin, ListaLeitura, ListaLeituraUpdate, ColecaoLivro, ColecaoLivroItem, ColecaoLivroCreate, Livro, Anotacao, AnotacaoUpdate, LivroRead, LivroUpdate, PedidoLivro, PedidoLivroCreate, PedidoLivroUpdate
from mailer import email_configurado, enviar_codigo_verificacao
from services import get_pdf_service, get_translation_service, PDFService, TranslationService
from auth import get_password_hash, verify_password, create_access_token, get_current_user, oauth2_scheme

router = APIRouter()

# --- Cache TTL em memória para genres e tags (raramente mudam) ---
_genres_cache: dict = {"data": None, "ts": 0.0}
_tags_cache: dict = {"data": None, "ts": 0.0}
_CACHE_TTL = 1800  # 30 minutos

# Whitelist de status válidos para lista de leitura
VALID_READING_STATUSES = {"quero_ler", "lendo", "lido"}


@router.get("/documents/genres")
def list_genres(current_user: Usuario = Depends(get_current_user), session: Session = Depends(get_session)):
    global _genres_cache
    if _genres_cache["data"] is not None and time.time() - _genres_cache["ts"] < _CACHE_TTL:
        return _genres_cache["data"]
    rows = session.exec(select(Livro.genero).where(Livro.genero != None).distinct()).all()
    result = sorted([r for r in rows if r])
    _genres_cache = {"data": result, "ts": time.time()}
    return result


@router.get("/documents/tags")
def list_tags(current_user: Usuario = Depends(get_current_user), session: Session = Depends(get_session)):
    """Retorna todas as tags distintas usadas nos livros."""
    global _tags_cache
    if _tags_cache["data"] is not None and time.time() - _tags_cache["ts"] < _CACHE_TTL:
        return _tags_cache["data"]
    livros = session.exec(select(Livro.tags).where(Livro.tags != None)).all()
    all_tags: set = set()
    for tags in livros:
        if isinstance(tags, list):
            all_tags.update(tags)
    result = sorted(all_tags)
    _tags_cache = {"data": result, "ts": time.time()}
    return result


@router.get("/documents/folders")
def list_folders(current_user: Usuario = Depends(get_current_user), session: Session = Depends(get_session)):
    """Retorna arvore de pastas derivada das areas dos livros."""
    areas = session.exec(
        select(Livro.area).where(Livro.area != None, Livro.area != "").distinct()
    ).all()
    seen: set = set()
    entries = []
    for area in sorted(areas):
        if not area:
            continue
        parts = [p.strip() for p in area.split("/")]
        for i in range(len(parts)):
            rel = " / ".join(parts[: i + 1])
            if rel not in seen:
                seen.add(rel)
                entries.append({"rel": rel, "depth": i, "nome": parts[i]})
    result = [{"rel": "", "depth": 0, "nome": "Todos os livros"}]
    result.extend(sorted(entries, key=lambda x: x["rel"].lower()))
    return result

# ── Busca do acervo ──────────────────────────────────────────────────────────
# Collation utf8mb4_unicode_ci already ignores case and accents in LIKE comparisons.

# Phrases/words searched as equivalents (accent-free, lowercase). Longer phrases are matched first.
SEARCH_SYNONYMS = [
    ["aprendizado de maquina", "machine learning"],
    ["aprendizado profundo", "deep learning"],
    ["ciencia de dados", "data science"],
    ["inteligencia artificial", "artificial intelligence"],
    ["redes neurais", "neural networks", "neural network"],
    ["processamento de linguagem natural", "natural language processing", "nlp"],
    ["visao computacional", "computer vision"],
    ["banco de dados", "database", "databases"],
    ["engenharia de software", "software engineering"],
    ["estrutura de dados", "estruturas de dados", "data structures"],
    ["algebra linear", "linear algebra"],
    ["expressoes regulares", "expressao regular", "regular expressions", "regex"],
    ["dados", "data"],
    ["programacao", "programming"],
    ["algoritmos", "algoritmo", "algorithms"],
    ["calculo", "calculus"],
    ["estatistica", "statistics"],
    ["probabilidade", "probability"],
    ["matematica", "mathematics", "math"],
    ["fisica", "physics"],
    ["quimica", "chemistry"],
    ["astronomia", "astronomy"],
    ["historia", "history"],
    ["filosofia", "philosophy"],
    ["teologia", "theology"],
    ["biblia", "bible"],
    ["economia", "economics"],
    ["seguranca", "security"],
    ["redes de computadores", "computer networks"],
]
SEARCH_STOPWORDS = {"de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "para", "com", "por", "um", "uma",
                    "the", "of", "and", "in", "for", "to", "on", "with"}
_SYNONYM_PHRASES = sorted(
    ((phrase, group) for group in SEARCH_SYNONYMS for phrase in group), key=lambda p: -len(p[0])
)


def _fold_search(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text.casefold()) if not unicodedata.combining(c))


def _search_tokens(search: str) -> list[list[str]]:
    """Each token is a list of alternatives; every token must match (AND), any alternative may (OR)."""
    text = " " + re.sub(r"\s+", " ", _fold_search(search)).strip() + " "
    tokens: list[list[str]] = []
    for phrase, group in _SYNONYM_PHRASES:
        if f" {phrase} " in text:
            tokens.append(list(group))
            text = text.replace(f" {phrase} ", " ")
    for word in text.split():
        word = word.strip(".,;:!?\"'()")
        if word and word not in SEARCH_STOPWORDS:
            tokens.append([word])
    return tokens[:8]


def _like(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _match(column, alt: str):
    # Very short terms ("ia", "c", "r") would match inside any word: require word boundaries.
    if len(alt) <= 2:
        return sa_func.regexp_like(column, f"\\b{re.escape(alt)}\\b", "i")
    return column.like(_like(alt), escape="\\")


_SEARCH_FIELDS = (Livro.titulo, Livro.autor, Livro.area, cast(Livro.tags, String))


def _token_filter(alts: list[str]):
    return or_(*(_match(field, alt) for alt in alts for field in _SEARCH_FIELDS))


def _relevance(search: str, tokens: list[list[str]]):
    """Integer score used only for ordering."""
    full = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    score = (
        case((Livro.titulo.like(f"{full}%", escape="\\"), 100), else_=0)
        + case((Livro.titulo.like(f"%{full}%", escape="\\"), 60), else_=0)
    )
    for alts in tokens:
        score = score + case((or_(*(_match(Livro.titulo, a) for a in alts)), 10), else_=0)
        score = score + case((or_(*(_match(Livro.autor, a) for a in alts)), 8), else_=0)
        score = score + case((or_(*(_match(Livro.area, a) for a in alts)), 3), else_=0)
    return score


@router.get("/documents")
def list_documents(
    page: int = Query(1, ge=1),
    limit: int = Query(8, ge=1, le=100),
    search: str = Query(""),
    genre: str = Query(""),
    tag: str = Query(""),
    area: str = Query(""),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    query = select(Livro).options(defer(Livro.capa))  # covers are served by /cover; skip the blob here
    tokens = _search_tokens(search) if search.strip() else []
    if tokens:
        query = query.where(and_(*(_token_filter(alts) for alts in tokens)))
    if genre:
        query = query.where(Livro.genero == genre)
    if tag:
        query = query.where(sa_func.json_contains(Livro.tags, f'"{tag}"'))
    if area:
        query = query.where(
            or_(Livro.area == area, Livro.area.startswith(area + " / "))
        )

    # Ordenação: sem busca → livros mais completos primeiro (capa + autor + genero)
    #            com busca → relevância (frase no título > palavras no título > autor > pasta/tags)
    total = session.exec(select(func.count()).select_from(query.subquery())).one()
    if tokens:
        query = query.order_by(_relevance(search.strip(), tokens).desc(), (Livro.capa != None).desc(), Livro.id)
    else:
        query = query.order_by(
            (Livro.capa != None).desc(),
            (Livro.autor != None).desc(),
            (Livro.genero != None).desc(),
        )

    items = session.exec(query.offset((page - 1) * limit).limit(limit)).all()

    return {"items": [LivroRead.model_validate(i) for i in items], "total": total, "page": page, "limit": limit}

def _get_user_from_token_or_header(
    url_token: Optional[str] = Query(default=None, alias="token"),
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
) -> Usuario:
    """Aceita JWT via query param ?token= (para range requests nativos do browser)
    ou via header Authorization: Bearer (padrão da API).
    O OAuth2PasswordBearer padrão exige header obrigatório — aqui os dois são opcionais."""
    from auth import SECRET_KEY, ALGORITHM
    from jose import jwt, JWTError

    # Extrai token: prioriza query param (range requests do browser não enviam headers)
    header_token = None
    if authorization and authorization.startswith("Bearer "):
        header_token = authorization[7:]

    raw = url_token or header_token
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(raw, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = session.exec(select(Usuario).where(Usuario.email == email)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/documents/{doc_id}/file")
def get_document_file(
    doc_id: int,
    current_user: Usuario = Depends(_get_user_from_token_or_header),
    session: Session = Depends(get_session),
    pdf_service: PDFService = Depends(get_pdf_service)
):
    livro = session.get(Livro, doc_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = pdf_service.get_file_path(livro.caminho)
    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=f"{livro.titulo or doc_id}.pdf",
        headers={"Cache-Control": "private, max-age=3600"},  # cache 1h no browser
    )

@router.get("/documents/{doc_id}/epub")
def get_epub_file(
    doc_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
    pdf_service: PDFService = Depends(get_pdf_service),
):
    livro = session.get(Livro, doc_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Livro não encontrado")
    file_path = pdf_service.get_file_path(livro.caminho)
    if not file_path.lower().endswith(".epub"):
        raise HTTPException(status_code=400, detail="Este livro não é um EPUB")
    return FileResponse(
        file_path,
        media_type="application/epub+zip",
        filename=f"{livro.titulo or doc_id}.epub",
    )


@router.get("/documents/{doc_id}/details", response_model=LivroRead)
def get_book_details(
    doc_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Retorna detalhes completos de um livro. Admin vê o caminho; outros usuários veem os metadados."""
    livro = session.get(Livro, doc_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Livro não encontrado")
    
    return LivroRead.model_validate(livro)

@router.put("/documents/{doc_id}/update")
def update_book(
    doc_id: int,
    book_update: LivroUpdate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Atualiza os dados de um livro (apenas admin)"""
    # Verifica se é admin
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores.")
    
    livro = session.get(Livro, doc_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Livro não encontrado")
    
    # Atualiza apenas os campos fornecidos
    update_data = book_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(livro, key, value)
    
    session.add(livro)
    session.commit()

    # Invalida caches de genres e tags caso tenham mudado
    global _genres_cache, _tags_cache
    _genres_cache["data"] = None
    _tags_cache["data"] = None

    return {"message": "Livro atualizado com sucesso", "livro": LivroRead.model_validate(livro)}

@router.post("/documents/{doc_id}/page/{page_number}/translate")
def translate_page(
    doc_id: int,
    page_number: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
    pdf_service: PDFService = Depends(get_pdf_service),
    translation_service: TranslationService = Depends(get_translation_service)
):
    livro = session.get(Livro, doc_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Document not found")
    
    file_path = pdf_service.get_file_path(livro.caminho)
    original_text = pdf_service.extract_text(file_path, page_number)
    translated_text = translation_service.translate(original_text)
    
    return {
        "original_text": original_text,
        "translated_text": translated_text,
        "page": page_number
    }


# --- 1. REGISTRO DE USUÁRIO ---
@router.post("/auth/register", status_code=201)
@limiter.limit("5/minute")
def register(request: Request, user: UsuarioCreate, session: Session = Depends(get_session)):
    email = user.email.strip().lower()
    if len(user.senha) < 6:
        raise HTTPException(status_code=400, detail="A senha precisa ter pelo menos 6 caracteres")
    existing_user = session.exec(select(Usuario).where(Usuario.email == email)).first()
    if existing_user and existing_user.email_verificado:
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    verificar = email_configurado()
    if not verificar:
        logger.warning("SMTP não configurado: cadastro de %s sem verificação de e-mail", email)
    # Unverified account with the same e-mail: restart the sign-up instead of locking the address
    novo_usuario = existing_user or Usuario(email=email, is_admin=False)
    novo_usuario.nome = user.nome
    novo_usuario.senha_hash = get_password_hash(user.senha)
    novo_usuario.email_verificado = not verificar
    session.add(novo_usuario)
    session.commit()
    if verificar:
        _enviar_otp(novo_usuario, session)
    return {"message": "Usuário criado com sucesso", "verificar_email": verificar}


OTP_VALIDADE_MIN = 10
OTP_MAX_TENTATIVAS = 5


def _otp_hash(user_id: int, codigo: str) -> str:
    return hashlib.sha256(f"{user_id}:{codigo}".encode()).hexdigest()


def _enviar_otp(usuario: Usuario, session: Session) -> None:
    codigo = f"{secrets.randbelow(10**6):06d}"
    usuario.otp_hash = _otp_hash(usuario.id, codigo)
    usuario.otp_expira = utcnow() + timedelta(minutes=OTP_VALIDADE_MIN)
    usuario.otp_tentativas = 0
    session.add(usuario)
    session.commit()
    try:
        enviar_codigo_verificacao(usuario.email, usuario.nome, codigo, OTP_VALIDADE_MIN)
    except Exception as exc:
        logger.error("Falha ao enviar código para %s: %s", usuario.email, exc)
        raise HTTPException(status_code=502, detail="Não foi possível enviar o e-mail com o código. Tente novamente.")


def _login_payload(user: Usuario) -> dict:
    return {
        "access_token": create_access_token(data={"sub": user.email}),
        "token_type": "bearer",
        "user_name": user.nome,
        "user_id": user.id,
        "is_admin": user.is_admin,
    }


class VerificarEmailBody(BaseModel):
    email: str
    codigo: str = Field(min_length=6, max_length=6)


class ReenviarCodigoBody(BaseModel):
    email: str


@router.post("/auth/verify-email")
@limiter.limit("10/minute")
def verificar_email(request: Request, body: VerificarEmailBody, session: Session = Depends(get_session)):
    """Confirms the sign-up code and logs the user in."""
    user = session.exec(select(Usuario).where(Usuario.email == body.email.strip().lower())).first()
    invalido = HTTPException(status_code=400, detail="Código inválido ou expirado.")
    if not user or user.email_verificado or not user.otp_hash:
        raise invalido
    expira = user.otp_expira
    if expira and expira.tzinfo is None:
        expira = expira.replace(tzinfo=timezone.utc)  # MySQL DATETIME comes back naive (stored as UTC)
    if not expira or expira < utcnow() or user.otp_tentativas >= OTP_MAX_TENTATIVAS:
        raise HTTPException(status_code=400, detail="Código expirado ou tentativas esgotadas. Peça um novo código.")
    if not secrets.compare_digest(user.otp_hash, _otp_hash(user.id, body.codigo.strip())):
        user.otp_tentativas += 1
        session.add(user)
        session.commit()
        raise invalido
    user.email_verificado = True
    user.otp_hash = None
    user.otp_expira = None
    user.otp_tentativas = 0
    session.add(user)
    session.commit()
    return _login_payload(user)


@router.post("/auth/resend-code")
@limiter.limit("3/minute")
def reenviar_codigo(request: Request, body: ReenviarCodigoBody, session: Session = Depends(get_session)):
    user = session.exec(select(Usuario).where(Usuario.email == body.email.strip().lower())).first()
    if user and not user.email_verificado and email_configurado():
        _enviar_otp(user, session)
    # Same answer whether the account exists or not: no e-mail enumeration
    return {"message": "Se houver um cadastro pendente para este e-mail, um novo código foi enviado."}

# --- 2. LOGIN (GERAR TOKEN) ---
@router.post("/auth/login")
@limiter.limit("10/minute")
def login(request: Request, user_data: UsuarioLogin, session: Session = Depends(get_session)):
    # Busca usuário pelo email
    user = session.exec(select(Usuario).where(Usuario.email == user_data.email.strip().lower())).first()
    
    # Valida senha
    if not user or not verify_password(user_data.senha, user.senha_hash):
        raise HTTPException(status_code=400, detail="Email ou senha incorretos")
    if user.bloqueado:
        raise HTTPException(status_code=403, detail="Acesso bloqueado. Fale com o administrador.")
    if not user.email_verificado:
        raise HTTPException(status_code=403, detail="E-mail ainda não confirmado.")
    
    # Gera Token
    access_token = create_access_token(data={"sub": user.email})
    
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "user_name": user.nome,
        "user_id": user.id,
        "is_admin": user.is_admin
    }

class ResetPasswordBody(BaseModel):
    token: str
    senha: str


@router.post("/auth/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, body: ResetPasswordBody, session: Session = Depends(get_session)):
    """Sets a new password from a one-time link an admin generated (no e-mail server)."""
    if len(body.senha) < 6:
        raise HTTPException(status_code=400, detail="A senha precisa ter pelo menos 6 caracteres")
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    user = session.exec(select(Usuario).where(Usuario.reset_token_hash == token_hash)).first()
    expira = user.reset_expira if user else None
    if expira and expira.tzinfo is None:
        expira = expira.replace(tzinfo=timezone.utc)  # MySQL DATETIME comes back naive (stored as UTC)
    if not user or not expira or expira < utcnow():
        raise HTTPException(status_code=400, detail="Link inválido ou expirado. Peça um novo ao administrador.")
    user.senha_hash = get_password_hash(body.senha)
    user.reset_token_hash = None
    user.reset_expira = None
    session.add(user)
    session.commit()
    return {"message": "Senha redefinida. Faça login com a nova senha."}


# --- 3. ADICIONAR LIVRO À LISTA ---
@router.post("/my-list/add2")
def add_to_listold(
    livro_id: int, 
    status: str = "quero_ler", # Opcional, padrão 'quero_ler'
    current_user: Usuario = Depends(get_current_user), # <--- Proteção via Token
    session: Session = Depends(get_session)
):
    # Verifica se o livro existe
    livro = session.get(Livro, livro_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Livro não encontrado")

    # Verifica duplicidade na lista do usuário
    check = session.exec(select(ListaLeitura).where(
        ListaLeitura.usuario_id == current_user.id,
        ListaLeitura.livro_id == livro_id
    )).first()
    
    if check:
        return {"message": "Este livro já está na sua lista", "status": "error"}
    
    novo_item = ListaLeitura(
        usuario_id=current_user.id, 
        livro_id=livro_id,
        status=status
    )
    session.add(novo_item)
    session.commit()
    return {"message": "Livro adicionado à lista", "status": "success"}

@router.post("/my-list/add/{livro_id}")
def add_to_list(livro_id: int, current_user: Usuario = Depends(get_current_user), session: Session = Depends(get_session)):
    check = session.exec(select(ListaLeitura).where(ListaLeitura.usuario_id == current_user.id, ListaLeitura.livro_id == livro_id)).first()
    if check: return {"message": "Já está na lista"}
    novo = ListaLeitura(usuario_id=current_user.id, livro_id=livro_id)
    session.add(novo)
    session.commit()
    return {"status": "success"}

# Atualizar status de leitura (Ex: quero_ler -> lendo -> concluido)
@router.put("/my-list/{livro_id}/status")
def update_list_status(
    livro_id: int,
    status_data: ListaLeituraUpdate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    if status_data.status not in VALID_READING_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Status inválido. Use: {', '.join(sorted(VALID_READING_STATUSES))}"
        )

    statement = select(ListaLeitura).where(
        ListaLeitura.usuario_id == current_user.id,
        ListaLeitura.livro_id == livro_id
    )
    item = session.exec(statement).first()

    if not item:
        # Se não estiver na lista, adiciona automaticamente com o status novo
        novo_item = ListaLeitura(usuario_id=current_user.id, livro_id=livro_id, status=status_data.status)
        session.add(novo_item)
    else:
        item.status = status_data.status
        session.add(item)

    session.commit()
    return {"status": "success", "new_status": status_data.status}

# --- 4. VER MINHA LISTA ---
RECENTES_ORIGENS = {"leitor", "epub", "estudio"}


@router.post("/recentes/{livro_id}", status_code=204)
def registrar_acesso(
    livro_id: int,
    origem: str = Query("leitor"),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if origem not in RECENTES_ORIGENS:
        raise HTTPException(status_code=400, detail="Origem inválida")
    if not session.get(Livro, livro_id):
        raise HTTPException(status_code=404, detail="Livro não encontrado")

    acesso = session.exec(
        select(LivroAcesso)
        .where(LivroAcesso.usuario_id == current_user.id)
        .where(LivroAcesso.livro_id == livro_id)
    ).first()
    if acesso:
        acesso.origem = origem
        acesso.acessado_em = utcnow()
    else:
        session.add(LivroAcesso(usuario_id=current_user.id, livro_id=livro_id, origem=origem))
    session.commit()
    return Response(status_code=204)


@router.get("/recentes")
def listar_recentes(
    limit: int = Query(24, ge=1, le=100),
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        select(LivroAcesso, Livro)
        .join(Livro, LivroAcesso.livro_id == Livro.id)
        .where(LivroAcesso.usuario_id == current_user.id)
        .order_by(LivroAcesso.acessado_em.desc())
        .limit(limit)
        .options(defer(Livro.capa))
    ).all()
    return [
        {"livro": LivroRead.model_validate(livro), "origem": acesso.origem, "acessado_em": acesso.acessado_em.isoformat()}
        for acesso, livro in rows
    ]


@router.get("/my-list")
def get_my_list(current_user: Usuario = Depends(get_current_user), session: Session = Depends(get_session)):
    # Busca ListaLeitura, Livro e Anotacao (para pegar o progresso)
    statement = select(ListaLeitura, Livro, Anotacao).join(Livro, ListaLeitura.livro_id == Livro.id).outerjoin(
        Anotacao, 
        (Anotacao.livro_id == Livro.id) & (Anotacao.usuario_id == current_user.id)
    ).where(ListaLeitura.usuario_id == current_user.id).options(defer(Livro.capa))
    
    results = session.exec(statement).all()
    
    response = []
    for lista_item, livro_item, anotacao_item in results:
        last_page = 1
        total_pages = None
        
        if anotacao_item and anotacao_item.dados_json:
            last_page = anotacao_item.dados_json.get("lastPage", 1)
            total_pages = anotacao_item.dados_json.get("totalPages", None)
        
        # Se não tiver totalPages no JSON, usa o valor do banco de dados
        if total_pages is None:
            total_pages = livro_item.paginas
        
        # Valida o livro com LivroRead para incluir todos os campos necessários
        livro_read = LivroRead.model_validate(livro_item)
        
        response.append({
            "livro": livro_read,
            "status": lista_item.status,
            "current_page": last_page,
            "total_pages": total_pages
        })
    return response

@router.delete("/my-list/remove/{livro_id}")
def remove_from_list(
    livro_id: int, 
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Busca o item na lista
    statement = select(ListaLeitura).where(
        ListaLeitura.usuario_id == current_user.id,
        ListaLeitura.livro_id == livro_id
    )
    item = session.exec(statement).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Livro não encontrado na sua lista")
    
    session.delete(item)
    session.commit()
    
    return {"message": "Livro removido da lista", "status": "success"}

@router.get("/collections")
def get_collections(current_user: Usuario = Depends(get_current_user), session: Session = Depends(get_session)):
    collections = session.exec(
        select(ColecaoLivro).where(ColecaoLivro.usuario_id == current_user.id)
    ).all()
    if not collections:
        return []

    # Buscar todos os items de todas as colecoes em uma unica query
    coll_ids = [c.id for c in collections]
    all_items = session.exec(
        select(ColecaoLivroItem).where(ColecaoLivroItem.colecao_id.in_(coll_ids))
    ).all()

    # Buscar todos os livros em uma unica query
    all_book_ids = list({i.livro_id for i in all_items})
    if all_book_ids:
        livros_rows = session.exec(select(Livro).where(Livro.id.in_(all_book_ids)).options(defer(Livro.capa))).all()
    else:
        livros_rows = []
    livro_map = {l.id: l for l in livros_rows}

    # Agrupar items por colecao
    items_by_coll: dict = {}
    for item in all_items:
        items_by_coll.setdefault(item.colecao_id, []).append(item)

    response = []
    for collection in collections:
        items = items_by_coll.get(collection.id, [])
        book_ids = [item.livro_id for item in items]
        books = []
        for bid in book_ids:
            livro = livro_map.get(bid)
            if livro:
                books.append({"id": livro.id, "titulo": livro.titulo, "autor": livro.autor})
        response.append({
            "id": collection.id,
            "nome": collection.nome,
            "data_criacao": collection.data_criacao,
            "book_ids": book_ids,
            "books": books,
            "total_livros": len(book_ids),
        })
    return response

@router.post("/collections", status_code=201)
def create_collection(
    collection_data: ColecaoLivroCreate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    nome = collection_data.nome.strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Nome da colecao e obrigatorio")

    existing = session.exec(
        select(ColecaoLivro).where(
            ColecaoLivro.usuario_id == current_user.id,
            ColecaoLivro.nome == nome
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ja existe uma colecao com este nome")

    collection = ColecaoLivro(usuario_id=current_user.id, nome=nome)
    session.add(collection)
    session.commit()
    session.refresh(collection)

    return {
        "id": collection.id,
        "nome": collection.nome,
        "data_criacao": collection.data_criacao,
        "book_ids": [],
        "total_livros": 0
    }

@router.post("/collections/{collection_id}/books/{livro_id}")
def add_book_to_collection(
    collection_id: int,
    livro_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    collection = session.get(ColecaoLivro, collection_id)
    if not collection or collection.usuario_id != current_user.id:
        raise HTTPException(status_code=404, detail="Colecao nao encontrada")

    livro = session.get(Livro, livro_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Livro nao encontrado")

    existing = session.exec(
        select(ColecaoLivroItem).where(
            ColecaoLivroItem.colecao_id == collection_id,
            ColecaoLivroItem.livro_id == livro_id
        )
    ).first()
    if existing:
        return {"message": "Livro ja esta nesta colecao", "status": "exists"}

    item = ColecaoLivroItem(colecao_id=collection_id, livro_id=livro_id)
    session.add(item)
    session.commit()
    return {"message": "Livro adicionado a colecao", "status": "success"}

@router.put("/collections/{collection_id}")
def rename_collection(
    collection_id: int,
    collection_data: ColecaoLivroCreate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    collection = session.get(ColecaoLivro, collection_id)
    if not collection or collection.usuario_id != current_user.id:
        raise HTTPException(status_code=404, detail="Colecao nao encontrada")

    nome = collection_data.nome.strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Nome e obrigatorio")

    collection.nome = nome
    session.add(collection)
    session.commit()
    session.refresh(collection)

    items = session.exec(select(ColecaoLivroItem).where(ColecaoLivroItem.colecao_id == collection.id)).all()
    return {
        "id": collection.id,
        "nome": collection.nome,
        "data_criacao": collection.data_criacao,
        "book_ids": [item.livro_id for item in items],
        "total_livros": len(items)
    }

@router.delete("/collections/{collection_id}")
def delete_collection(
    collection_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    collection = session.get(ColecaoLivro, collection_id)
    if not collection or collection.usuario_id != current_user.id:
        raise HTTPException(status_code=404, detail="Colecao nao encontrada")

    items = session.exec(select(ColecaoLivroItem).where(ColecaoLivroItem.colecao_id == collection_id)).all()
    for item in items:
        session.delete(item)
    session.flush()  # garante que itens são deletados antes da coleção (FK constraint MySQL)
    session.delete(collection)
    session.commit()
    return {"message": "Colecao deletada", "status": "success"}

@router.delete("/collections/{collection_id}/books/{livro_id}")
def remove_book_from_collection(
    collection_id: int,
    livro_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    collection = session.get(ColecaoLivro, collection_id)
    if not collection or collection.usuario_id != current_user.id:
        raise HTTPException(status_code=404, detail="Colecao nao encontrada")

    item = session.exec(
        select(ColecaoLivroItem).where(
            ColecaoLivroItem.colecao_id == collection_id,
            ColecaoLivroItem.livro_id == livro_id
        )
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Livro nao encontrado nesta colecao")

    session.delete(item)
    session.commit()
    return {"message": "Livro removido da colecao", "status": "success"}

@router.patch("/documents/{doc_id}/toggle-duplicate")
def toggle_duplicate(
    doc_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Marca ou desmarca um livro como duplicado (apenas admin)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    livro = session.get(Livro, doc_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Livro não encontrado")
    livro.is_duplicate = not livro.is_duplicate
    session.add(livro)
    session.commit()
    return {"id": livro.id, "is_duplicate": livro.is_duplicate}


@router.delete("/documents/marked-duplicates")
def delete_marked_duplicates(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Exclui permanentemente todos os livros marcados como duplicados (apenas admin)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    duplicates = session.exec(select(Livro).where(Livro.is_duplicate == True)).all()
    if not duplicates:
        return {"excluidos": 0, "message": "Nenhum duplicado marcado"}
    ids = [l.id for l in duplicates]
    # Limpar FKs antes de deletar
    for table_class in [ListaLeitura, Anotacao, ColecaoLivroItem]:
        items = session.exec(select(table_class).where(table_class.livro_id.in_(ids))).all()
        for item in items:
            session.delete(item)
    session.flush()
    for livro in duplicates:
        session.delete(livro)
    session.commit()
    return {"excluidos": len(ids), "message": f"{len(ids)} livros duplicados excluídos"}


@router.get("/documents/{doc_id}/cover")
def get_cover(doc_id: int, session: Session = Depends(get_session)):
    livro = session.get(Livro, doc_id)
    if not livro or not livro.capa:
        raise HTTPException(status_code=404)
    return Response(
        content=livro.capa,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"},
    )

@router.get("/documents/{doc_id}/annotations")
def get_annotations(
    doc_id: int, 
    current_user: Usuario = Depends(get_current_user), 
    session: Session = Depends(get_session)
):
    # Busca anotação específica deste usuário para este livro
    statement = select(Anotacao).where(
        Anotacao.usuario_id == current_user.id,
        Anotacao.livro_id == doc_id
    )
    anotacao = session.exec(statement).first()

    if not anotacao:
        # Se não houver nada, retorna estrutura vazia padrão
        return {"bookmarks": [], "notes": {}, "highlights": {}}
    
    return anotacao.dados_json

# --- 6. SALVAR/ATUALIZAR ANOTAÇÕES ---
@router.post("/documents/{doc_id}/annotations")
def save_annotations(
    doc_id: int,
    data: AnotacaoUpdate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Tenta encontrar um registro existente
    statement = select(Anotacao).where(
        Anotacao.usuario_id == current_user.id,
        Anotacao.livro_id == doc_id
    )
    anotacao_db = session.exec(statement).first()

    if anotacao_db:
        # Atualiza o registro existente
        anotacao_db.dados_json = data.dict()
        session.add(anotacao_db)
    else:
        # Cria um novo registro (Primeira vez que o usuário anota neste livro)
        nova_anotacao = Anotacao(
            usuario_id=current_user.id,
            livro_id=doc_id,
            dados_json=data.dict()
        )
        session.add(nova_anotacao)

    session.commit()
    return {"message": "Anotações salvas com sucesso"}


# --- PEDIDOS DE LIVROS ---

# Criar um novo pedido
@router.post("/pedidos")
def create_pedido(
    pedido: PedidoLivroCreate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    novo_pedido = PedidoLivro(
        usuario_id=current_user.id,
        titulo=pedido.titulo,
        autor=pedido.autor,
        editora=pedido.editora,
        observacoes=pedido.observacoes
    )
    session.add(novo_pedido)
    session.commit()
    session.refresh(novo_pedido)
    return {"message": "Pedido criado com sucesso", "pedido_id": novo_pedido.id}

# Listar todos os pedidos do usuário atual
@router.get("/pedidos/meus")
def get_my_pedidos(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    statement = select(PedidoLivro).where(PedidoLivro.usuario_id == current_user.id).order_by(PedidoLivro.data_criacao.desc())
    pedidos = session.exec(statement).all()
    
    resultado = []
    for pedido in pedidos:
        resultado.append({
            "id": pedido.id,
            "titulo": pedido.titulo,
            "autor": pedido.autor,
            "editora": pedido.editora,
            "status": pedido.status,
            "observacoes": pedido.observacoes,
            "data_criacao": pedido.data_criacao,
            "data_atualizacao": pedido.data_atualizacao
        })
    
    return resultado

# Listar todos os pedidos (apenas admin)
FEEDBACK_TIPOS = {"bug", "melhoria"}
FEEDBACK_STATUS = {"aberto", "em_analise", "resolvido", "descartado"}


class FeedbackCreate(BaseModel):
    tipo: str = Field(pattern="^(bug|melhoria)$")
    titulo: str = Field(min_length=3, max_length=200)
    descricao: str = Field(min_length=5, max_length=5000)
    pagina: Optional[str] = Field(default=None, max_length=300)


class FeedbackUpdate(BaseModel):
    status: str = Field(pattern="^(aberto|em_analise|resolvido|descartado)$")
    resposta: Optional[str] = Field(default=None, max_length=5000)


def _feedback_out(fb: Feedback, autor: Optional[Usuario] = None) -> dict:
    data = fb.model_dump()
    if autor:
        data.update(autor_nome=autor.nome, autor_email=autor.email)
    return data


@router.post("/feedback", status_code=201)
@limiter.limit("10/minute")
def criar_feedback(request: Request, body: FeedbackCreate, current_user: Usuario = Depends(get_current_user),
                   session: Session = Depends(get_session)):
    fb = Feedback(usuario_id=current_user.id, **body.model_dump())
    session.add(fb)
    session.commit()
    session.refresh(fb)
    return _feedback_out(fb)


@router.get("/feedback")
def listar_feedback(current_user: Usuario = Depends(get_current_user), session: Session = Depends(get_session)):
    """Usuário vê os próprios envios; admin vê todos, com o autor."""
    stmt = select(Feedback, Usuario).join(Usuario, Feedback.usuario_id == Usuario.id).order_by(Feedback.criado_em.desc())
    if not current_user.is_admin:
        stmt = stmt.where(Feedback.usuario_id == current_user.id)
    return [_feedback_out(fb, autor if current_user.is_admin else None) for fb, autor in session.exec(stmt).all()]


@router.patch("/feedback/{feedback_id}")
def atualizar_feedback(feedback_id: int, body: FeedbackUpdate, current_user: Usuario = Depends(get_current_user),
                       session: Session = Depends(get_session)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores.")
    fb = session.get(Feedback, feedback_id)
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback não encontrado")
    fb.status = body.status
    fb.resposta = (body.resposta or "").strip() or None
    fb.atualizado_em = utcnow()
    session.add(fb)
    session.commit()
    session.refresh(fb)
    return _feedback_out(fb)


@router.get("/pedidos")
def get_all_pedidos(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Verifica se é admin
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores.")
    
    # JOIN com Usuario para evitar N+1 queries
    statement = (
        select(PedidoLivro, Usuario)
        .join(Usuario, PedidoLivro.usuario_id == Usuario.id)
        .order_by(PedidoLivro.data_criacao.desc())
    )
    results = session.exec(statement).all()

    resultado = []
    for pedido, usuario in results:
        resultado.append({
            "id": pedido.id,
            "usuario_id": pedido.usuario_id,
            "usuario_nome": usuario.nome,
            "usuario_email": usuario.email,
            "titulo": pedido.titulo,
            "autor": pedido.autor,
            "editora": pedido.editora,
            "status": pedido.status,
            "observacoes": pedido.observacoes,
            "data_criacao": pedido.data_criacao,
            "data_atualizacao": pedido.data_atualizacao
        })

    return resultado

# Atualizar status do pedido (apenas admin)
@router.put("/pedidos/{pedido_id}/status")
def update_pedido_status(
    pedido_id: int,
    update: PedidoLivroUpdate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Verifica se é admin
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores.")
    
    pedido = session.get(PedidoLivro, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    
    # Valida o status
    valid_statuses = ["pendente", "em_analise", "aprovado", "recusado"]
    if update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status inválido. Deve ser um de: {', '.join(valid_statuses)}")
    
    pedido.status = update.status
    pedido.data_atualizacao = utcnow()
    session.add(pedido)
    session.commit()
    
    return {"message": "Status atualizado com sucesso"}

# Cancelar pedido (apenas o próprio usuário e apenas se estiver pendente)
@router.delete("/pedidos/{pedido_id}")
def delete_pedido(
    pedido_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    pedido = session.get(PedidoLivro, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    
    # Verifica se o pedido pertence ao usuário
    if pedido.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="Você só pode cancelar seus próprios pedidos")
    
    # Verifica se o pedido está pendente
    if pedido.status != "pendente":
        raise HTTPException(status_code=400, detail="Apenas pedidos pendentes podem ser cancelados")
    
    session.delete(pedido)
    session.commit()
    
    return {"message": "Pedido cancelado com sucesso"}


@router.get("/stats")
def get_stats(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Estatísticas gerais da biblioteca + progresso do usuário."""
    # --- Biblioteca ---
    total_livros = session.exec(select(func.count(Livro.id))).one()
    total_com_capa = session.exec(select(func.count(Livro.id)).where(Livro.capa != None)).one()

    # Livros por área (top-level: pegar tudo antes do primeiro " / ")
    areas_raw = session.exec(
        select(Livro.area, func.count(Livro.id))
        .where(Livro.area != None, Livro.area != "")
        .group_by(Livro.area)
    ).all()
    area_counts: dict[str, int] = {}
    for area, cnt in areas_raw:
        top = area.split(" / ")[0].strip() if area else "Sem área"
        area_counts[top] = area_counts.get(top, 0) + cnt
    por_area = sorted(
        [{"area": k, "total": v} for k, v in area_counts.items()],
        key=lambda x: x["total"], reverse=True
    )[:10]

    # Livros por gênero (top 8)
    generos_raw = session.exec(
        select(Livro.genero, func.count(Livro.id))
        .where(Livro.genero != None, Livro.genero != "")
        .group_by(Livro.genero)
        .order_by(func.count(Livro.id).desc())
    ).all()
    por_genero = [{"genero": g, "total": c} for g, c in generos_raw[:8]]

    # --- Usuário ---
    lista = session.exec(
        select(ListaLeitura).where(ListaLeitura.usuario_id == current_user.id)
    ).all()
    status_map = {"quero_ler": 0, "lendo": 0, "lido": 0}
    for item in lista:
        status_map[item.status] = status_map.get(item.status, 0) + 1

    # Progresso de leitura (via anotações — dados_json contém lastPage/totalPages)
    anotacoes = session.exec(
        select(Anotacao).where(Anotacao.usuario_id == current_user.id)
    ).all()
    paginas_lidas = 0
    paginas_total = 0
    for a in anotacoes:
        if a.dados_json:
            lp = a.dados_json.get("lastPage", 0) or 0
            tp = a.dados_json.get("totalPages", 0) or 0
            if lp > 0 and tp > 0:
                paginas_lidas += lp
                paginas_total += tp

    return {
        "biblioteca": {
            "total_livros": total_livros,
            "total_com_capa": total_com_capa,
            "por_area": por_area,
            "por_genero": por_genero,
        },
        "usuario": {
            "total_lista": len(lista),
            "quero_ler": status_map["quero_ler"],
            "lendo": status_map["lendo"],
            "lido": status_map["lido"],
            "paginas_lidas": paginas_lidas,
            "paginas_total": paginas_total,
        },
    }


@router.get("/auth/verify")
def verify_token(current_user: Usuario = Depends(get_current_user)):
    return {"status": "ok", "user": {"nome": current_user.nome, "id": current_user.id, "is_admin": current_user.is_admin}}

# --- ATUALIZAR PÁGINAS DOS LIVROS ---
@router.post("/admin/update-pages")
def update_all_pages(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session),
    pdf_service: PDFService = Depends(get_pdf_service)
):
    """Atualiza o número de páginas de todos os livros no banco de dados"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores.")
    
    livros = session.exec(select(Livro)).all()
    updated_count = 0
    errors = []
    
    for livro in livros:
        try:
            if not livro.caminho:
                errors.append(f"Livro {livro.id} ({livro.titulo}): sem caminho")
                continue
            
            file_path = pdf_service.get_file_path(livro.caminho)
            page_count = pdf_service.count_pages(file_path)
            
            livro.paginas = page_count
            session.add(livro)
            updated_count += 1
            print(f"✓ Livro {livro.id} ({livro.titulo}): {page_count} páginas")
            
        except Exception as e:
            error_msg = f"Livro {livro.id} ({livro.titulo}): {str(e)}"
            errors.append(error_msg)
            print(f"✗ {error_msg}")
    
    session.commit()
    
    return {
        "message": f"Atualização concluída: {updated_count} livros atualizados",
        "updated_count": updated_count,
        "total_count": len(livros),
        "errors": errors
    }
