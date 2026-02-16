import os
import traceback

import mysql.connector
import streamlit as st
from dotenv import load_dotenv

from capas import gerar_capas_automaticas
from sync_livros import garantir_tabela, map_db_por_relativo, scan_pasta_livros


load_dotenv()


st.set_page_config(page_title='Admin Biblioteca', page_icon=':books:', layout='wide')
st.title('Admin Biblioteca - Sincronizacao de Livros')
st.caption('A pasta e a fonte da verdade: remove do banco o que nao existe mais e insere o que esta faltando.')


DEFAULT_HOST = os.getenv('HOST', '')
DEFAULT_USER = os.getenv('USER', '')
DEFAULT_PASSWORD = os.getenv('PASSWORD', '')
DEFAULT_DATABASE = os.getenv('DATABASE', '')
DEFAULT_PASTA = os.getenv('PASTA_BIBLIOTECA', r'E:\BIBLIOTECA')
DEFAULT_SUBPASTA = os.getenv('SUBPASTA_BIBLIOTECA', '')


def abrir_conexao(cfg: dict):
    return mysql.connector.connect(
        host=cfg['host'],
        user=cfg['user'],
        password=cfg['password'],
        database=cfg['database'],
    )


def listar_subpastas_em_arvore(pasta_raiz: str) -> list[tuple[str, int]]:
    """
    Retorna lista de (relativo, profundidade) para renderizar a arvore de pastas.
    """
    if not os.path.isdir(pasta_raiz):
        return []

    saida = []
    for raiz, dirs, _ in os.walk(pasta_raiz):
        dirs.sort()
        rel = os.path.relpath(raiz, pasta_raiz)
        if rel == '.':
            continue
        profundidade = rel.count(os.sep)
        saida.append((rel, profundidade))
    return saida


def label_arvore_ascii(rel: str, depth: int) -> str:
    nome = os.path.basename(rel)
    if depth <= 0:
        return nome
    return f"{'|   ' * depth}|-- {nome}"


def analisar(cfg: dict) -> dict:
    if not os.path.isdir(cfg['pasta_biblioteca']):
        raise FileNotFoundError(f"Pasta nao encontrada: {cfg['pasta_biblioteca']}")

    conn = abrir_conexao(cfg)
    cursor = conn.cursor()

    try:
        garantir_tabela(cursor)

        fs_map = scan_pasta_livros(cfg['pasta_biblioteca'], subpasta_relativa=cfg.get('subpasta_relativa', ''))
        db_map = map_db_por_relativo(cursor, cfg['pasta_biblioteca'], subpasta_relativa=cfg.get('subpasta_relativa', ''))

        fs_keys = set(fs_map.keys())
        db_keys = set(db_map.keys())

        para_excluir_keys = sorted(db_keys - fs_keys)
        para_inserir_keys = sorted(fs_keys - db_keys)

        para_excluir = [
            {
                'id': db_map[k][0],
                'relativo': k,
                'titulo': db_map[k][2],
                'area': db_map[k][3],
                'caminho': db_map[k][1],
            }
            for k in para_excluir_keys
        ]

        para_inserir = [
            {
                'relativo': k,
                'titulo': fs_map[k][0],
                'area': fs_map[k][1],
                'caminho': fs_map[k][2],
            }
            for k in para_inserir_keys
        ]

        return {
            'escopo': cfg.get('subpasta_relativa', '') or '(raiz completa)',
            'total_pasta': len(fs_keys),
            'total_banco': len(db_keys),
            'total_excluir': len(para_excluir),
            'total_inserir': len(para_inserir),
            'para_excluir': para_excluir,
            'para_inserir': para_inserir,
        }
    finally:
        cursor.close()
        conn.close()


def executar_sincronizacao(cfg: dict, gerar_capas: bool = False) -> dict:
    diagnostico = analisar(cfg)

    conn = abrir_conexao(cfg)
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
        if gerar_capas:
            resultado['capas'] = gerar_capas_automaticas()
        return resultado
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


