from fastapi import APIRouter, Depends, HTTPException, Body, Response
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from typing import List
from database import get_session
from models import Usuario, UsuarioCreate, UsuarioLogin, ListaLeitura, Livro, Anotacao, AnotacaoUpdate, LivroRead
from services import get_pdf_service, get_translation_service, PDFService, TranslationService
from auth import get_password_hash, verify_password, create_access_token, get_current_user

router = APIRouter()

@router.get("/documents", response_model=List[LivroRead])
def list_documents(session: Session = Depends(get_session)):
    return session.exec(select(Livro)).all()

@router.get("/documents/{doc_id}/file")
def get_document_file(
    doc_id: int, 
    session: Session = Depends(get_session),
    pdf_service: PDFService = Depends(get_pdf_service)
):
    livro = session.get(Livro, doc_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Assuming 'caminho' contains the filename
    file_path = pdf_service.get_file_path(livro.caminho)
    return FileResponse(file_path, media_type="application/pdf", filename=livro.caminho)

@router.post("/documents/{doc_id}/page/{page_number}/translate")
def translate_page(
    doc_id: int, 
    page_number: int, 
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
def register(user: UsuarioCreate, session: Session = Depends(get_session)):
    # Verifica se email já existe
    existing_user = session.exec(select(Usuario).where(Usuario.email == user.email)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    # Cria usuário com senha hash
    hashed_password = get_password_hash(user.senha)
    # Importante: O SQL espera 'nome', 'email', 'senha_hash'
    novo_usuario = Usuario(nome=user.nome, email=user.email, senha_hash=hashed_password)
    
    session.add(novo_usuario)
    session.commit()
    return {"message": "Usuário criado com sucesso"}

# --- 2. LOGIN (GERAR TOKEN) ---
@router.post("/auth/login")
def login(user_data: UsuarioLogin, session: Session = Depends(get_session)):
    # Busca usuário pelo email
    user = session.exec(select(Usuario).where(Usuario.email == user_data.email)).first()
    
    # Valida senha
    if not user or not verify_password(user_data.senha, user.senha_hash):
        raise HTTPException(status_code=400, detail="Email ou senha incorretos")
    
    # Gera Token
    access_token = create_access_token(data={"sub": user.email})
    
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "user_name": user.nome,
        "user_id": user.id
    }

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


# --- 4. VER MINHA LISTA ---
@router.get("/my-list")
def get_my_listold(
    current_user: Usuario = Depends(get_current_user), 
    session: Session = Depends(get_session)
):
    # Faz um JOIN para trazer os dados do Livro junto com o status da Lista
    statement = select(ListaLeitura, Livro).where(
        ListaLeitura.livro_id == Livro.id,
        ListaLeitura.usuario_id == current_user.id
    )
    results = session.exec(statement).all()
    
    # Formata a resposta
    minha_lista = []
    for item_lista, item_livro in results:
        livro_dto = LivroRead.model_validate(item_livro)
        minha_lista.append({
            "list_id": item_lista.id,
            "status": item_lista.status,
            "data_adicao": item_lista.data_adicao,
            "livro": livro_dto
        })
        
    return minha_lista

@router.get("/my-list")
def get_my_list(current_user: Usuario = Depends(get_current_user), session: Session = Depends(get_session)):
    statement = select(ListaLeitura, Livro).where(ListaLeitura.livro_id == Livro.id, ListaLeitura.usuario_id == current_user.id)
    results = session.exec(statement).all()
    return [{"livro": LivroRead.model_validate(l), "status": ls.status} for ls, l in results]

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

@router.get("/documents/{doc_id}/cover")
def get_cover(doc_id: int, session: Session = Depends(get_session)):
    livro = session.get(Livro, doc_id)
    if not livro or not livro.capa:
        raise HTTPException(status_code=404)
    return Response(content=livro.capa, media_type="image/jpeg")

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


@router.get("/auth/verify")
def verify_token(current_user: Usuario = Depends(get_current_user)):
    return {"status": "ok", "user": {"nome": current_user.nome, "id": current_user.id}}