@echo off
setlocal EnableDelayedExpansion
title Limpieza Total de AnyDesk (Reseteo de ID y Cache)

:: 1. Comprobar si se ejecuta con permisos de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ========================================================
    echo  [!] Se requieren permisos de Administrador.
    echo  Solicitando elevacion de privilegios...
    echo ========================================================
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ========================================================
echo     LIMPIEZA TOTAL DE ANYDESK (RESET DE ID Y PUBLICIDAD)
echo ========================================================
echo.

:: 2. Detener TODOS los servicios relacionados con AnyDesk (incluyendo versiones corporativas/MSI)
echo [1/5] Deteniendo servicios de AnyDesk...
powershell -Command "Get-Service | Where-Object { $_.Name -like '*anydesk*' -or $_.DisplayName -like '*anydesk*' } | ForEach-Object { Write-Host '  - Deteniendo servicio:' $_.Name; Stop-Service -Name $_.Name -Force -ErrorAction SilentlyContinue }"

:: 3. Cerrar TODOS los procesos de AnyDesk
echo [2/5] Cerrando procesos de AnyDesk...
taskkill /F /IM AnyDesk*.exe /T >nul 2>&1
powershell -Command "Get-Process | Where-Object { $_.ProcessName -like '*anydesk*' } | Stop-Process -Force -ErrorAction SilentlyContinue"

:: Esperar 2 segundos para liberar bloqueos de archivo
timeout /t 2 /nobreak >nul

:: 4. Eliminar carpetas completas de datos, IDs, tokens y caches
echo [3/5] Eliminando carpetas de datos y archivos de seguimiento...

:: AppData Roaming (Configuracion de usuario, IDs portables, tokens)
if exist "%APPDATA%\AnyDesk" (
    echo   - Borrando: %APPDATA%\AnyDesk
    rmdir /s /q "%APPDATA%\AnyDesk" >nul 2>&1
)
for /d %%d in ("%APPDATA%\AnyDesk*") do (
    echo   - Borrando: %%d
    rmdir /s /q "%%d" >nul 2>&1
)

:: AppData Local (Cache local y temporales)
if exist "%LOCALAPPDATA%\AnyDesk" (
    echo   - Borrando: %LOCALAPPDATA%\AnyDesk
    rmdir /s /q "%LOCALAPPDATA%\AnyDesk" >nul 2>&1
)
for /d %%d in ("%LOCALAPPDATA%\AnyDesk*") do (
    echo   - Borrando: %%d
    rmdir /s /q "%%d" >nul 2>&1
)

:: ProgramData (Servicios instalados, device-id.cache, system.conf, service.conf)
if exist "%ProgramData%\AnyDesk" (
    echo   - Borrando: %ProgramData%\AnyDesk
    rmdir /s /q "%ProgramData%\AnyDesk" >nul 2>&1
)
for /d %%d in ("%ProgramData%\AnyDesk*") do (
    echo   - Borrando: %%d
    rmdir /s /q "%%d" >nul 2>&1
)

:: Archivos temporales de AnyDesk en %TEMP%
del /f /s /q "%TEMP%\*anydesk*" >nul 2>&1
del /f /s /q "%TEMP%\ad_*" >nul 2>&1

:: 5. Limpiar claves de Registro asociadas a AnyDesk
echo [4/5] Limpiando claves residuales en el Registro de Windows...
reg delete "HKCU\Software\AnyDesk" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\AnyDesk" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\WOW6432Node\AnyDesk" /f >nul 2>&1

echo [5/5] Reanudando servicios limpios (si existen)...
powershell -Command "Get-Service | Where-Object { $_.Name -like '*anydesk*' } | ForEach-Object { Write-Host '  - Iniciando servicio con nueva configuracion:' $_.Name; Start-Service -Name $_.Name -ErrorAction SilentlyContinue }"

echo.
echo ========================================================
echo  [OK] LIMPIEZA COMPLETA TERMINADA
echo ========================================================
echo.
echo Se eliminaron por completo:
echo  * ID anterior y tokens de instalacion (system.conf, service.conf)
echo  * Cache de dispositivo (device-id.cache) que rastrea la publicidad
echo  * Historial de sesiones, favoritos y chats
echo  * Logs y archivos de trazas de conexion
echo.
echo La proxima vez que abras AnyDesk se generara un ID NUEVO
echo desde cero, sin historial de uso comercial ni publicidad.
echo.
pause
