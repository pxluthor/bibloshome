import os
import logging
import threading
from pathlib import PureWindowsPath

import mysql.connector
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from auth import get_current_user
from capas import gerar_capas_automaticas
from database import get_session
from models import Livro, Usuario
from services import get_pdf_service, PDFService

# Estado da task de geração de capas (em memória, não persiste entre restarts)
_covers_task: dict = {'status': 'idle', 'result': None, 'error': None}
from sync_livros import (
    garantir_tabela,
    map_db_por_relativo,
    normalizar_relativo,
    resolver_escopo_subpasta,
    scan_pasta_livros,
)

load_dotenv()

logger = logging.getLogger(__name__)

HOST = os.getenv('HOST')
USER = os.getenv('USER')
PASSWORD = os.getenv('PASSWORD')
DATABASE = os.getenv('DATABASE')
PASTA_BIBLIOTECA = os.getenv('PASTA_BIBLIOTECA', '/data/biblioteca')

router = APIRouter(prefix='/admin/bd', tags=['Admin BD'])


class ScanRequest(BaseModel):
    subpasta: str = ''


class SyncRequest(BaseModel):
    subpasta: str = ''
    gerar_capas: bool = False


class MoveRequest(BaseModel):
    livro_id: int
    pasta_destino: str


def _get_conn():
    return mysql.connector.connect(
        host=HOST,
        user=USER,
        password=PASSWORD,
        database=DATABASE,
    )


def _require_admin(current_user: Usuario):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail='Acesso restrito a administradores')


def _listar_subpastas(pasta_raiz: str) -> list[dict]:
    if not os.path.isdir(pasta_raiz):
        raise HTTPException(status_code=400, detail='PASTA_BIBLIOTECA nao encontrada')

    result = [{'rel': '', 'depth': 0, 'nome': 'Raiz (todos)'}]
    for raiz, dirs, _ in os.walk(pasta_raiz):
        dirs.sort()
        for nome_dir in dirs:
            caminho_abs = os.path.join(raiz, nome_dir)
            rel = os.path.relpath(caminho_abs, pasta_raiz)
            rel_norm = normalizar_relativo(rel)
            depth = rel_norm.count('/') + 1 if rel_norm else 1
            result.append({'rel': rel_norm, 'depth': depth, 'nome': nome_dir})

    return sorted(result, key=lambda x: x['rel'].lower())


def _scan_diff(cursor, subpasta: str):
    garantir_tabela(cursor)
    fs_map = scan_pasta_livros(PASTA_BIBLIOTECA, subpasta)
    db_map = map_db_por_relativo(cursor, PASTA_BIBLIOTECA, subpasta)

    fs_keys = set(fs_map.keys())
    db_keys = set(db_map.keys())
    para_inserir_keys = sorted(fs_keys - db_keys)
    para_excluir_keys = sorted(db_keys - fs_keys)

    para_inserir = [
        {
            'relativo': key,
            'titulo': fs_map[key][0],
            'area': fs_map[key][1],
        }
        for key in para_inserir_keys
    ]
    para_excluir = [
        {
            'id': db_map[key][0],
            'relativo': key,
            'titulo': db_map[key][2],
            'area': db_map[key][3],
        }
        for key in para_excluir_keys
    ]

    return {
        'fs_map': fs_map,
        'db_map': db_map,
        'fs_keys': fs_keys,
        'db_keys': db_keys,
        'para_inserir_keys': para_inserir_keys,
        'para_excluir_keys': para_excluir_keys,
        'para_inserir': para_inserir,
        'para_excluir': para_excluir,
    }


def _resolver_caminho_atual(caminho: str) -> str:
    if '\\' in caminho:
        win_path = PureWindowsPath(caminho)
        parts = list(win_path.parts)
        if win_path.drive and len(parts) > 2:
            return os.path.abspath(os.path.join(PASTA_BIBLIOTECA, *parts[2:]))
        return os.path.abspath(os.path.join(PASTA_BIBLIOTECA, *parts))

    if os.path.isabs(caminho):
        return os.path.abspath(caminho)

    return os.path.abspath(os.path.join(PASTA_BIBLIOTECA, caminho))


