import os
import mysql.connector
from dotenv import load_dotenv

# Carrega variáveis de ambiente
load_dotenv()

HOST = os.getenv('HOST')
USER = os.getenv('USER')
PASSWORD = os.getenv('PASSWORD')
DATABASE = os.getenv('DATABASE')

# Configurar conexão com MySQL
try:
    conn = mysql.connector.connect(
        host=HOST,
        user=USER,
        password=PASSWORD,
        database=DATABASE
    )
    cursor = conn.cursor()
    print("✅ Conexão com o banco estabelecida.")
except Exception as e:
    print(f"❌ Erro ao conectar: {e}")
    exit()

# 1. Criar tabela se não existir
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

# 2. LIMPEZA TOTAL DA TABELA (O comando novo é este aqui)
print("🧹 Limpando tabela 'livros' existente...")
cursor.execute("TRUNCATE TABLE livros") 
print("✨ Tabela limpa e IDs resetados.")

# Caminho da pasta principal de livros
pasta_biblioteca = r'E:\BIBLIOTECA'

# Extensões suportadas
extensoes_suportadas = ['.pdf', '.epub', '.azw']

def indexar_livros(pasta_raiz):
    print("📂 Iniciando varredura nos diretórios...")
    livros_para_inserir = []
    contador = 0

    for raiz, _, arquivos in os.walk(pasta_raiz):
        # Filtrar apenas arquivos com extensões suportadas
        arquivos_validos = [arq for arq in arquivos if any(arq.lower().endswith(ext) for ext in extensoes_suportadas)]
        
        if not arquivos_validos:
            continue
        
        # Capturar a hierarquia completa da pasta para usar como "Area"
        area = os.path.relpath(raiz, pasta_raiz).replace(os.sep, ' / ')
        
        for arquivo in arquivos_validos:
            caminho_completo = os.path.join(raiz, arquivo)
            
            # Adiciona na lista para inserção em lote
            # Como limpamos a tabela antes, não precisamos verificar duplicatas aqui
            livros_para_inserir.append((arquivo, area, caminho_completo))
            contador += 1
    
    # Inserir todos os livros de uma vez (Bulk Insert)
    if livros_para_inserir:
        print(f"💾 Inserindo {len(livros_para_inserir)} livros no banco de dados...")
        query = 'INSERT INTO livros (titulo, area, caminho) VALUES (%s, %s, %s)'
        cursor.executemany(query, livros_para_inserir)
    else:
        print("⚠️ Nenhum livro encontrado nas pastas.")

# Executar indexação
indexar_livros(pasta_biblioteca)

# Commit e fechar conexão
conn.commit()
cursor.close()
conn.close()
print('🚀 Processo finalizado com sucesso!')