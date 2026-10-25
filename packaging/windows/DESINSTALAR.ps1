Add-Type -AssemblyName System.Windows.Forms

$answer = [System.Windows.Forms.MessageBox]::Show(
  'Feche a janela do anfitrião antes de remover o jogo. Deseja desinstalar TankDots Wars deste usuário?',
  'Desinstalar TankDots Wars',
  [System.Windows.Forms.MessageBoxButtons]::YesNo,
  [System.Windows.Forms.MessageBoxIcon]::Question
)
if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) { exit 0 }

$localBase = [IO.Path]::GetFullPath([Environment]::GetFolderPath('LocalApplicationData')).TrimEnd('\')
$install = [IO.Path]::GetFullPath((Join-Path $localBase 'TankDots Wars')).TrimEnd('\')
$menuBase = [IO.Path]::GetFullPath([Environment]::GetFolderPath('StartMenu')).TrimEnd('\')
$menu = [IO.Path]::GetFullPath((Join-Path $menuBase 'Programs\TankDots Wars')).TrimEnd('\')
if (-not $install.StartsWith($localBase + '\', [StringComparison]::OrdinalIgnoreCase) -or
    -not $menu.StartsWith($menuBase + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Caminho de instalação fora da pasta esperada.'
}

try {
  $desktopLink = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'TankDots Wars.lnk'
  if (Test-Path -LiteralPath $desktopLink) { Remove-Item -LiteralPath $desktopLink -Force }
  if (Test-Path -LiteralPath $menu) { Remove-Item -LiteralPath $menu -Recurse -Force }
  Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\TankDotsWars' -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $install) { Remove-Item -LiteralPath $install -Recurse -Force }
  [System.Windows.Forms.MessageBox]::Show('TankDots Wars foi removido.', 'Desinstalação concluída') | Out-Null
} catch {
  [System.Windows.Forms.MessageBox]::Show("Não foi possível concluir a remoção: $($_.Exception.Message)", 'TankDots Wars') | Out-Null
  exit 1
}
