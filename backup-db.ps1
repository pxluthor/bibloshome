# backup-db.ps1 — Backup do banco MySQL do BibliosHome
# Uso: .\backup-db.ps1
# Salva um .sql.gz com timestamp em backups/

$BackupDir = Join-Path $PSScriptRoot "backups"
if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }

$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$Filename  = "bibloshome_$Timestamp.sql"
$FilePath  = Join-Path $BackupDir $Filename
$GzPath    = "$FilePath.gz"

Write-Host "Fazendo backup do banco..." -ForegroundColor Cyan

docker exec bibloshome-db bash -c "mysqldump -u bibloshome -pbibloshome bibloshome 2>/dev/null" | Out-File -FilePath $FilePath -Encoding utf8

if ((Get-Item $FilePath).Length -lt 1000) {
    Write-Host "ERRO: Backup gerado parece vazio. Verifique se o container esta rodando." -ForegroundColor Red
    Remove-Item $FilePath -ErrorAction SilentlyContinue
    exit 1
}

# Comprime
Compress-Archive -Path $FilePath -DestinationPath "$FilePath.zip" -Force
Remove-Item $FilePath

$ZipPath = "$FilePath.zip"
$Size = [math]::Round((Get-Item $ZipPath).Length / 1KB, 1)
Write-Host "Backup salvo: $ZipPath ($Size KB)" -ForegroundColor Green

# Manter apenas os 10 backups mais recentes
$Old = Get-ChildItem $BackupDir -Filter "*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 10
if ($Old) {
    $Old | Remove-Item
    Write-Host "Backups antigos removidos: $($Old.Count)" -ForegroundColor Yellow
}