def _resolver_pasta_destino(pasta_destino: str) -> str:
    pasta_base_abs = os.path.abspath(PASTA_BIBLIOTECA)
    destino = pasta_destino or ''
    if os.path.isabs(destino):
        pasta_destino_abs = os.path.abspath(destino)
    else:
        pasta_destino_abs = os.path.abspath(os.path.join(pasta_base_abs, destino))

    try:
        dentro_biblioteca = os.path.commonpath([pasta_base_abs, pasta_destino_abs]) == pasta_base_abs
    except ValueError:
        dentro_biblioteca = False

    if not dentro_biblioteca:
        raise HTTPException(status_code=400, detail='Pasta de destino fora da biblioteca')

    return pasta_destino_abs


@router.get('/folders')
def listar_folders(current_user: Usuario = Depends(get_current_user)):
    _require_admin(current_user)
    return {'folders': _listar_subpastas(PASTA_BIBLIOTECA)}


@router.post('/scan')
def scan_bd(body: ScanRequest, current_user: Usuario = Depends(get_current_user)):
    _require_admin(current_user)
    conn = _get_conn()
    cursor = conn.cursor()

    try:
        diff = _scan_diff(cursor, body.subpasta)
        return {
            'escopo': body.subpasta or 'Raiz',
            'total_pasta': len(diff['fs_keys']),
            'total_banco': len(diff['db_keys']),
            'total_inserir': len(diff['para_inserir_keys']),
            'total_excluir': len(diff['para_excluir_keys']),
            'para_inserir': diff['para_inserir'],
            'para_excluir': diff['para_excluir'],
        }
    except (FileNotFoundError, ValueError) as exc:
        logger.warning('Falha ao escanear biblioteca: %s', exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        cursor.close()
        conn.close()


@router.post('/sync')
def sync_bd(body: SyncRequest, current_user: Usuario = Depends(get_current_user)):
    _require_admin(current_user)
    conn = _get_conn()
    cursor = conn.cursor()

    try:
        diff = _scan_diff(cursor, body.subpasta)
        antes_banco = len(diff['db_keys'])

        ids_para_excluir = [diff['db_map'][key][0] for key in diff['para_excluir_keys']]
        registros_para_inserir = [diff['fs_map'][key] for key in diff['para_inserir_keys']]

        excluidos = 0
        inseridos = 0

        if ids_para_excluir:
            ids_payload = [(item_id,) for item_id in ids_para_excluir]
            cursor.executemany('DELETE FROM listaleitura WHERE livro_id = %s', ids_payload)
            cursor.executemany('DELETE FROM anotacoes WHERE livro_id = %s', ids_payload)
            cursor.executemany('DELETE FROM estudio_artefatos WHERE livro_id = %s', ids_payload)
            cursor.executemany('DELETE FROM colecoes_livros_itens WHERE livro_id = %s', ids_payload)
            cursor.executemany('DELETE FROM livros_ia_status WHERE livro_id = %s', ids_payload)
            cursor.executemany('DELETE FROM livros WHERE id = %s', ids_payload)
            excluidos = cursor.rowcount

        if registros_para_inserir:
            cursor.executemany(
                'INSERT INTO livros (titulo, area, caminho) VALUES (%s, %s, %s)',
                registros_para_inserir,
            )
            inseridos = cursor.rowcount

        conn.commit()

        resultado = {
            'excluidos': excluidos,
            'inseridos': inseridos,
            'antes_banco': antes_banco,
            'depois_banco': antes_banco - len(ids_para_excluir) + len(registros_para_inserir),
        }
        if body.gerar_capas:
            resultado['capas'] = gerar_capas_automaticas()

        return resultado
    except (FileNotFoundError, ValueError) as exc:
        conn.rollback()
        logger.warning('Falha ao sincronizar biblioteca: %s', exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        conn.rollback()
        logger.exception('Falha inesperada ao sincronizar biblioteca')
        raise
    finally:
        cursor.close()
        conn.close()


@router.post('/smart-sync')
def smart_sync_bd(body: SyncRequest, current_user: Usuario = Depends(get_current_user)):
    """
    Sync inteligente: compara por nome de arquivo antes de deletar.
    - Livro que mudou de pasta → UPDATE caminho+area (preserva capa, progresso, anotacoes)
    - Livro que sumiu do disco → DELETE
    - Arquivo novo → INSERT
    """
    _require_admin(current_user)
    conn = _get_conn()
    cursor = conn.cursor()

    try:
        diff = _scan_diff(cursor, body.subpasta)
        fs_map = diff['fs_map']
        db_map = diff['db_map']
        para_inserir_keys = diff['para_inserir_keys']
        para_excluir_keys = diff['para_excluir_keys']

        # Indexar "para inserir" por nome de arquivo (lowercase)
        # fs_map[key] = (titulo/filename, area, caminho_abs)
        inserir_por_nome: dict = {}
        for key in para_inserir_keys:
            nome = fs_map[key][0].lower()
            if nome not in inserir_por_nome:
                inserir_por_nome[nome] = key

        # Indexar "para excluir" por nome de arquivo (lowercase)
        # db_map[key] = (id, caminho, titulo, area)
        excluir_por_nome: dict = {}
        for key in para_excluir_keys:
            titulo = (db_map[key][2] or '')
            nome = os.path.basename(titulo).lower() if titulo else ''
            if nome and nome not in excluir_por_nome:
                excluir_por_nome[nome] = key

        para_atualizar = []   # (new_caminho, new_area, id)
        ids_para_deletar = []
        registros_para_inserir = []
        nomes_matched: set = set()

        # Para cada livro que vai "sair" do banco:
        for nome, excluir_key in excluir_por_nome.items():
            id_livro = db_map[excluir_key][0]
            if nome in inserir_por_nome:
                # Achou o mesmo arquivo numa nova pasta → UPDATE
                inserir_key = inserir_por_nome[nome]
                new_filename, new_area, new_caminho = fs_map[inserir_key]
                para_atualizar.append((new_caminho, new_area, id_livro))
                nomes_matched.add(nome)
            else:
                # Arquivo realmente sumiu → DELETE
                ids_para_deletar.append(id_livro)

        # Arquivos novos que não casaram com nenhum "para excluir" → INSERT
        for nome, inserir_key in inserir_por_nome.items():
            if nome not in nomes_matched:
                registros_para_inserir.append(fs_map[inserir_key])

        # Executar UPDATEs
        atualizados = 0
        if para_atualizar:
            cursor.executemany(
                'UPDATE livros SET caminho = %s, area = %s WHERE id = %s',
                para_atualizar,
            )
            atualizados = len(para_atualizar)

        # Executar DELETEs (com FK cleanup)
        excluidos = 0
        if ids_para_deletar:
            ids_payload = [(i,) for i in ids_para_deletar]
            cursor.executemany('DELETE FROM listaleitura WHERE livro_id = %s', ids_payload)
            cursor.executemany('DELETE FROM anotacoes WHERE livro_id = %s', ids_payload)
            cursor.executemany('DELETE FROM estudio_artefatos WHERE livro_id = %s', ids_payload)
            cursor.executemany('DELETE FROM colecoes_livros_itens WHERE livro_id = %s', ids_payload)
            cursor.executemany('DELETE FROM livros_ia_status WHERE livro_id = %s', ids_payload)
            cursor.executemany('DELETE FROM livros WHERE id = %s', ids_payload)
            excluidos = len(ids_para_deletar)

        # Executar INSERTs
        inseridos = 0
        if registros_para_inserir:
            cursor.executemany(
                'INSERT INTO livros (titulo, area, caminho) VALUES (%s, %s, %s)',
                registros_para_inserir,
            )
            inseridos = len(registros_para_inserir)

        conn.commit()

        resultado = {
            'atualizados': atualizados,
            'excluidos': excluidos,
            'inseridos': inseridos,
            'total_para_inserir_original': len(para_inserir_keys),
            'total_para_excluir_original': len(para_excluir_keys),
        }
        if body.gerar_capas:
            resultado['capas'] = gerar_capas_automaticas()

        return resultado

    except (FileNotFoundError, ValueError) as exc:
        conn.rollback()
        logger.warning('Falha no smart-sync: %s', exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        conn.rollback()
        logger.exception('Falha inesperada no smart-sync')
        raise
    finally:
        cursor.close()
        conn.close()


def _run_covers_task():
    global _covers_task
    try:
        result = gerar_capas_automaticas()
        _covers_task = {'status': 'done', 'result': result, 'error': None}
    except Exception as exc:
        logger.exception('Falha na geração de capas em background')
        _covers_task = {'status': 'error', 'result': None, 'error': str(exc)}


@router.post('/generate-covers')
def generate_covers(current_user: Usuario = Depends(get_current_user)):
    global _covers_task
    _require_admin(current_user)
    if _covers_task['status'] == 'running':
        return {'status': 'running', 'message': 'Geração já em andamento'}
    _covers_task = {'status': 'running', 'result': None, 'error': None}
    thread = threading.Thread(target=_run_covers_task, daemon=True)
    thread.start()
    return {'status': 'running', 'message': 'Geração de capas iniciada em background'}


@router.get('/generate-covers/status')
def generate_covers_status(current_user: Usuario = Depends(get_current_user)):
    _require_admin(current_user)
    return _covers_task


@router.get('/search-books')
def search_books(
    q: str = Query(min_length=2),
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    livros = session.exec(
        select(Livro)
        .where(Livro.titulo.ilike(f'%{q}%'))
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
def move_book(
    body: MoveRequest,
    session: Session = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)

    livro = session.get(Livro, body.livro_id)
    if not livro:
        raise HTTPException(status_code=404, detail='Livro nao encontrado')
    if not livro.caminho:
        raise HTTPException(status_code=400, detail='Livro sem caminho cadastrado')

    caminho_antigo = livro.caminho
    caminho_atual = _resolver_caminho_atual(livro.caminho)
    pasta_destino_abs = _resolver_pasta_destino(body.pasta_destino)
    os.makedirs(pasta_destino_abs, exist_ok=True)

    nome_arquivo = PureWindowsPath(livro.caminho).name if '\\' in livro.caminho else os.path.basename(caminho_atual)
    novo_caminho = os.path.join(pasta_destino_abs, nome_arquivo)

    if os.path.exists(caminho_atual):
        try:
            os.rename(caminho_atual, novo_caminho)
        except OSError as exc:
            logger.exception('Falha ao mover arquivo %s para %s', caminho_atual, novo_caminho)
            raise HTTPException(status_code=500, detail=f'Falha ao mover arquivo: {exc}') from exc
    else:
        logger.warning('Arquivo nao encontrado no filesystem ao mover livro %s: %s', livro.id, caminho_atual)

    rel_dir = os.path.relpath(os.path.dirname(novo_caminho), PASTA_BIBLIOTECA)
    area_nova = rel_dir.replace(os.sep, ' / ') if rel_dir != '.' else ''

    livro.caminho = novo_caminho
    livro.area = area_nova
    session.add(livro)
    session.commit()
    session.refresh(livro)

    return {
        'livro_id': livro.id,
        'caminho_antigo': caminho_antigo,
        'caminho_novo': novo_caminho,
        'area_nova': area_nova,
    }
