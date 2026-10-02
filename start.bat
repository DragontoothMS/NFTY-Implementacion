@echo off
chcp 65001 >nul
title botTaller - Server
color 0A
cls

REM Leer PORT desde .env (default 3001)
set PORT=3001
for /f "tokens=2 delims==" %%a in ('findstr /i "^PORT=" .env 2^>nul') do set PORT=%%a

echo.
echo --------------------------------------------------------------
echo   botTaller - Server (localhost:%PORT%)
echo   ngrok corre por separado en background
echo --------------------------------------------------------------
echo.

REM 1. Kill process en puerto %PORT%
echo [1/3] Limpiando puerto %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do (
    echo   Matando PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=2" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do (
    echo   Matando PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)
echo   Puerto %PORT% libre.

REM 2. Verificar dependencias
echo [2/3] Verificando dependencias...
if not exist node_modules (
    echo   Instalando dependencias...
    call npm install --production
)

REM 3. Verificar .env
echo [3/3] Verificando configuracion...
echo   (revisa que .env tenga KAPSO_API_KEY, SUPABASE_KEY, etc.)

echo.
echo   Server:  http://localhost:%PORT%
echo   Health:  http://localhost:%PORT%/
echo.
echo   [Ctrl+C para detener]
echo.

echo --------------------------------------------------------------
echo   botTaller - Bot SIMPLE (test)
echo   Puerto: %PORT%
echo   Kapso Phone ID: 1379301215262931
echo   Mensaje: Bot de prueba funcionando - mensaje unico sin BD ni estado
echo --------------------------------------------------------------
echo.

echo Rutas:
echo   GET  /            - health check
echo   POST /            - webhook de Kapso
echo   POST /webhook     - webhook de Kapso (alias)
echo   POST /test        - simular webhook (debug)
echo.

echo Estado de variables de entorno:
echo   KAPSO_API_KEY: configurada
echo   PHONE_NUMBER_ID: configurado
echo.

REM Arrancar server.js
node server.js

echo.
echo Server detenido.
pause
