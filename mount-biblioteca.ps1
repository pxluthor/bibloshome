# Monta o disco do Ubuntu (biblioteca) no WSL e reinicia o backend para enxergar /data/biblioteca.
# Registrado como tarefa agendada no logon (ver register-mount-task.ps1). Precisa de privilegio elevado.
$log = "$PSScriptRoot\backups\mount-biblioteca.log"
"$(Get-Date -Format s) inicio" | Out-File $log -Append

wsl --mount \\.\PHYSICALDRIVE2 --partition 2 2>&1 | Out-File $log -Append

# Espera o Docker Desktop subir (ate ~5 min) antes de reiniciar o backend
for ($i = 0; $i -lt 60; $i++) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep 5
}
docker restart bibloshome-backend 2>&1 | Out-File $log -Append
"$(Get-Date -Format s) fim" | Out-File $log -Append
