# init-db-schema.ps1
# Garante que o schema do banco está completo e atualizado.
# Seguro para rodar em banco já existente (usa IF NOT EXISTS / IF EXISTS).
# Rodar sempre após recriar o container do banco.

Write-Host "Aplicando schema completo no banco..." -ForegroundColor Cyan

docker exec bibloshome-db bash -c @"
mysql -u bibloshome -pbibloshome bibloshome 2>/dev/null << 'ENDSQL'

-- livros: colunas que podem ter ficado de fora do create_all
ALTER TABLE livros
  MODIFY COLUMN titulo   VARCHAR(500),
  MODIFY COLUMN area     VARCHAR(500),
  MODIFY COLUMN sinopse  TEXT,
  MODIFY COLUMN caminho  VARCHAR(1000),
  MODIFY COLUMN capa     MEDIUMBLOB;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='bibloshome' AND TABLE_NAME='livros' AND COLUMN_NAME='tags');
SET @sql = IF(@col=0,
  'ALTER TABLE livros ADD COLUMN tags JSON NULL',
  'SELECT ''tags ja existe'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ENDSQL
"@

docker exec bibloshome-backend python -c @"
from database import engine
from sqlalchemy import text, inspect
insp = inspect(engine)
existing = [i['name'] for i in insp.get_indexes('livros')]
with engine.connect() as conn:
    if 'idx_area'         not in existing: conn.execute(text('CREATE INDEX idx_area ON livros (area(100))')); print('idx_area criado')
    if 'idx_genero'       not in existing: conn.execute(text('CREATE INDEX idx_genero ON livros (genero(50))')); print('idx_genero criado')
    if 'idx_is_duplicate' not in existing: conn.execute(text('CREATE INDEX idx_is_duplicate ON livros (is_duplicate)')); print('idx_is_duplicate criado')
    conn.commit()
"@ 2>$null

Write-Host "Schema atualizado!" -ForegroundColor Green
