<div align="center">

# 🤖 OpenRouter Agent 

A standalone AI Coding Agent and VS Code Extension powered exclusively by **OpenRouter**. 

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Python 3.14](https://img.shields.io/badge/python-3.14-3776ab.svg?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/downloads/)
[![uv](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/uv/main/assets/badge/v0.json&style=for-the-badge)](https://github.com/astral-sh/uv)

This project has been renewed to focus on providing a native CLI coding agent and a robust VS Code extension backend, routing all traffic through OpenRouter.

</div>

## What You Get

- **CLI Agent**: A powerful standalone terminal tool (`fcc-claude`) that runs the agentic thought-action-observation loop directly.
- **VS Code Extension Backend**: A local FastAPI server that provides chat and autocomplete endpoints for the upcoming VS Code Extension.
- **OpenRouter Exclusive**: Simplifies configuration and architecture by relying entirely on OpenRouter for LLM connectivity.

## Quick Start

### 1. Install/Update

```powershell
# Requires Astral uv and Python 3.14
uv sync
```

### 2. Configure OpenRouter

Copy `.env.example` to `.env` and set your OpenRouter API key:
```env
OPENROUTER_API_KEY="sk-or-v1-..."
```

### 3. Start The Backend Server (For VS Code Extension)

```bash
fcc-server
```
The server will run on port 8082 by default, exposing the local agentic API.

### 4. Run the CLI Agent

```bash
fcc-claude
```
The CLI tool will prompt you for coding tasks and use OpenRouter models to autonomously edit your codebase.

## Development

```text
openrouter-agent/
├── server.py              # ASGI entry point for VS Code Extension backend
├── api/                   # FastAPI routes (Chat, Autocomplete)
├── core/agent/            # Agentic Loop and Tools
├── providers/             # OpenRouter connectivity
├── cli/                   # CLI agent entry points
└── vscode-ext/            # (WIP) TypeScript VS Code Extension
```

### Commands

```bash
uv run ruff format
uv run ruff check
uv run ty check
uv run pytest
```

## License

MIT License. See [LICENSE](LICENSE) for details.
