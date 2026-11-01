$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskTools = Join-Path $taskRoot 'tools'
New-Item -ItemType Directory -Path $taskTools -Force | Out-Null
$taskTarget = Join-Path $taskTools 'cloudflared.exe'
if (Test-Path -LiteralPath $taskTarget) { Write-Output 'cloudflared ja instalado.'; exit 0 }
$taskAsset = (Invoke-RestMethod 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest').assets | Where-Object name -eq 'cloudflared-windows-amd64.exe'
if (!$taskAsset -or $taskAsset.digest -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Release sem SHA-256 verificavel.' }
Invoke-WebRequest -Uri $taskAsset.browser_download_url -OutFile "$taskTarget.download"
$taskHash = (Get-FileHash -LiteralPath "$taskTarget.download" -Algorithm SHA256).Hash.ToLowerInvariant()
if ("sha256:$taskHash" -ne $taskAsset.digest) { throw 'SHA-256 do download nao confere.' }
Move-Item -LiteralPath "$taskTarget.download" -Destination $taskTarget
Write-Output 'cloudflared oficial instalado e SHA-256 verificado.'
