# Almal

A multi-agent stock portfolio monitoring and optimization tool powered by Claude.

Almal lets you profile the historical performance of a portfolio against benchmarks,
research individual stocks and ETFs, and generate optimized allocations — all through
a clean, interactive interface backed by a multi-agent AI system.

## Prerequisites

- Python 3.11+
- Node 18+
- [uv](https://github.com/astral-sh/uv)
- npm
- An [Anthropic API key](https://console.anthropic.com/)

## Setup

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd almal
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Open `.env` and set your Anthropic API key:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
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

## Running the app

The app requires two processes running simultaneously — the backend API and the
frontend dev server. Open two terminal windows from the repo root.

**Terminal 1 — Backend API** (runs on http://localhost:8100)

```bash
uv run uvicorn backend.src.api.main:app --reload --port 8100
```

**Terminal 2 — Frontend** (runs on http://localhost:5200)

```bash
cd frontend && npm run dev
```

Open http://localhost:5200 in your browser.

The backend API docs (Swagger UI) are available at http://localhost:8100/docs.

## Using the app

### Portfolio Profiler

Profile the historical performance of an existing portfolio against a benchmark.

1. Navigate to **Portfolio Profiler** in the sidebar.
2. Upload a CSV of your holdings (see [Example data](#example-data) below).
3. Select a benchmark (SPY, QQQ, VTI, IWM, or a custom ticker) and a time horizon.
4. Click **Analyse** to run the full analysis.

The profiler shows cumulative return vs the benchmark, key performance metrics
(total return, Sharpe ratio, max drawdown, alpha, beta), a holdings weight breakdown,
and an AI-generated critique from the Review Agent.

### Investment Investigator

Research a stock or ETF by ticker and see how it would fit an existing portfolio.

1. Navigate to **Investigator** in the sidebar.
2. Search for any public company (e.g. "Apple" or "MSFT") using the predictive autocomplete field.
3. Review the AI-generated fundamental thesis and view quantitative price histories.
4. Drag and drop your `.csv` into the Portfolio Context box to visualize exact percentage matches.

### Portfolio Optimizer

Generate an optimized allocation given a set of candidate tickers and a principal amount.

1. Navigate to **Optimizer** in the sidebar.
2. Provide an array of candidate investments or drag and drop your existing `.csv` into the dropzone to inherit context.
3. Select an objective Strategy (Conservative Min Volatility, Balanced Max Sharpe, or Aggressive Max Return).
4. Enter an investable Principal Amount and generate your exact trade instructions alongside an Efficient Frontier locus.

## Example data

A sample portfolio CSV is provided at `examples/sample_portfolio.csv`. It contains
13 lots across 9 tickers (AAPL, MSFT, NVDA, AMZN, JPM, JNJ, XOM, VTI, BRK-B) with
purchase dates and cost basis per share.

```bash
# Upload the sample via the UI, or test the API directly:
curl -X POST http://localhost:8100/portfolio/upload \
  -F "file=@examples/sample_portfolio.csv"
```

### CSV format

The parser is flexible and infers columns by name. The only required column is a
ticker/symbol column. All other columns are optional.

| Column | Recognised names | Example |
|---|---|---|
| Ticker | Symbol, Ticker, Stock | AAPL |
| Shares | Shares, Quantity, Units, Qty | 25 |
| Purchase date | Date, Purchased, Acquisition | 2023-01-10 |
| Cost basis | Cost, Price, Basis, Avg, Average | 130.73 |

Multiple rows with the same ticker are treated as separate lots and grouped into
a single holding.

## Development

### Running tests

```bash
uv run pytest
```

With coverage report:

```bash
uv run pytest --cov
```

### Linting and type checking

```bash
uv run ruff check backend/
uv run black --check backend/
uv run mypy backend/src
```

### Pre-commit

All of the above run automatically on every `git commit` via pre-commit hooks.
To run manually against all files:

```bash
pre-commit run --all-files
```

## Project structure

```
almal/
├── backend/
│   ├── src/
│   │   ├── agents/       # Orchestrator, Research, Optimizer, Review agents
│   │   ├── analysis/     # Portfolio performance calculations
│   │   ├── api/          # FastAPI app and routes
│   │   ├── config/       # Settings (loaded from .env)
│   │   ├── data/         # yfinance client, CSV parser
│   │   └── models/       # Pydantic data models
│   └── tests/
├── examples/             # Sample data files
├── frontend/
│   └── src/
│       ├── components/   # Reusable UI components
│       └── pages/        # One page per feature
├── .env.example
├── CHANGELOG.md
├── PROJECT_PLAN.md
└── pyproject.toml
```
