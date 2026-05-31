# restore-db.ps1 — Restaura backup do banco MySQL do BibliosHome
# Uso: .\restore-db.ps1 backups\bibloshome_2026-05-31_20-00.sql.zip

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile
)

if (-not (Test-Path $BackupFile)) {
    Write-Host "ERRO: Arquivo nao encontrado: $BackupFile" -ForegroundColor Red
    exit 1
}

$TempDir = Join-Path $env:TEMP "bibloshome_restore"
if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
New-Item -ItemType Directory -Path $TempDir | Out-Null

Write-Host "Descomprimindo backup..." -ForegroundColor Cyan
Expand-Archive -Path $BackupFile -DestinationPath $TempDir

$SqlFile = Get-ChildItem $TempDir -Filter "*.sql" | Select-Object -First 1
if (-not $SqlFile) {
    Write-Host "ERRO: Nenhum .sql encontrado no backup." -ForegroundColor Red
    exit 1
}

Write-Host "Restaurando: $($SqlFile.Name)" -ForegroundColor Yellow
Write-Host "ATENCAO: Isso SOBRESCREVE o banco atual. Ctrl+C para cancelar..." -ForegroundColor Red
Start-Sleep -Seconds 3

Get-Content $SqlFile.FullName | docker exec -i bibloshome-db bash -c "mysql -u bibloshome -pbibloshome bibloshome 2>/dev/null"

Remove-Item $TempDir -Recurse -Force
Write-Host "Restauracao concluida!" -ForegroundColor Green
