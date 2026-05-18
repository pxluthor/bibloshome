import os
import shutil

import mysql.connector
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlmodel import Session, select

load_dotenv()

from auth import get_current_user
from capas import gerar_capas_automaticas
from database import get_session
from models import Livro, Usuario
from sync_livros import garantir_tabela, map_db_por_relativo, scan_pasta_livros


HOST = os.getenv('HOST')
USER = os.getenv('USER')
PASSWORD = os.getenv('PASSWORD')
DATABASE = os.getenv('DATABASE')
PASTA_BIBLIOTECA = os.getenv('PASTA_BIBLIOTECA', r'E:\BIBLIOTECA')
FOR_INSERT_DIR = os.getenv('FOR_INSERT_DIR', r'E:\for_insert')
EXTENSOES_SUPORTADAS = ('.pdf', '.epub', '.azw')


def verificar_admin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Acesso restrito a administradores',
        )
    return current_user


def abrir_conexao():
    return mysql.connector.connect(
        host=HOST,
        user=USER,
        password=PASSWORD,
        database=DATABASE,
    )


class ScanRequest(BaseModel):
    subpasta: str = ''


class SyncRequest(BaseModel):
    subpasta: str = ''
    gerar_capas: bool = False


class MoveRequest(BaseModel):
    livro_id: int
    pasta_destino: str = ''


router = APIRouter(
    prefix='/admin/bd',
    tags=['admin-bd'],
    dependencies=[Depends(verificar_admin)],
)


def _diagnostico_scan(subpasta: str = '') -> dict:
    conn = abrir_conexao()
    cursor = conn.cursor()

    try:
        garantir_tabela(cursor)
        fs_map = scan_pasta_livros(PASTA_BIBLIOTECA, subpasta_relativa=subpasta)
        db_map = map_db_por_relativo(cursor, PASTA_BIBLIOTECA, subpasta_relativa=subpasta)

        fs_keys = set(fs_map.keys())
        db_keys = set(db_map.keys())

        para_inserir_keys = sorted(fs_keys - db_keys)
        para_excluir_keys = sorted(db_keys - fs_keys)

        para_inserir = [
            {
                'relativo': key,
                'titulo': fs_map[key][0],
                'area': fs_map[key][1],
                'caminho': fs_map[key][2],
            }
            for key in para_inserir_keys
        ]
        para_excluir = [
            {
                'id': db_map[key][0],
                'relativo': key,
                'titulo': db_map[key][2],
                'area': db_map[key][3],
                'caminho': db_map[key][1],
            }
            for key in para_excluir_keys
        ]

        return {
            'escopo': subpasta or '(raiz completa)',
            'total_pasta': len(fs_keys),
            'total_banco': len(db_keys),
            'total_inserir': len(para_inserir),
            'total_excluir': len(para_excluir),
            'para_inserir': para_inserir,
            'para_excluir': para_excluir,
        }
    finally:
        cursor.close()
        conn.close()


@router.get('/folders')
def listar_pastas():
    if not os.path.isdir(PASTA_BIBLIOTECA):
        raise HTTPException(status_code=400, detail='PASTA_BIBLIOTECA nao encontrada')

    pastas = []
    for raiz, dirs, _ in os.walk(PASTA_BIBLIOTECA):
        dirs.sort()
        rel = os.path.relpath(raiz, PASTA_BIBLIOTECA)
        if rel == '.':
            continue

        rel_norm = os.path.normpath(rel).replace('\\', '/')
        pastas.append({
            'rel': rel_norm,
            'depth': rel_norm.count('/'),
            'nome': os.path.basename(rel_norm),
        })

    return sorted(pastas, key=lambda item: item['rel'])[:500]


@router.post('/scan')
def scan_bd(body: ScanRequest):
    return _diagnostico_scan(body.subpasta)


