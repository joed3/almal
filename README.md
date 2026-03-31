# Almal

A multi-agent stock portfolio monitoring and optimization tool powered by Claude.

## Prerequisites

- Python 3.11+
- Node 18+
- [uv](https://github.com/astral-sh/uv)
- npm

## Setup

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd almal
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   # Edit .env and fill in your ANTHROPIC_API_KEY
   ```

3. **Install backend dependencies**

   ```bash
   uv sync --dev
   ```

4. **Install pre-commit hooks**

   ```bash
   pre-commit install
   ```

5. **Install frontend dependencies**

   ```bash
   cd frontend && npm install
   ```

## Running locally

**Backend**

```bash
uv run uvicorn backend.src.api.main:app --reload
```

**Frontend**

```bash
cd frontend && npm run dev
```

## Running tests

```bash
uv run pytest
```

## Running linting

```bash
uv run ruff check . && uv run black --check .
```
