#!/usr/bin/env pwsh
# ============================================
#  Free Claude Code - Launch Claude CLI
# ============================================

# Override stale host env vars
$env:MESSAGING_PLATFORM = "none"
$env:WHISPER_DEVICE = "cpu"
$env:WHISPER_MODEL = "base"

# Read MODEL from .env file
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    $modelLine = Get-Content $envFile | Where-Object { $_ -match '^\s*MODEL=' } | Select-Object -Last 1
    if ($modelLine -match 'MODEL="?([^"]+)"?') {
        $env:MODEL = $Matches[1]
    }
}

if (-not $env:MODEL -or $env:MODEL -like "nvidia_nim*") {
    $env:MODEL = "open_router/openai/gpt-oss-120b:free"
}

uv run fcc-claude @args
