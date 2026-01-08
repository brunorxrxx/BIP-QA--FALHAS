@echo off
REM ============================================
REM Script para iniciar BIP QA Backend Offline
REM ============================================

echo.
echo ========================================
echo   BIP QA - Iniciando Backend Local
echo ========================================
echo.

REM Verifica se Python está instalado
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Python não encontrado!
    echo Baixe em: https://www.python.org/downloads/
    echo Certifique-se de marcar "Add Python to PATH" durante instalação
    pause
    exit /b 1
)

echo [OK] Python detectado
echo.

REM Verifica se requirements.txt existe
if not exist "requirements.txt" (
    echo [ERRO] requirements.txt não encontrado
    echo Certifique-se de estar na pasta do projeto
    pause
    exit /b 1
)

echo [OK] requirements.txt encontrado
echo.

REM Instala dependências (se necessário)
echo Instalando dependências...
pip install -q fastapi uvicorn pandas openpyxl

if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao instalar dependências
    pause
    exit /b 1
)

echo [OK] Dependências instaladas
echo.

REM Inicia o backend
echo ========================================
echo   Backend iniciando na porta 8000
echo ========================================
echo.
echo Acesse em qualquer navegador:
echo file:///[caminho]/index.html
echo.
echo Para parar: Pressione Ctrl+C
echo.

python backend.py

pause
