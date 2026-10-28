# package.ps1
# Empaqueta la extensión Copilot Model Restore en un archivo .vsix
# para que pueda instalarse de manera natural en VS Code.

[CmdletBinding()]
param(
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "==> Empaquetando Copilot Model Restore" -ForegroundColor Cyan

# 1. Verificar que Node.js / npm estén disponibles.
$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
    throw "npm no está instalado. Instala Node.js desde https://nodejs.org y vuelve a intentarlo."
}

# 2. Asegurar que @vscode/vsce esté disponible.
$vsce = Get-Command vsce -ErrorAction SilentlyContinue

if (-not $vsce -and -not $SkipInstall) {
    Write-Host "==> @vscode/vsce no está instalado. Instalándolo globalmente..." -ForegroundColor Yellow
    npm install -g @vscode/vsce
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo instalar @vscode/vsce."
    }
    $vsce = Get-Command vsce -ErrorAction SilentlyContinue
}

if (-not $vsce) {
    throw "No se encontró 'vsce'. Instálalo con: npm install -g @vscode/vsce"
}

# 3. Empaquetar el VSIX.
Write-Host "==> Generando el archivo .vsix..." -ForegroundColor Cyan
& $vsce.Source package --no-dependencies --allow-missing-repository

if ($LASTEXITCODE -ne 0) {
    throw "El empaquetado falló."
}

# 4. Mostrar el archivo generado.
$vsix = Get-ChildItem -Path $root -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($vsix) {
    Write-Host ""
    Write-Host "==> VSIX generado:" -ForegroundColor Green
    Write-Host "    $($vsix.FullName)"
    Write-Host ""
    Write-Host "Para instalarlo:"
    Write-Host "    code --install-extension `"$($vsix.FullName)`""
    Write-Host "O en VS Code: Extensions (Ctrl+Shift+X) > ... > Install from VSIX..."
} else {
    Write-Warning "No se encontró ningún archivo .vsix en $root"
}

# 5. Instalar el VSIX automáticamente.
if ($vsix) {
    Write-Host ""
    Write-Host "==> Instalando el VSIX en VS Code..." -ForegroundColor Cyan
    & code --install-extension "$($vsix.FullName)"

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "==> Extensión instalada correctamente." -ForegroundColor Green
        Write-Host "    Reinicia VS Code (o recarga la ventana) para que surta efecto."
    } else {
        Write-Warning "La instalación devolvió el código $LASTEXITCODE. Revisa que 'code' esté en el PATH."
    }
}