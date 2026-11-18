@echo off
title Gestor Documental - Lanzador Global
color 0A
echo ============================================================
echo   Iniciando Ecosistema Gestor Documental + AutoManual
echo ============================================================
echo.
echo [1/2] Iniciando Backend en ventana independiente...
start "Gestor Documental - Backend (NestJS)" "C:\Git\start-backend.bat"

echo.
echo [2/2] Esperando 3 segundos e iniciando Frontend...
timeout /t 3 /nobreak >nul
start "Gestor Documental - Frontend (Angular)" "C:\Git\start-frontend.bat"

echo.
echo ============================================================
echo   Servicios lanzados con exito en ventanas separadas!
echo   - Frontend: http://localhost:4200
echo   - Backend:  http://localhost:3000
echo ============================================================
echo.
timeout /t 5
