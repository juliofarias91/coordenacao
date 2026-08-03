# Casca. A lógica vive em `scripts/dev.mjs` — ver o cabeçalho dele.
#
#   .\dev.ps1              API em :8000, Vite em :5173 (o de todo dia)
#   .\dev.ps1 -Unico       só a API em :8000, servindo o build — como em produção
#   .\dev.ps1 -Parar       encerra o que estiver rodando nas duas portas
#
# Equivale a `npm run dev`, `npm run dev:unico` e `npm run parar`.
#
# ESTE ARQUIVO NÃO IMPLEMENTA MAIS NADA, de propósito. Ele fazia tudo em
# PowerShell e abria a API numa JANELA SEPARADA (`Start-Process -NoExit`) — cada
# execução deixava um terminal novo aberto, e fechar a sessão deixava a janela
# órfã ouvindo na 8000. O `dev.mjs` põe os dois processos no mesmo terminal, com
# a saída prefixada, e o `Ctrl+C` derruba a árvore inteira.
#
# A casca fica porque `.\dev.ps1` está na memória muscular de quem já usava o
# projeto e no histórico do terminal. Duas implementações, não — elas
# divergiriam na primeira mudança de porta.

[CmdletBinding()]
param(
    [switch]$Unico,
    [switch]$Parar
)

$ErrorActionPreference = 'Stop'

$argumentos = @(Join-Path $PSScriptRoot 'scripts\dev.mjs')
if ($Unico) { $argumentos += '--unico' }
if ($Parar) { $argumentos += '--parar' }

& node @argumentos
exit $LASTEXITCODE
