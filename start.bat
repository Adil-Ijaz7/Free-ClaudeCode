@echo off
REM ============================================
REM  Free Claude Code - OpenRouter Launcher
REM ============================================
REM  1. Set your OpenRouter API key below
REM  2. Set your preferred model
REM  3. Run this script: start.bat
REM  4. Then in another terminal run: fcc-claude
REM ============================================

REM --- Your OpenRouter API Key (get one at https://openrouter.ai/keys) ---
set OPENROUTER_API_KEY=%OPENROUTER_API_KEY%

REM --- Model to use (browse at https://openrouter.ai/models) ---
REM Examples:
REM   open_router/anthropic/claude-sonnet-4-20250514
REM   open_router/anthropic/claude-3.5-sonnet
REM   open_router/google/gemini-2.5-pro-preview
REM   open_router/deepseek/deepseek-r1
REM   open_router/meta-llama/llama-4-maverick
set MODEL=open_router/anthropic/claude-sonnet-4-20250514

REM --- Override stale host env vars ---
set MESSAGING_PLATFORM=none
set WHISPER_DEVICE=cpu
set WHISPER_MODEL=base
set FCC_OPEN_BROWSER=true

echo.
echo  Free Claude Code - OpenRouter Proxy
echo  ====================================
echo  Model: %MODEL%
echo  Server: http://127.0.0.1:8082
echo  Admin:  http://127.0.0.1:8082/admin
echo.
echo  After the server starts, open another terminal and run:
echo    uv run fcc-claude
echo.
echo  Or point Claude Code / VS Code at:
echo    http://127.0.0.1:8082
echo.

uv run fcc-server