@router.post('/sync')
def sincronizar_bd(body: SyncRequest):
    diagnostico = _diagnostico_scan(body.subpasta)
    conn = abrir_conexao()
    cursor = conn.cursor()

    try:
        excluidos = 0
        inseridos = 0

        if diagnostico['para_excluir']:
            ids = [(item['id'],) for item in diagnostico['para_excluir']]
            cursor.executemany('DELETE FROM listaleitura WHERE livro_id = %s', ids)
            cursor.executemany('DELETE FROM anotacoes WHERE livro_id = %s', ids)
            cursor.executemany('DELETE FROM livros WHERE id = %s', ids)
            excluidos = cursor.rowcount

        if diagnostico['para_inserir']:
            payload = [
                (item['titulo'], item['area'], item['caminho'])
                for item in diagnostico['para_inserir']
            ]
            cursor.executemany(
                'INSERT INTO livros (titulo, area, caminho) VALUES (%s, %s, %s)',
                payload,
            )
            inseridos = cursor.rowcount

        conn.commit()

        resultado = {
            'excluidos': excluidos,
            'inseridos': inseridos,
            'antes_banco': diagnostico['total_banco'],
            'depois_banco': diagnostico['total_banco'] - diagnostico['total_excluir'] + diagnostico['total_inserir'],
        }
        if body.gerar_capas:
            resultado['capas'] = gerar_capas_automaticas()

        return resultado
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@router.post('/generate-covers')
def gerar_capas():
    return gerar_capas_automaticas()


@router.get('/search-books')
def buscar_livros(q: str = Query('', min_length=1), session: Session = Depends(get_session)):
    livros = session.exec(
        select(Livro)
        .where(or_(Livro.titulo.ilike(f'%{q}%'), Livro.autor.ilike(f'%{q}%')))
        .limit(20)
    ).all()

    return [
        {
            'id': livro.id,
            'titulo': livro.titulo,
            'autor': livro.autor,
            'area': livro.area,
            'caminho': livro.caminho,
        }
        for livro in livros
    ]


@router.post('/move')
def mover_livro(body: MoveRequest, session: Session = Depends(get_session)):
    livro = session.get(Livro, body.livro_id)
    if not livro:
        raise HTTPException(status_code=404, detail='Livro nao encontrado')

    caminho_atual = livro.caminho
    if not caminho_atual:
        raise HTTPException(status_code=400, detail='Livro sem caminho cadastrado')

    if not os.path.isabs(caminho_atual):
        caminho_atual = os.path.join(PASTA_BIBLIOTECA, caminho_atual)
    caminho_atual = os.path.abspath(caminho_atual)

    if not os.path.isfile(caminho_atual):
        raise HTTPException(status_code=400, detail='Arquivo não encontrado no filesystem')

    pasta_base_abs = os.path.abspath(PASTA_BIBLIOTECA)
    pasta_destino_rel = body.pasta_destino or ''
    pasta_destino_abs = os.path.abspath(os.path.join(pasta_base_abs, pasta_destino_rel))

    try:
        destino_dentro_da_biblioteca = os.path.commonpath([pasta_base_abs, pasta_destino_abs]) == pasta_base_abs
    except ValueError:
        destino_dentro_da_biblioteca = False

    if not destino_dentro_da_biblioteca:
        raise HTTPException(status_code=400, detail='Pasta de destino fora da biblioteca')

    if not os.path.isdir(pasta_destino_abs):
        os.makedirs(pasta_destino_abs, exist_ok=True)

    nome_arquivo = os.path.basename(caminho_atual)
    novo_caminho_abs = os.path.join(pasta_destino_abs, nome_arquivo)

    try:
        shutil.move(caminho_atual, novo_caminho_abs)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Falha ao mover arquivo: {exc}') from exc

    nova_area = ' / '.join(part for part in pasta_destino_rel.replace('\\', '/').split('/') if part) if pasta_destino_rel else ''
    livro.caminho = novo_caminho_abs
    livro.area = nova_area
    session.add(livro)
    session.commit()
    session.refresh(livro)

    return {
        'livro_id': livro.id,
        'caminho_antigo': caminho_atual,
        'caminho_novo': novo_caminho_abs,
        'area_nova': nova_area,
    }


