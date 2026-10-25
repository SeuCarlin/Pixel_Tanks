param([string]$PortableFolder = '')
$ErrorActionPreference = 'Stop'

$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$workspace = [IO.Path]::GetFullPath((Join-Path $repository '..'))
$output = Join-Path $repository 'output'
if (-not (Test-Path -LiteralPath $output)) { New-Item -ItemType Directory -Path $output | Out-Null }
$output = (Resolve-Path -LiteralPath $output).Path
$stage = Join-Path $output ('installer-stage-' + [guid]::NewGuid().ToString('N'))
$verify = Join-Path $output ('installer-check-' + [guid]::NewGuid().ToString('N'))
$payload = Join-Path $output ('installer-payload-' + [guid]::NewGuid().ToString('N') + '.zip')
$setup = Join-Path $workspace 'release\TankDotsWars-Setup.exe'
$portable = if ($PortableFolder) { [IO.Path]::GetFullPath($PortableFolder) } else { Join-Path $workspace 'release\TankBattle-Portable-Windows' }
if (-not (Test-Path -LiteralPath (Join-Path $portable 'node.exe'))) { throw "Pacote portátil com node.exe não encontrado: $portable" }

function Remove-TemporaryFolder([string]$target) {
  $absolute = [IO.Path]::GetFullPath($target).TrimEnd('\')
  if (-not $absolute.StartsWith($output.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Recusa de remoção fora de output: $absolute" }
  if (Test-Path -LiteralPath $absolute) { Remove-Item -LiteralPath $absolute -Recurse -Force }
}

try {
  New-Item -ItemType Directory -Path $stage | Out-Null
  Get-ChildItem -LiteralPath $portable -Force | Copy-Item -Destination $stage -Recurse -Force
  foreach ($folder in @('client','server','shared','scripts','test','docs')) {
    $from = Join-Path $repository $folder
    $to = Join-Path $stage $folder
    if (-not (Test-Path -LiteralPath $to)) { New-Item -ItemType Directory -Path $to | Out-Null }
    Get-ChildItem -LiteralPath $from -File -Recurse | ForEach-Object {
      $relative = $_.FullName.Substring($from.Length).TrimStart('\')
      $target = Join-Path $to $relative
      $parent = Split-Path -Parent $target
      if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
      Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }
  }
  foreach ($file in @('INICIAR_JOGO.bat','LEIA-ME-PORTATIL.txt','README.md','package.json','package-lock.json','LICENSE')) {
    Copy-Item -LiteralPath (Join-Path $repository $file) -Destination (Join-Path $stage $file) -Force
  }
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'DESINSTALAR.ps1') -Destination (Join-Path $stage 'DESINSTALAR.ps1') -Force
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $payload, [System.IO.Compression.CompressionLevel]::Optimal, $false)

  $compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  if (-not (Test-Path -LiteralPath $compiler)) { throw 'Compilador C# do .NET Framework não encontrado.' }
  $arguments = @('/nologo','/target:winexe','/platform:x64','/optimize+',
    '/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.IO.Compression.dll',
    "/resource:$payload,TankDotsPayload.zip", "/out:$setup", (Join-Path $PSScriptRoot 'TankDotsSetup.cs'))
  & $compiler @arguments
  if ($LASTEXITCODE -ne 0) { throw "Compilação falhou: $LASTEXITCODE" }

  $process = Start-Process -FilePath $setup -ArgumentList @('--extract-test', ('"' + $verify + '"')) -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) { throw "O instalador não conseguiu extrair o pacote: $($process.ExitCode)" }
  foreach ($file in @('node.exe','INICIAR_JOGO.bat','scripts\host-launcher.mjs','server\index.js','client\index.html')) {
    if (-not (Test-Path -LiteralPath (Join-Path $verify $file))) { throw "Arquivo ausente depois de extrair: $file" }
  }
  Write-Output "Instalador pronto: $setup"
  Get-Item -LiteralPath $setup | Select-Object FullName,Length,LastWriteTime
} finally {
  Remove-TemporaryFolder $stage
  Remove-TemporaryFolder $verify
  if (Test-Path -LiteralPath $payload) { Remove-Item -LiteralPath $payload -Force }
}
