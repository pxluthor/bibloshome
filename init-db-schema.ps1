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
  MODIFY COLUMN caminho  VARCHAR(1000);

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='bibloshome' AND TABLE_NAME='livros' AND COLUMN_NAME='tags');
SET @sql = IF(@col=0,
  'ALTER TABLE livros ADD COLUMN tags JSON NULL',
  'SELECT ''tags ja existe'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ENDSQL
"@

Write-Host "Schema atualizado!" -ForegroundColor Green