class InsertBookRequest(BaseModel):
    caminho_origem: str          # caminho absoluto dentro de FOR_INSERT_DIR
    pasta_destino: str = ''      # subpasta relativa a PASTA_BIBLIOTECA (vazio = raiz)
    titulo: str
    autor: str = ''
    editora: str = ''
    ano: int | None = None
    paginas: int | None = None
    genero: str = ''
    idioma: str = ''
    area: str = ''
    sinopse: str = ''
    mover_arquivo: bool = True   # mover para PASTA_BIBLIOTECA após inserir


@router.get('/staging-files')
def listar_staging():
    """Lista arquivos na pasta de staging (FOR_INSERT_DIR)."""
    if not os.path.isdir(FOR_INSERT_DIR):
        raise HTTPException(status_code=400, detail=f'FOR_INSERT_DIR não encontrada: {FOR_INSERT_DIR}')

    arquivos = []
    for raiz, dirs, files in os.walk(FOR_INSERT_DIR):
        dirs.sort()
        for nome in sorted(files):
            if not nome.lower().endswith(EXTENSOES_SUPORTADAS):
                continue
            caminho_abs = os.path.join(raiz, nome)
            rel = os.path.relpath(caminho_abs, FOR_INSERT_DIR).replace('\\', '/')
            try:
                tamanho = os.path.getsize(caminho_abs)
            except OSError:
                tamanho = 0
            arquivos.append({
                'nome': nome,
                'rel': rel,
                'caminho_abs': caminho_abs,
                'tamanho_mb': round(tamanho / 1_048_576, 2),
                'ext': os.path.splitext(nome)[1].lower(),
            })
    return arquivos


@router.post('/insert-book')
def inserir_livro(body: InsertBookRequest, session: Session = Depends(get_session)):
    """Insere livro no banco com todos os metadados e opcionalmente move o arquivo."""
    # Validar que o arquivo está dentro de FOR_INSERT_DIR
    caminho_abs = os.path.abspath(body.caminho_origem)
    for_insert_abs = os.path.abspath(FOR_INSERT_DIR)
    try:
        dentro = os.path.commonpath([for_insert_abs, caminho_abs]) == for_insert_abs
    except ValueError:
        dentro = False
    if not dentro:
        raise HTTPException(status_code=400, detail='Arquivo fora de FOR_INSERT_DIR')
    if not os.path.isfile(caminho_abs):
        raise HTTPException(status_code=400, detail='Arquivo não encontrado')

    caminho_final = caminho_abs

    # Mover para PASTA_BIBLIOTECA se solicitado
    if body.mover_arquivo:
        pasta_base = os.path.abspath(PASTA_BIBLIOTECA)
        dest_rel = body.pasta_destino or ''
        pasta_dest_abs = os.path.abspath(os.path.join(pasta_base, dest_rel))
        try:
            dentro_bib = os.path.commonpath([pasta_base, pasta_dest_abs]) == pasta_base
        except ValueError:
            dentro_bib = False
        if not dentro_bib:
            raise HTTPException(status_code=400, detail='Pasta de destino fora da biblioteca')
        os.makedirs(pasta_dest_abs, exist_ok=True)
        novo_caminho = os.path.join(pasta_dest_abs, os.path.basename(caminho_abs))
        try:
            shutil.move(caminho_abs, novo_caminho)
            caminho_final = novo_caminho
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f'Erro ao mover arquivo: {exc}') from exc

    # Calcular área a partir da pasta_destino se não informada
    area = body.area
    if not area and body.pasta_destino:
        area = ' / '.join(p for p in body.pasta_destino.replace('\\', '/').split('/') if p)

    livro = Livro(
        titulo=body.titulo or None,
        autor=body.autor or None,
        editora=body.editora or None,
        ano=body.ano,
        paginas=body.paginas,
        genero=body.genero or None,
        idioma=body.idioma or None,
        area=area or None,
        sinopse=body.sinopse or None,
        caminho=caminho_final,
    )
    session.add(livro)
    session.commit()
    session.refresh(livro)

    return {
        'id': livro.id,
        'titulo': livro.titulo,
        'caminho': livro.caminho,
        'area': livro.area,
    }
