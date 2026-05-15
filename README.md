# Almal

https://github.com/user-attachments/assets/fc03c5e4-b4b9-40ed-91f1-d126db1cc5bc

A multi-agent stock portfolio monitoring and optimization tool powered by Claude.

Almal lets you profile historical portfolio performance, research individual stocks and ETFs, find diversifiers for an existing portfolio, and generate optimized allocations — all through a clean, theme-aware interface backed by a multi-agent AI system.

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

The app requires two processes — the backend API and the frontend dev server. Open two terminal windows from the repo root.

**Terminal 1 — Backend API** (http://localhost:8100)

```bash
uv run uvicorn backend.src.api.main:app --reload --port 8100
```

**Terminal 2 — Frontend** (http://localhost:5200)

```bash
cd frontend && npm run dev
```

Open http://localhost:5200 in your browser. The Swagger UI is at http://localhost:8100/docs.

## Using the app

Navigation is via the sticky top bar: **Dashboard**, **Research**, **Diversify**, **Optimize**.

### Dashboard

Profile the historical performance of an existing portfolio against one or more benchmarks.

1. Upload a portfolio CSV using the floating button (bottom right) — see [CSV format](#csv-format).
2. Open the **Settings** popover (⚙) to add or remove benchmark tickers and choose a time horizon.
3. Click **Analyse** to run the full analysis.

Results include cumulative return vs each benchmark, key metrics (Sharpe, max drawdown, alpha/beta), a holdings weight breakdown, and an AI-generated critique. The correlation heatmap is collapsed by default — click the chevron to expand it.

### Research

Research a single stock or ETF and see how it would fit your portfolio.

1. Search by name or ticker using the autocomplete field (results appear after 250 ms).
2. Review price history, fundamental stats, and the AI-generated investment thesis.
3. If a portfolio is loaded, the **Portfolio Fit** panel scores the ticker's diversification value against your holdings.

Navigating from the **Diversify** page pre-fills the search field via a `?ticker=` URL param.

### Diversify

Score a candidate pool by diversification value and surface what your portfolio is missing.

1. Enable asset categories using the chips at the top. Each chip toggles the whole category; click the **▾** arrow on any chip to expand it and select individual tickers within that category.
2. Optionally add custom tickers (paste comma-separated symbols) in the **Add Custom Tickers** field.
3. Click **Find Diversifiers** to run the analysis.

Results show a risk/return scatter (portfolio holdings vs candidates), a correlation heatmap, and ranked candidate cards. Each card has a **Research →** button that opens the ticker in the Research page.

### Optimize

Generate an optimized allocation from a set of candidate tickers.

1. Enter candidate tickers (individual or comma-separated bulk paste) and set an investable **Principal**.
2. Choose a **Strategy**:
   - *Min Volatility* — lowest portfolio variance
   - *Max Sharpe* — best risk-adjusted return
   - *Balanced* — regularised Sharpe for more even weight distribution
   - *Max Return* — highest expected return
   - *Risk Parity* — equal risk contribution per asset
   - *CVaR* — minimise conditional value-at-risk
   - *HRP* — hierarchical risk parity
   - *Black-Litterman* — incorporate custom return views
3. Optionally set **global max/min position %** constraints, or expand the **NLP constraints** panel for free-text overrides (e.g. "no more than 15% in AAPL").
4. In **Rebalance mode** (toggle at top), the optimizer reads your current holdings. Use the lock toggles per holding — or **Lock all** / **Clear** — to prevent the optimizer from reducing those positions.
5. Click **Run Optimization**. The stepper advances to the Results view, which shows the allocation table, efficient frontier, risk/return scatter, and an AI critique. Click **← Reconfigure** to return to the inputs.

## Example data

A sample portfolio CSV is provided at `examples/sample_portfolio.csv`. It contains 13 lots across 9 tickers (AAPL, MSFT, NVDA, AMZN, JPM, JNJ, XOM, VTI, BRK-B) with purchase dates and cost basis.

```bash
# Upload the sample via the UI, or test the API directly:
curl -X POST http://localhost:8100/portfolio/upload \
  -F "file=@examples/sample_portfolio.csv"
```

### CSV format

The parser infers columns by name. The only required column is a ticker/symbol column.

| Column | Recognised names | Example |
|---|---|---|
| Ticker | Symbol, Ticker, Stock | AAPL |
| Shares | Shares, Quantity, Units, Qty | 25 |
| Purchase date | Date, Purchased, Acquisition | 2023-01-10 |
| Cost basis | Cost, Price, Basis, Avg, Average | 130.73 |

Multiple rows for the same ticker are treated as separate lots and grouped into a single holding.

## Development

### Running tests

**Backend**

```bash
uv run pytest
```

With coverage report:

```bash
uv run pytest --cov
```

**Frontend**

```bash
cd frontend && npm test
```

### Linting and type checking

```bash
# Backend
uv run ruff check backend/
uv run black --check backend/
uv run mypy backend/src

# Frontend
cd frontend && npm run lint
```

### Pre-commit

All backend checks run automatically on every `git commit` via pre-commit hooks. To run manually against all files:

```bash
pre-commit run --all-files
```

## Project structure

```
almal/
├── backend/
│   ├── src/
│   │   ├── agents/           # AI agents
│   │   │   ├── orchestrator  # Routes intents to specialist agents
│   │   │   ├── research      # Single-ticker fundamental analysis
│   │   │   ├── optimizer     # Portfolio optimisation (PyPortfolioOpt / skfolio)
│   │   │   ├── review        # AI critique generation (Claude)
│   │   │   └── constraint_parser  # NLP → structured ConstraintSet
│   │   ├── analysis/
│   │   │   ├── optimization  # Weight bounds, constraint resolution, backtest
│   │   │   └── performance   # Portfolio metrics, benchmark comparison
│   │   ├── api/
│   │   │   └── routes/       # FastAPI routers: portfolio, market, optimizer
│   │   ├── config/           # Pydantic settings (loaded from .env)
│   │   ├── data/             # yfinance market client, CSV parser
│   │   └── models/           # Pydantic models: portfolio, market, optimizer
│   └── tests/                # pytest test suite
├── examples/                 # Sample data files
├── frontend/
│   └── src/
│       ├── components/       # Shared UI components
│       │   ├── AutocompleteInput   # Debounced search input
│       │   ├── CorrelationHeatmap  # Clustered sector heatmap (Plotly)
│       │   ├── RiskReturnScatter   # Risk/return scatter (Plotly)
│       │   ├── AllocationTable     # Optimizer results table
│       │   ├── NarrativeBlock      # Markdown AI critique renderer
│       │   └── TopNav              # Sticky navigation bar
│       ├── context/
│       │   ├── AppContext    # Cross-page state (portfolio, results, loading flags)
│       │   └── ThemeContext  # Dark/light theme with localStorage persistence
│       ├── hooks/
│       │   └── useChartTheme # Unified Plotly colour tokens for dark/light mode
│       ├── pages/
│       │   ├── PortfolioProfiler   # Dashboard — performance vs benchmarks
│       │   ├── PortfolioResearch   # Research — single-ticker analysis
│       │   ├── DiversifyPage       # Diversify — candidate scoring
│       │   └── Optimizer           # Optimize — weight allocation
│       └── test/             # Vitest setup
├── .env.example
├── CHANGELOG.md
└── pyproject.toml
```
