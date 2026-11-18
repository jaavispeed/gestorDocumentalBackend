Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Iniciando Ecosistema Gestor Documental + AutoManual" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

Write-Host "[1/2] Iniciando Backend NestJS (Puerto 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Git\gestorDocumentalBackend; Write-Host '=== BACKEND NESTJS (Puerto 3000) ===' -ForegroundColor Cyan; npm run start:dev"

Start-Sleep -Seconds 3

Write-Host "[2/2] Iniciando Frontend Angular (Puerto 4200)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Git\gestorDocumentalFront; Write-Host '=== FRONTEND ANGULAR (Puerto 4200) ===' -ForegroundColor Yellow; npm start"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Servicios levantados en ventanas de PowerShell independientes:" -ForegroundColor Green
Write-Host "  - Frontend: http://localhost:4200" -ForegroundColor White
Write-Host "  - Backend:  http://localhost:3000" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Green
