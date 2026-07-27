@echo off
chcp 65001 >nul
setlocal
title Auditer - iniciando...
cd /d "%~dp0"

echo.
echo   ==========================================
echo      AUDITER - Plataforma de auditoria
echo   ==========================================
echo.

REM ======================================================================
REM  1) Node.js instalado? Se nao, tenta instalar sozinho via winget.
REM ======================================================================
where node >nul 2>nul
if not errorlevel 1 goto node_ok

echo   Node.js nao encontrado nesta maquina.
echo.

where winget >nul 2>nul
if errorlevel 1 goto node_manual

echo   Vou tentar instalar o Node.js automaticamente ^(pode pedir permissao^).
echo   Aguarde...
echo.
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
echo.

REM O PATH desta janela ainda nao conhece o Node recem-instalado: adiciona a
REM pasta padrao e tenta de novo, para nao precisar reabrir o atalho.
set "PATH=%PATH%;%ProgramFiles%\nodejs\;%ProgramFiles(x86)%\nodejs\"
where node >nul 2>nul
if not errorlevel 1 goto node_ok

echo   ------------------------------------------------------------------
echo   Node.js instalado. Feche esta janela e clique no atalho de novo
echo   para o Windows reconhecer a instalacao.
echo   ------------------------------------------------------------------
echo.
pause
exit /b 0

:node_manual
echo   [ERRO] Node.js nao encontrado e o instalador automatico ^(winget^)
echo   nao esta disponivel nesta maquina.
echo.
echo   Instale o Node.js "LTS" manualmente e clique no atalho de novo:
echo   https://nodejs.org
echo.
pause
exit /b 1

:node_ok

REM ======================================================================
REM  2) Primeira vez: instala dependencias + dicionario pt-BR.
REM ======================================================================
if exist "node_modules" goto deps_ok
echo   Primeira execucao nesta maquina.
echo   Instalando dependencias e o dicionario pt-BR ^(~5,5 MB^)...
echo   Isso pode levar 1 a 2 minutos. Aguarde.
echo.
call npm install
if errorlevel 1 goto fail_install
echo.
echo   Instalacao concluida.
echo.
:deps_ok

REM ======================================================================
REM  3) Monta a versao de producao SEMPRE, para garantir que roda a versao
REM     mais recente do codigo (sem risco de versao velha em cache).
REM     (E a versao estavel: o corretor ortografico nao falha aqui, ao
REM      contrario do modo de desenvolvimento.)
REM ======================================================================
echo   Preparando o aplicativo ^(cerca de 30 segundos^)...
echo.
call npm run build
if errorlevel 1 goto fail_build
echo.

REM ======================================================================
REM  4) Sobe o app e abre o navegador.
REM ======================================================================
echo   Iniciando o Auditer...
echo   O navegador vai abrir sozinho. Se nao abrir, use o endereco que
echo   aparecer abaixo ^(ex.: http://localhost:4173^).
echo.
echo   Para ENCERRAR o app: feche esta janela preta.
echo.

call npm run preview -- --open

echo.
echo   O aplicativo foi encerrado.
pause
exit /b 0

:fail_install
echo.
echo   [ERRO] A instalacao das dependencias falhou. Veja as mensagens acima.
echo.
pause
exit /b 1

:fail_build
echo.
echo   [ERRO] A preparacao do aplicativo falhou. Veja as mensagens acima.
echo.
pause
exit /b 1
