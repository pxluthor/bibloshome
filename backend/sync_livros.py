import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

HOST = os.getenv('HOST')
USER = os.getenv('USER')
PASSWORD = os.getenv('PASSWORD')
DATABASE = os.getenv('DATABASE')

PASTA_BIBLIOTECA = os.getenv('PASTA_BIBLIOTECA', r'E:\BIBLIOTECA')
EXTENSOES_SUPORTADAS = ('.pdf', '.epub', '.azw')


def normalizar_relativo(rel_path: str) -> str:
    """Normaliza caminho relativo para comparacao consistente."""
    rel = os.path.normpath(rel_path).replace('\\', '/').strip()
    if rel == '.':
        return ''
    return os.path.normcase(rel)


def area_para_path(area: str) -> str:
    """Converte campo area do banco (" / ") para separador de path."""
    if not area:
        return ''
    return area.replace(' / ', '/').replace('\\', '/')


def resolver_escopo_subpasta(pasta_raiz: str, subpasta_relativa: str = '') -> tuple[str, str]:
    """Resolve escopo de varredura e prefixo relativo normalizado."""
    sub = (subpasta_relativa or '').strip()
    if not sub:
        return pasta_raiz, ''

    pasta_base_abs = os.path.abspath(pasta_raiz)
    sub_norm = os.path.normpath(sub)
    pasta_escopo = os.path.abspath(os.path.normpath(os.path.join(pasta_base_abs, sub_norm)))
    if os.path.commonpath([pasta_base_abs, pasta_escopo]) != pasta_base_abs:
        raise ValueError('Subpasta fora da raiz da biblioteca nao e permitida')
    if not os.path.isdir(pasta_escopo):
        raise FileNotFoundError(f'Subpasta nao encontrada: {pasta_escopo}')

    prefixo_rel = normalizar_relativo(sub_norm)
    return pasta_escopo, prefixo_rel


def scan_pasta_livros(pasta_raiz: str, subpasta_relativa: str = '') -> dict:
    """Retorna mapa rel_path -> (titulo, area, caminho_absoluto)."""
    encontrados = {}
    pasta_escopo, _ = resolver_escopo_subpasta(pasta_raiz, subpasta_relativa)

    for raiz, _, arquivos in os.walk(pasta_escopo):
        arquivos_validos = [
            arq for arq in arquivos
            if arq.lower().endswith(EXTENSOES_SUPORTADAS)
        ]
        if not arquivos_validos:
            continue

        rel_dir = os.path.relpath(raiz, pasta_raiz)
        area = rel_dir.replace(os.sep, ' / ') if rel_dir != '.' else ''

        for arquivo in arquivos_validos:
            caminho_abs = os.path.join(raiz, arquivo)
            rel = os.path.relpath(caminho_abs, pasta_raiz)
            rel_norm = normalizar_relativo(rel)
            encontrados[rel_norm] = (arquivo, area, caminho_abs)

    return encontrados


def map_db_por_relativo(cursor, pasta_raiz: str, subpasta_relativa: str = '') -> dict:
    """Retorna mapa rel_path -> (id, caminho, titulo, area) para os registros do banco."""
    cursor.execute('SELECT id, caminho, titulo, area FROM livros')
    rows = cursor.fetchall()
    _, prefixo_rel = resolver_escopo_subpasta(pasta_raiz, subpasta_relativa)

    db_map = {}

    for row_id, caminho, titulo, area in rows:
        relativo = None

        if caminho:
            try:
                relativo = os.path.relpath(caminho, pasta_raiz)
            except Exception:
                relativo = None

        if not relativo or relativo.startswith('..'):
            base_area = area_para_path(area or '')
            relativo = os.path.join(base_area, titulo or '')

        rel_norm = normalizar_relativo(relativo)

        if prefixo_rel and not (rel_norm == prefixo_rel or rel_norm.startswith(prefixo_rel + '/')):
            continue

        db_map[rel_norm] = (row_id, caminho, titulo, area)

    return db_map


def garantir_tabela(cursor):
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS livros (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(255),
        area VARCHAR(255),
        caminho TEXT,
        autor VARCHAR(255),
        editora VARCHAR(255),
        ano INT,
        paginas INT,
        genero VARCHAR(255),
        idioma VARCHAR(255),
        sinopse TEXT,
        capa BLOB,
        data_adicao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')


def sincronizar_livros(gerar_capas: bool = False, subpasta_relativa: str = ''):
    if not os.path.isdir(PASTA_BIBLIOTECA):
        raise FileNotFoundError(f'Pasta da biblioteca nao encontrada: {PASTA_BIBLIOTECA}')

    conn = mysql.connector.connect(
        host=HOST,
        user=USER,
        password=PASSWORD,
        database=DATABASE
    )
    cursor = conn.cursor()

    try:
        garantir_tabela(cursor)

        pasta_escopo, _ = resolver_escopo_subpasta(PASTA_BIBLIOTECA, subpasta_relativa)
        print(f'Iniciando varredura em: {pasta_escopo}')
        fs_map = scan_pasta_livros(PASTA_BIBLIOTECA, subpasta_relativa=subpasta_relativa)
        db_map = map_db_por_relativo(cursor, PASTA_BIBLIOTECA, subpasta_relativa=subpasta_relativa)

        fs_keys = set(fs_map.keys())
        db_keys = set(db_map.keys())

        para_excluir_keys = db_keys - fs_keys
        para_inserir_keys = fs_keys - db_keys

        ids_para_excluir = [db_map[k][0] for k in para_excluir_keys]
        registros_para_inserir = [fs_map[k] for k in para_inserir_keys]

        excluidos = 0
        inseridos = 0

        if ids_para_excluir:
            query_delete = 'DELETE FROM livros WHERE id = %s'
            cursor.executemany('DELETE FROM listaleitura WHERE livro_id = %s', [(i,) for i in ids_para_excluir])
            cursor.executemany('DELETE FROM anotacoes WHERE livro_id = %s', [(i,) for i in ids_para_excluir])
            cursor.executemany(query_delete, [(i,) for i in ids_para_excluir])
            excluidos = cursor.rowcount

        if registros_para_inserir:
            query_insert = 'INSERT INTO livros (titulo, area, caminho) VALUES (%s, %s, %s)'
            cursor.executemany(query_insert, registros_para_inserir)
            inseridos = cursor.rowcount

        conn.commit()

        print('Sincronizacao concluida com sucesso.')
        print(f'Total em pasta: {len(fs_keys)}')
        print(f'Total em banco (antes): {len(db_keys)}')
        print(f'Excluidos do banco: {excluidos}')
        print(f'Inseridos no banco: {inseridos}')
        print(f'Total em banco (esperado apos sync): {len(db_keys) - len(para_excluir_keys) + len(para_inserir_keys)}')

        if gerar_capas:
            from capas import gerar_capas_automaticas
            resumo_capas = gerar_capas_automaticas()
            print(f'Capas apos sincronizacao: {resumo_capas}')

    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == '__main__':
    gerar_capas_flag = os.getenv('GERAR_CAPAS_APOS_SYNC', '0').strip().lower() in ('1', 'true', 'yes', 'y')
    subpasta = os.getenv('SUBPASTA_BIBLIOTECA', '')
    sincronizar_livros(gerar_capas=gerar_capas_flag, subpasta_relativa=subpasta)
