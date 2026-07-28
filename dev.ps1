# Sobe a plataforma inteira para desenvolvimento: API e aplicação React.
#
#   .\dev.ps1              API em :8000, Vite em :5173 (o de todo dia)
#   .\dev.ps1 -Unico       só a API em :8000, servindo o build — como em produção
#   .\dev.ps1 -Parar       encerra o que estiver rodando nas duas portas
#
# Por que dois processos no dia a dia, se a imagem de produção é uma só: o Vite
# troca o módulo editado no navegador sem recarregar a página, e é isso que faz
# mexer em tela custar segundos em vez de um build inteiro. A API serve a SPA
# igual em ambos — a diferença é de onde vem o JavaScript, e o `-Unico` existe
# para conferir o que realmente vai para produção antes de subir.

[CmdletBinding()]
param(
    [switch]$Unico,
    [switch]$Parar
)

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$python = Join-Path $raiz 'backend\.venv\Scripts\python.exe'

function Parar-Porta([int]$porta, [string]$rotulo) {
    $conexoes = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue
    if (-not $conexoes) { return $false }
    foreach ($pid_ in ($conexoes.OwningProcess | Select-Object -Unique)) {
        Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
        Write-Host "  $rotulo (porta $porta, pid $pid_) encerrado" -ForegroundColor DarkGray
    }
    return $true
}

if ($Parar) {
    Write-Host "`nEncerrando..." -ForegroundColor Cyan
    $a = Parar-Porta 8000 'API'
    $b = Parar-Porta 5173 'Vite'
    if (-not ($a -or $b)) { Write-Host '  nada rodando' -ForegroundColor DarkGray }
    Write-Host ''
    return
}

if (-not (Test-Path $python)) {
    Write-Host "`nO ambiente Python nao existe em backend\.venv" -ForegroundColor Red
    Write-Host "  py -3.12 -m venv backend\.venv"
    Write-Host "  backend\.venv\Scripts\python.exe -m pip install -e `"backend[dev,bim]`"`n"
    exit 1
}

# Portas ocupadas de uma execucao anterior derrubam a nova sem explicar por que.
Parar-Porta 8000 'API anterior' | Out-Null
if (-not $Unico) { Parar-Porta 5173 'Vite anterior' | Out-Null }

if ($Unico) {
    # O build precisa estar em backend/static: e a presenca desse diretorio que
    # faz a API servir a aplicacao (ver backend/app/spa.py).
    Write-Host "`n[1/2] compilando a aplicacao" -ForegroundColor Cyan
    Push-Location (Join-Path $raiz 'frontend')
    try { npm run build } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Write-Host "`nbuild falhou`n" -ForegroundColor Red; exit 1 }

    $static = Join-Path $raiz 'backend\static'
    if (Test-Path $static) { Remove-Item $static -Recurse -Force }
    Copy-Item (Join-Path $raiz 'frontend\dist') $static -Recurse

    Write-Host "[2/2] subindo a API (serve API + aplicacao)`n" -ForegroundColor Cyan
    Write-Host "  http://localhost:8000  <- tudo aqui`n" -ForegroundColor Green
    Push-Location (Join-Path $raiz 'backend')
    try { & $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 } finally { Pop-Location }
    return
}

Write-Host "`nSubindo a plataforma" -ForegroundColor Cyan

# A API em janela propria: o log dela e o primeiro lugar onde se olha quando
# uma tela responde errado, e misturado com o do Vite nao se acha nada.
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$(Join-Path $raiz 'backend')'; " +
    "`$Host.UI.RawUI.WindowTitle = 'SPBIM · API :8000'; " +
    "& '$python' -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
)

Write-Host '  API .......... http://localhost:8000     (janela propria, com --reload)'
Write-Host '  aplicacao .... http://localhost:5173     (nesta janela, com hot-reload)' -ForegroundColor Green
Write-Host '  banco ........ Supabase (ver .env)'
Write-Host "`n  Ctrl+C encerra o Vite; a API fica. Use .\dev.ps1 -Parar para encerrar tudo.`n" -ForegroundColor DarkGray

Push-Location (Join-Path $raiz 'frontend')
try { npm run dev } finally { Pop-Location }
