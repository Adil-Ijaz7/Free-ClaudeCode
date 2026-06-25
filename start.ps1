#!/usr/bin/env pwsh
# ============================================
#  Free Claude Code - OpenRouter Launcher
# ============================================

# Override ALL stale host environment variables
$env:MESSAGING_PLATFORM = 'none'
$env:WHISPER_DEVICE = 'cpu'
$env:WHISPER_MODEL = 'base'
$env:FCC_OPEN_BROWSER = 'true'

# Read MODEL from .env file (dotenv wins over stale process env)
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*MODEL\s*=\s*"?([^"#]+)"?') {
            $env:MODEL = $Matches[1].Trim()
            break
        }
    }
}

# Fallback if still not set
if (-not $env:MODEL -or $env:MODEL -like 'nvidia_nim*') {
    $env:MODEL = 'open_router/openai/gpt-oss-120b:free'
}

# Kill any existing process on port 8082
$conns = Get-NetTCPConnection -LocalPort 8082 -ErrorAction SilentlyContinue
if ($conns) {
    $pids = $conns | Where-Object { $_.OwningProcess -ne 0 } |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pids) {
        Write-Host "  Stopping previous server (PID $p)..." -ForegroundColor Yellow
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

Write-Host ''
Write-Host '  Free Claude Code - OpenRouter Proxy' -ForegroundColor Cyan
Write-Host '  ====================================' -ForegroundColor Cyan
Write-Host "  Model:  $env:MODEL" -ForegroundColor Green
Write-Host '  Server: http://127.0.0.1:8082' -ForegroundColor Yellow
Write-Host '  Admin:  http://127.0.0.1:8082/admin' -ForegroundColor Yellow
Write-Host ''
Write-Host '  After the server starts, open another terminal and run:' -ForegroundColor White
Write-Host '    .\claude.ps1' -ForegroundColor Green
Write-Host ''

Push-Location $PSScriptRoot
try {
    uv run fcc-server
} finally {
    Pop-Location
}