with st.sidebar:
    st.header('Configuracao')

    with st.form('cfg_form'):
        host = st.text_input('HOST', value=DEFAULT_HOST)
        user = st.text_input('USER', value=DEFAULT_USER)
        password = st.text_input('PASSWORD', value=DEFAULT_PASSWORD, type='password')
        database = st.text_input('DATABASE', value=DEFAULT_DATABASE)
        pasta_biblioteca = st.text_input('PASTA_BIBLIOTECA', value=DEFAULT_PASTA)

        submitted = st.form_submit_button('Atualizar parametros')

    if submitted:
        st.success('Parametros atualizados.')

    if 'selected_subpasta' not in st.session_state:
        st.session_state['selected_subpasta'] = DEFAULT_SUBPASTA

    st.divider()
    st.subheader('Escopo de sincronizacao')
    st.caption('Use busca + selecao unica. Se nada for selecionado, usa a raiz completa.')

    arvore = listar_subpastas_em_arvore(pasta_biblioteca)
    if not arvore and not os.path.isdir(pasta_biblioteca):
        st.warning('PASTA_BIBLIOTECA nao encontrada.')
    elif not arvore:
        st.info('Nenhuma subpasta encontrada.')
    else:
        busca = st.text_input('Buscar pasta', value=st.session_state.get('subpasta_busca', ''), placeholder='Ex.: direito, penal, medicina')
        st.session_state['subpasta_busca'] = busca

        filtro = busca.strip().lower()
        itens_filtrados = [
            (rel, depth) for rel, depth in arvore
            if not filtro or filtro in rel.lower()
        ]

        if not itens_filtrados:
            st.info('Nenhuma pasta encontrada para o filtro informado.')
        else:
            opcoes = ['(raiz completa)'] + [rel for rel, _ in itens_filtrados]
            profundidade_map = {rel: depth for rel, depth in itens_filtrados}
            escolhido_atual = st.session_state.get('selected_subpasta', '') or '(raiz completa)'
            if escolhido_atual not in opcoes:
                escolhido_atual = '(raiz completa)'

            escolhido = st.radio(
                'Selecione o escopo',
                opcoes,
                index=opcoes.index(escolhido_atual),
                format_func=lambda op: '(raiz completa)' if op == '(raiz completa)' else label_arvore_ascii(op, profundidade_map.get(op, 0)),
            )

            st.session_state['selected_subpasta'] = '' if escolhido == '(raiz completa)' else escolhido

    if st.button('Limpar selecao (usar raiz)'):
        st.session_state['selected_subpasta'] = ''


cfg = {
    'host': host,
    'user': user,
    'password': password,
    'database': database,
    'pasta_biblioteca': pasta_biblioteca,
    'subpasta_relativa': st.session_state.get('selected_subpasta', ''),
}


col_a, col_b = st.columns([1, 1])

with col_a:
    if st.button('Analisar diferencas', type='primary', use_container_width=True):
        try:
            st.session_state['diagnostico'] = analisar(cfg)
            st.session_state['cfg'] = cfg
            st.success('Analise concluida.')
        except Exception as exc:
            st.error(f'Falha na analise: {exc}')
            st.code(traceback.format_exc())

with col_b:
    confirm = st.checkbox('Confirmo que quero aplicar alteracoes no banco')
    gerar_capas_pos_sync = st.checkbox('Gerar capas ao final (somente livros sem capa)')
    if st.button('Executar sincronizacao', use_container_width=True, disabled=not confirm):
        try:
            resultado = executar_sincronizacao(cfg, gerar_capas=gerar_capas_pos_sync)
            st.success('Sincronizacao executada com sucesso.')
            st.json(resultado)
            st.session_state['diagnostico'] = analisar(cfg)
            st.session_state['cfg'] = cfg
        except Exception as exc:
            st.error(f'Falha na sincronizacao: {exc}')
            st.code(traceback.format_exc())


diagnostico = st.session_state.get('diagnostico')

if diagnostico:
    st.caption(f"Escopo analisado: {diagnostico.get('escopo', '(raiz completa)')}")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric('Total pasta', diagnostico['total_pasta'])
    c2.metric('Total banco', diagnostico['total_banco'])
    c3.metric('Para inserir', diagnostico['total_inserir'])
    c4.metric('Para excluir', diagnostico['total_excluir'])

    st.subheader('Arquivos para inserir')
    if diagnostico['para_inserir']:
        st.dataframe(diagnostico['para_inserir'], use_container_width=True, height=300)
    else:
        st.info('Nenhum arquivo novo para inserir.')

    st.subheader('Registros para excluir')
    if diagnostico['para_excluir']:
        st.dataframe(diagnostico['para_excluir'], use_container_width=True, height=300)
    else:
        st.info('Nenhum registro para excluir.')
else:
    st.info('Clique em "Analisar diferencas" para carregar o diagnostico.')
