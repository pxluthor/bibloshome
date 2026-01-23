from fastapi import APIRouter, Depends, HTTPException, Body, Response
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from typing import List
from datetime import datetime
from database import get_session
from models import Usuario, UsuarioCreate, UsuarioLogin, ListaLeitura, ListaLeituraUpdate, Livro, Anotacao, AnotacaoUpdate, LivroRead, LivroUpdate, PedidoLivro, PedidoLivroCreate, PedidoLivroUpdate
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

@router.get("/documents/{doc_id}/details", response_model=LivroRead)
def get_book_details(
    doc_id: int,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Retorna detalhes completos de um livro (para edição)"""
    livro = session.get(Livro, doc_id)
    if not livro:
        raise HTTPException(status_code=404, detail="Livro não encontrado")
    
    # Apenas admin pode ver detalhes completos
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores.")
    
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
    
    return {"message": "Livro atualizado com sucesso", "livro": LivroRead.model_validate(livro)}

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
    # Importante: O SQL espera 'nome', 'email', 'senha_hash', 'is_admin'
    novo_usuario = Usuario(nome=user.nome, email=user.email, senha_hash=hashed_password, is_admin=user.is_admin)
    
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
        "user_id": user.id,
        "is_admin": user.is_admin
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

# Atualizar status de leitura (Ex: quero_ler -> lendo -> concluido)
@router.put("/my-list/{livro_id}/status")
def update_list_status(
    livro_id: int,
    status_data: ListaLeituraUpdate,
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
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
@router.get("/my-list")
def get_my_list(current_user: Usuario = Depends(get_current_user), session: Session = Depends(get_session)):
    # Busca ListaLeitura, Livro e Anotacao (para pegar o progresso)
    statement = select(ListaLeitura, Livro, Anotacao).join(Livro, ListaLeitura.livro_id == Livro.id).outerjoin(
        Anotacao, 
        (Anotacao.livro_id == Livro.id) & (Anotacao.usuario_id == current_user.id)
    ).where(ListaLeitura.usuario_id == current_user.id)
    
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
@router.get("/pedidos")
def get_all_pedidos(
    current_user: Usuario = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    # Verifica se é admin
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores.")
    
    statement = select(PedidoLivro).order_by(PedidoLivro.data_criacao.desc())
    pedidos = session.exec(statement).all()
    
    resultado = []
    for pedido in pedidos:
        # Busca nome do usuário
        usuario = session.get(Usuario, pedido.usuario_id)
        resultado.append({
            "id": pedido.id,
            "usuario_id": pedido.usuario_id,
            "usuario_nome": usuario.nome if usuario else "Desconhecido",
            "usuario_email": usuario.email if usuario else "Desconhecido",
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
    pedido.data_atualizacao = datetime.utcnow()
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
