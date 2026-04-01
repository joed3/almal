# Almal — Project Plan

## Overview

Almal is a multi-agent stock portfolio monitoring and optimization tool built for personal use and sharing with friends, family, and developers. It is designed as an open-source, locally-run application — not a commercial product. The backend is written in Python using the Anthropic/Claude Agent SDKs, and the frontend is a React single-page application with a clean, dark-mode-first aesthetic.

---

## Goals

1. Help users understand how their existing portfolio has performed over time relative to benchmarks.
2. Help users research and evaluate new potential investments quantitatively.
3. Help users optimize a portfolio given a set of candidate investments, a principal amount, and a risk strategy.

All three features are powered by a multi-agent backend and surfaced through an interactive, visual frontend.

---

## Target Users

- The developer (personal use)
- Friends and family (shared deployment, local dev)
- Other developers pulling and building from the open-source repo

No customer accounts, payments, or SLAs. No auth/login required.

---

## Architecture

### Backend — Python Multi-Agent System

Built with the **Anthropic Claude Agent SDK**. Four core agents:

| Agent | Responsibility |
|---|---|
| **Orchestrator** | Receives user intent, plans execution, routes subtasks to specialist agents, aggregates results |
| **Research Agent** | Fetches and summarizes market data for a given stock or ETF (price history, fundamentals, news sentiment, correlation to holdings) |
| **Optimizer Agent** | Runs portfolio optimization using PyPortfolioOpt (primary) and skfolio (advanced); produces allocation recommendations |
| **Review Agent** | Critiques portfolio proposals, optimized outputs, and individual investment ideas; produces natural-language summaries and actionable improvement suggestions |

The orchestrator is the only agent that interfaces directly with the frontend API layer. Specialist agents are invoked as tools or subagents.

**Future agent candidates:** a screener/filter agent for universe selection, a risk monitor agent for ongoing alerts.

### Frontend — React SPA

- Single-page application with a persistent sidebar for navigation between the three feature areas
- Optional collapsible chat panel (bottom-right overlay) for natural-language interaction with the agent system — hidden by default, non-obtrusive
- Dark mode only to start
- Aesthetic: clean, minimal, high information density without clutter — inspired by The Economist and `theme_bw`/`theme_minimal` in ggplot2. Prefer muted color palettes, clear typography, and well-labeled axes over decorative chrome.

### Data Layer

- **Market data:** `yfinance` (end-of-day, delayed). Acceptable for all three features.
- **Portfolio input:** CSV upload (flexible parser — handles exports from major banks/brokerages). Supports multiple lots of the same ticker. Required columns inferred from content; no strict template enforced.
- **No database to start.** State is ephemeral per session. Portfolio and results are held in memory and/or local browser state.

---

## Feature Specifications

### Feature 1 — Portfolio Profiler

**What it does:** Profiles the historical performance of a user's existing portfolio over time, relative to one or more benchmarks.

**Input:**
- CSV upload of current holdings (ticker, shares, purchase date, cost basis per lot — inferred from upload)
- Date range selector (toggleable time horizon: 1M, 3M, 6M, YTD, 1Y, 3Y, 5Y, custom)
- Benchmark selector: defaults to broad market ETFs (e.g., SPY, QQQ, VTI); user can add any ticker as a custom benchmark

**Output / Visuals:**
- Portfolio total return over time vs. benchmark(s) — line chart
- Key metrics summary card: total return, annualized return, volatility, Sharpe ratio, max drawdown, alpha/beta vs. benchmark
- Holdings breakdown: table and weight chart (e.g., treemap or pie) showing current allocation
- Per-holding performance table (return contribution, current weight, gain/loss)

**Agent involvement:** Research Agent fetches historical prices; Review Agent produces a natural-language performance summary and flags concentration risks or underperformers.

---

### Feature 2 — Investment Investigator

**What it does:** Lets users research a specific stock or ETF quantitatively, and optionally see how it would fit within their existing portfolio.

**Input:**
- Search bar (accepts ticker symbol or company name; fuzzy match)
- Optionally: an already-uploaded portfolio for context

**Output / Visuals — Single Ticker Dashboard:**
- Price history chart with adjustable time horizon
- Key stats: market cap, P/E, 52-week range, average volume, dividend yield (where applicable)
- Volatility and drawdown profile
- Sector/industry classification

**Output / Visuals — Portfolio Fit View** (shown if a portfolio is loaded):
- Correlation of the candidate to existing holdings (heatmap or bar)
- Simulated impact on portfolio: how does adding X% of this asset affect overall volatility, return, and Sharpe?
- Marginal contribution to risk

**Agent involvement:** Research Agent fetches and structures all data. Review Agent produces a short investment thesis critique — strengths, risks, and fit with the existing portfolio.

---

### Feature 3 — Portfolio Optimizer

**What it does:** Given a candidate universe of tickers, a principal to invest, and a chosen strategy, produces an optimal allocation.

**Input:**
- List of candidate tickers (manual entry or loaded from existing portfolio)
- Principal amount ($)
- Optimization strategy (preset selector):
  - **Conservative** — Minimize Volatility (minimum variance portfolio)
  - **Moderate** — Maximize Sharpe Ratio (mean-variance efficient)
  - **Aggressive** — Maximize Return (for given risk tolerance)
- Advanced mode toggle (hidden by default): exposes manual parameters (expected returns method, covariance estimator, risk-free rate, target return/volatility)

**Optimization stack:**
- Primary: **PyPortfolioOpt** (mean-variance, efficient frontier, Sharpe maximization)
- Advanced/future: **skfolio** (Black-Litterman, risk parity, CVaR minimization, hierarchical risk parity)

**Output / Visuals:**
- Recommended allocation table: ticker → optimal weight (%) → dollar amount to invest → shares to buy (at current price)
- Efficient frontier chart with the selected portfolio plotted on the curve
- Before/after comparison (if existing portfolio provided): current weights vs. optimized weights
- Risk/return summary: expected annual return, expected volatility, Sharpe ratio of the optimized portfolio
- Export: download the allocation table and performance summary as CSV or PDF

**Backtesting:**

To quantify confidence in the suggested strategy, the optimizer includes a backtest view that applies the optimized weights to a historical window and measures how the strategy would have performed.

Two approaches, in order of implementation priority:

1. **Historical simulation (v1):** Apply the current optimized weights statically to the past N years of price data and plot cumulative return, annualized return, volatility, Sharpe ratio, and max drawdown. Serves as a sanity check — "if you had held this allocation, here is what would have happened." Time horizon is user-selectable (matching the profiler toggles).

2. **Walk-forward backtest (advanced):** Re-optimize at regular intervals (e.g., monthly or quarterly rebalancing) over the historical window using only data available at each point in time (no look-ahead bias). Tracks cumulative performance of the strategy, not just the weights. Leverages skfolio's backtesting infrastructure. Exposed under the advanced mode toggle.

Backtest output includes:
- Cumulative return chart vs. benchmark over the backtest window
- Summary stats table: annualized return, volatility, Sharpe ratio, max drawdown, Calmar ratio
- A caveat note (surfaced by the Review Agent) reminding the user that past performance does not guarantee future results and that the optimization is sensitive to the historical estimation window

**Agent involvement:** Optimizer Agent runs the optimization and backtest. Review Agent critiques the output — e.g., flags over-concentration, notes assumptions baked into the model, calls out overfitting risk if the backtest window is short, suggests alternative approaches.

---

## Nice-to-Haves (Not in Initial Scope)

- **In-app chat interface:** A collapsible overlay panel allowing natural-language Q&A with the orchestrator (e.g., "What happens if I add NVDA to my portfolio?" or "Explain the optimization result"). Should be non-obtrusive — hidden by default, toggled via a small button.
- **Optimizer constraints:** Max position size, sector limits, minimum holdings count, long-only enforcement.
- **Preset strategy templates:** Strategy configurations stored as named templates, user-editable, to support future optimization strategies beyond the three initial presets.
- **Screener agent:** Filter a broad universe of stocks by criteria (sector, market cap, momentum) to generate the candidate list for the optimizer.
- **Risk monitor agent:** Ongoing portfolio risk alerts (e.g., drawdown thresholds, concentration drift).

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Backend language | Python 3.11+ |
| Agent framework | Anthropic Claude Agent SDK |
| LLM | Claude (via Anthropic API) |
| Portfolio optimization | PyPortfolioOpt (primary), skfolio (advanced) |
| Market data | yfinance |
| Backend API | FastAPI |
| Frontend | React (Vite) |
| Charting | Recharts or Plotly.js (TBD — prefer clean/minimal output) |
| Styling | Tailwind CSS, dark mode |
| Deployment | Local dev only (initial) |

---

## Development Standards

### Python Style and Linting

- **Style guide:** PEP 8, enforced automatically via tooling (not manually)
- **Formatter:** `black` (opinionated, no config needed — removes style debates)
- **Linter:** `ruff` (fast, covers flake8 + isort + pyupgrade rules in one tool)
- **Type hints:** Required on all public function signatures; checked with `mypy` in strict mode
- **Docstrings:** Google-style docstrings on all public modules, classes, and functions

### Testing

- **Framework:** `pytest`
- **Scope:** Unit tests required for all backend modules — agent logic, data fetching, CSV parsing, optimization wrappers, and API endpoints
- **Coverage:** Tracked via `pytest-cov` for visibility; no minimum threshold enforced
- **Test layout:** `tests/` directory mirroring the `src/` structure; one test file per module
- **Mocking:** External calls (yfinance, Anthropic API) must be mocked in unit tests so the suite runs offline and deterministically
- **Frontend:** Frontend testing is not required for the initial prototype but Jest + React Testing Library should be set up as scaffolding

### Pre-commit Hooks

Using the `pre-commit` framework. Hooks run on every `git commit`:

| Hook | Purpose |
|---|---|
| `black` | Auto-format Python files |
| `ruff` | Lint and auto-fix where possible |
| `mypy` | Static type checking |
| `pytest` | Run the full test suite (fail commit if tests fail) |
| `trailing-whitespace` | Remove trailing whitespace |
| `end-of-file-fixer` | Ensure files end with a newline |
| `check-merge-conflict` | Block commits with unresolved merge conflict markers |
| `detect-private-key` | Prevent accidental commit of secrets/API keys |

### Dependency Management

- **Backend:** `pyproject.toml` (PEP 517/518) with `uv` for fast, reproducible installs; dependencies pinned in a lockfile; project version tracked here as a single source of truth following [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH)
- **Frontend:** `package.json` with exact versions pinned via `package-lock.json`
- **Secrets:** API keys (Anthropic, etc.) stored in a `.env` file, never committed; `.env.example` committed as a template

### Project Structure Conventions

- Backend source lives in `backend/src/`, tests in `backend/tests/`
- Frontend source lives in `frontend/src/`
- Agent definitions and tools live in `backend/src/agents/`
- Configuration (optimization presets, benchmark defaults) lives in `backend/src/config/`
- Shared constants and enums in `backend/src/constants.py`

### Documentation

- `README.md` at repo root with: project overview, prerequisites, local setup instructions, how to run the app, how to run tests
- `CHANGELOG.md` at repo root tracking user-facing changes per release in [Keep a Changelog](https://keepachangelog.com/) format (Added / Changed / Fixed / Removed sections per version)
- `CONTRIBUTING.md` with: branch naming conventions, PR checklist, how to add a new agent or feature

---

## Out of Scope (Initial Version)

- User authentication and persistent accounts
- Real-time or intraday market data
- Brokerage API integration (e.g., Alpaca, IBKR)
- Mobile app
- Multi-user or hosted deployment
- Options, futures, or crypto assets

---

## Open Questions / Future Decisions

- Charting library: Recharts (simpler, React-native) vs. Plotly.js (more powerful, closer to ggplot aesthetic) — decide at frontend build time.
- CSV parser robustness: define a fallback flow when required columns cannot be inferred from the upload.
- Advanced optimization strategy templates: define schema for user-configurable presets before implementing skfolio integration.
- Claude model selection: which Claude model powers each agent (speed vs. capability tradeoff per role).

---

## Implementation Plan

A staged rollout ordered to deliver working, testable slices of the product at each step. Each stage should be merged and stable before the next begins.

---

### Stage 1 — Project Scaffolding

Stand up the skeleton of the repo with all tooling in place before writing any product logic.

- Repo structure: `backend/`, `frontend/`, `tests/`, top-level config files
- `pyproject.toml` with version `0.1.0`, dependencies, `black`/`ruff`/`mypy` config
- `pre-commit` config with all hooks wired up
- `pytest` + `pytest-cov` configured with a `tests/` stub
- FastAPI app skeleton with a `/health` endpoint
- React app via Vite + Tailwind CSS, dark mode baseline, placeholder routing for three feature pages
- `.env.example` with required environment variable keys
- `README.md` stub and `CHANGELOG.md` initialized at `0.1.0`

**Exit criteria:** `pre-commit run --all-files` passes; backend and frontend both start locally.

---

### Stage 2 — Data Layer

Build the data foundation that all three features depend on before touching agents or UI.

- `yfinance` wrapper: fetch price history, current quote, and basic fundamentals for a ticker; unit-tested with mocked responses
- CSV parser: ingest user-uploaded holdings files, infer columns, normalize to internal `Portfolio` / `Holding` / `Lot` data models; unit-tested against sample files from common brokerages
- Pydantic models for all core data types (`Portfolio`, `Holding`, `Lot`, `PriceHistory`, `TickerInfo`)
- FastAPI endpoints: `POST /portfolio/upload`, `GET /market/ticker/{symbol}`

**Exit criteria:** Can upload a CSV and fetch ticker history via the API; all units tested with mocks.

---

### Stage 3 — Agent Infrastructure

Wire up the multi-agent system before building individual feature agents.

- Anthropic Claude Agent SDK integration
- Orchestrator agent: receives a typed intent, routes to the appropriate specialist agent, returns a structured result
- Agent base class / shared tooling (logging, error handling, retry logic)
- Stub implementations of Research, Optimizer, and Review agents (return placeholder responses)
- Unit tests for orchestrator routing logic (mocked agent responses)

**Exit criteria:** A request can be routed end-to-end through the orchestrator to a stub agent and back via the API.

---

### Stage 4 — Portfolio Profiler (Feature 1)

First full feature, end-to-end.

- **Backend:** Historical performance calculations — total return, annualized return, volatility, Sharpe ratio, max drawdown, alpha/beta vs. benchmark; Research Agent fully implemented for portfolio context
- **Backend:** Review Agent critique for existing portfolios (concentration risk, underperformers)
- **Frontend:** CSV upload flow; line chart (portfolio vs. benchmark); metrics summary card; holdings breakdown table and weight chart; time horizon toggle; benchmark selector
- FastAPI endpoints: `POST /portfolio/analyze`

**Exit criteria:** A user can upload a CSV, select a benchmark and time horizon, and see a full performance profile with a Review Agent summary.

---

### Stage 5 — Investment Investigator (Feature 2)

- **Backend:** Research Agent fully implemented for single-ticker analysis — price history, key stats, volatility/drawdown profile, sector classification; portfolio fit analysis (correlation, simulated impact on portfolio metrics)
- **Backend:** Review Agent critique for individual investment ideas
- **Frontend:** Ticker search bar (symbol or name); single-ticker dashboard; portfolio fit view (shown if portfolio is loaded); correlation heatmap or bar chart
- FastAPI endpoints: `GET /market/search`, `GET /market/ticker/{symbol}/analysis`, `POST /market/ticker/{symbol}/fit`

**Exit criteria:** A user can search a ticker and see a full quantitative dashboard, with optional portfolio fit analysis and a Review Agent critique.

---

### Stage 6 — Portfolio Optimizer (Feature 3, Core)

- **Backend:** PyPortfolioOpt integration — minimum variance, maximum Sharpe, maximum return; efficient frontier calculation; allocation output (weights, dollar amounts, share counts)
- **Backend:** Optimizer Agent fully implemented; Review Agent critique of optimized output
- **Frontend:** Ticker universe input; principal input; strategy preset selector; allocation table; efficient frontier chart; before/after weight comparison (if existing portfolio loaded); Review Agent summary panel
- FastAPI endpoints: `POST /optimize`

**Exit criteria:** A user can input a ticker list, principal, and strategy preset, and receive a recommended allocation with an efficient frontier chart and Review Agent critique.

---

### Stage 7 — Backtesting

Builds on Stage 6; adds historical validation to the optimizer output.

- **Backend:** Historical simulation — apply static optimized weights to historical price data; compute cumulative return, annualized return, volatility, Sharpe, max drawdown, Calmar ratio
- **Backend:** Walk-forward backtest via skfolio — rolling re-optimization with no look-ahead bias (exposed under advanced toggle)
- **Frontend:** Backtest results tab within the optimizer view; cumulative return chart vs. benchmark; summary stats table; Review Agent caveat note
- FastAPI endpoints: `POST /optimize/backtest`

**Exit criteria:** After running an optimization, a user can view a historical simulation and (via advanced toggle) a walk-forward backtest with full stats.

---

### Stage 8 — Export

Add export capability across all three features.

- PDF and CSV export for: portfolio performance report (Feature 1), ticker analysis (Feature 2), optimized allocation + backtest results (Feature 3)
- Backend: PDF generation via `WeasyPrint` or `reportlab`; CSV serialization of all structured outputs
- Frontend: Download buttons on each output view
- FastAPI endpoints: `POST /export/pdf`, `POST /export/csv`

**Exit criteria:** Every major output view has a working download button for both CSV and PDF.

---

### Stage 9 — Nice-to-Haves (Post-v1.0.0)

To be prioritized after a stable v1.0.0 is tagged.

- In-app chat interface (collapsible overlay, orchestrator-backed)
- Advanced optimizer parameters exposed in the UI (manual expected returns, covariance estimator, risk-free rate)
- skfolio advanced strategies (Black-Litterman, risk parity, CVaR, HRP)
- Optimizer constraints (max position size, sector limits, min holdings)
- Screener agent for universe selection
- Risk monitor agent for ongoing alerts

---

## UI/UX Design Decisions

Recorded after the Stage 4 / Stage 5 UI/UX redesign pass.

### Navigation
- Replaced the left sidebar (`Sidebar.tsx`) with a sticky top navigation bar (`TopNav.tsx`).
- Top nav contains: "Almal" wordmark (links to /), three nav links (Profiler, Investigator, Optimizer), portfolio tickers preview when loaded, and a dark/light theme toggle.

### Portfolio Upload
- Single floating action button (FAB) fixed bottom-right on all pages (`PortfolioUploadFAB.tsx`).
- FAB opens a centered modal with drag-and-drop dropzone, parse error display, and loaded portfolio summary with a Clear button.
- Upload zones removed from PortfolioProfiler, Investigator, and Optimizer pages.
- Optimizer's *candidate tickers* upload zone (CSV/TXT list) is kept — only the portfolio CSV upload zone was removed.

### Theme
- Warm off-white light theme (`stone-50` page background) as the default.
- Dark mode toggle persists preference to `localStorage` under the key `almal-theme`.
- Implemented via `ThemeContext.tsx` (ThemeProvider + useTheme hook).
- Tailwind dark mode uses `@custom-variant dark (&:where(.dark, .dark *))` variant (class-based).

### AI Narrative
- Responses capped at ~250 words (max_tokens reduced from 1500 to 600).
- All three system prompts (portfolio critique, investment critique, optimization critique) updated to require a `VERDICT: [VALUE]` line as the first line.
- Frontend `NarrativeBlock.tsx` component parses the VERDICT line and renders a coloured badge.
- VERDICT badge colours: OUTPERFORMING/STRONG = emerald, ON PAR/MODERATE = amber, WEAK = orange, UNDERPERFORMING/AVOID = red.

### Mobile
- Desktop-first for now. No responsive breakpoint optimisations beyond existing grid usage.

---

## v2.0.0 Implementation Plan

Planned after tagging v1.0.0. Builds on the stable foundation without breaking any existing features. All decisions below are informed by a product interview conducted 2026-03-31.

---

### Feature Overview

| Feature | Priority | Description |
|---|---|---|
| Profiler benchmark search | Quick fix | Replace plain-text benchmark input with the same autocomplete ticker search used in Investigator and Optimizer |
| Advanced optimizer strategies | Core | Add Black-Litterman, CVaR, Risk Parity, HRP via skfolio alongside the existing four PyPortfolioOpt strategies |
| Advanced parameter controls | Core | Collapsible per-strategy parameter panel exposing risk-free rate, expected returns method, covariance estimator, and strategy-specific inputs |
| Black-Litterman views UI | Core | Allow users to input their own expected return views per ticker plus a confidence level; fall back to market-implied equilibrium returns when no views are provided |
| Natural language constraints | Core | Free-text constraint input parsed by Claude into structured optimizer constraints: position caps, position floors, portfolio reduction targets, and tax-aware sell restrictions |
| Tax-aware optimization | Core | Factor estimated short/long-term capital gains tax liability into rebalance decisions; surface projected tax impact per ticker in the allocation output |
| Walk-forward backtesting | Core | Replace the static historical simulation with a true walk-forward engine that re-optimizes at each rebalance date using only data available at that point; user selects rebalancing cadence or buy-and-hold |
| Chat interface | Exploratory | Collapsible floating chat panel backed by the orchestrator; primarily natural language portfolio commands that trigger agent actions; secondarily Q&A about current results and general research |

---

### Design Decisions (from interview)

**Constraints input:** Free-text natural language, parsed by a new `ConstraintParserAgent` (Claude-backed). Supports: max weight per ticker, min weight or min shares per ticker, reduce total portfolio by $ or %, tax-minimizing hold preferences. When the parser is uncertain (ambiguous input), it asks a clarifying question before rendering any chips — the user responds inline and the parse resumes. Parsed constraints are rendered back to the user as structured tags before the optimization runs, so they can review and remove individual constraints before confirming.

**Capital gains awareness:** The optimizer uses lot-level `purchase_date` and `cost_basis` data already present in the CSV parser. For each potential sale, it calculates estimated tax liability using US federal capital gains rates as defaults: short-term (held ≤ 1 year) at 22% (middle bracket), long-term (held > 1 year) at 15% (standard rate). Both rates are user-editable via a small input in the tax-aware panel, so users can enter their actual marginal rates. Tax cost is added as a soft penalty in the objective function — the user can toggle its weight from 0 (ignore taxes) to 1.0 (strongly prefer tax-efficient trades). The allocation output gains a "Est. Tax Impact" column.

**Advanced strategies:** All eight strategies (four existing PyPortfolioOpt + four new skfolio) appear in the same selector. Each strategy has an expandable "Advanced Details" accordion below the selector. Default parameters are sane out-of-the-box; the accordion is optional. Strategy groupings:
- *Conservative:* Min Volatility, Risk Parity
- *Moderate:* Max Sharpe, Regularized Max Sharpe, CVaR Minimization
- *Aggressive:* Max Return, Hierarchical Risk Parity
- *Views-based:* Black-Litterman (requires market data + optional user views)

**Black-Litterman views:** User can add one or more views via a small form: ticker, expected return (%), confidence (low / medium / high → maps to Ω diagonal values). Views are optional; if none are provided, the model uses market-cap-weighted equilibrium returns derived from a configurable market index proxy (default: SPY; changeable in the Advanced Details accordion). The Advanced Details panel shows the implied equilibrium returns alongside the user's views so they can sanity-check.

**Walk-forward backtesting:** Replaces the current static simulation entirely. The user chooses a lookback window (1Y, 3Y, 5Y) and a rebalancing cadence (monthly, quarterly, annual, or buy-and-hold). At each rebalance date, the optimizer runs on historical data up to that point only — no future data leaks. The output chart shows the walk-forward portfolio vs. benchmark. A summary table compares walk-forward stats to the buy-and-hold equivalent. The Review Agent caveat note is preserved. Because monthly rebalancing over 5 years ≈ 60 optimization runs, a progress bar is shown during the backtest computation so the user can see how many rebalance periods have been processed.

**Chat interface:** A floating collapsible panel anchored bottom-right (above the FAB). Collapsed state is a small chat icon; expanded state is a ~360px wide panel. The orchestrator receives a message enriched with current page context: loaded portfolio, current result payload (if any), and which page the user is on. Primary capability is command-style queries that can trigger agent actions and show results inline in the chat (e.g. "optimize my portfolio for minimum volatility" runs the optimizer and streams results back). Secondary capability is Q&A about the current result. Conversation history is session-scoped (cleared on page reload). No streaming required for v2 — standard request/response is fine.

**Profiler benchmark search:** Direct drop-in replacement of the plain text input with the same autocomplete component used in Investigator and Optimizer. No other changes to the Profiler page.

---

### Stage 10 — Quick Fixes

Fast, isolated improvements that don't depend on any other v2 work.

- **Profiler benchmark autocomplete:** Replace the freeform benchmark text input with the `/market/search`-backed autocomplete dropdown, matching the UX in Investigator and Optimizer. Chip-based multi-select is already in place; only the input mechanism changes.
- **Profiler loading indicator:** Add a spinner/progress wheel to the Profiler results panel while the analysis is running, matching the loading state already present in the Optimizer panel. No backend changes required — frontend-only state management.

**Exit criteria:** User can type a company name or partial ticker in the Profiler benchmark field and select from a live autocomplete list. A progress wheel is visible while the Profiler analysis is loading.

---

### Stage 11 — Advanced Optimizer Strategies + Parameter Controls

Extend the optimizer with skfolio strategies and expose per-strategy parameter controls in the UI.

**Backend:**
- Implement `skfolio` wrappers in `analysis/optimization.py`: Black-Litterman (with market-implied + optional user views), CVaR minimization, Equal Risk Contribution (Risk Parity), and Hierarchical Risk Parity (HRP)
- Extend `OptimizeRequest` with optional `advanced_params` dict (risk-free rate, expected returns method, covariance estimator, CVaR beta, risk parity risk measure, BL views list, BL tau)
- Add `views` list to `OptimizeRequest` for Black-Litterman: `[{ ticker, expected_return, confidence }]`
- `OptimizationStrategy` enum gains four new values: `black_litterman`, `cvar`, `risk_parity`, `hrp`

**Frontend:**
- Extend strategy `<select>` with the four new options, grouped by risk profile
- Each strategy option in the selector has an info icon (`InfoPopover`) that renders a 1–2 sentence plain-English description of the strategy and links out to a reputable external reference (Wikipedia article or academic/practitioner source). Popovers are present for all eight strategies (four existing + four new). Reference links per strategy:
  - Min Volatility → [Wikipedia: Modern portfolio theory](https://en.wikipedia.org/wiki/Modern_portfolio_theory)
  - Max Sharpe → [Wikipedia: Sharpe ratio](https://en.wikipedia.org/wiki/Sharpe_ratio)
  - Max Return → same Modern portfolio theory article
  - Regularized Max Sharpe → PyPortfolioOpt docs / Ledoit-Wolf shrinkage
  - Risk Parity / ERC → [Wikipedia: Risk parity](https://en.wikipedia.org/wiki/Risk_parity)
  - CVaR Minimization → [Wikipedia: Expected shortfall](https://en.wikipedia.org/wiki/Expected_shortfall)
  - HRP → [Lopez de Prado (2016)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2708678)
  - Black-Litterman → [Wikipedia: Black–Litterman model](https://en.wikipedia.org/wiki/Black%E2%80%93Litterman_model)
- Add an `AdvancedParams` accordion component below the strategy selector — rendered conditionally per strategy, showing only the parameters relevant to the selected strategy
- Black-Litterman strategy additionally shows a "Views" panel: add/remove rows of (ticker, expected return %, confidence)
- Market-implied equilibrium returns fetched and displayed alongside user views when BL is selected
- Black-Litterman market proxy selector (default: SPY) exposed in the Advanced Details accordion; user can change to any valid ticker

**Exit criteria:** All eight strategies are selectable. Black-Litterman runs with market-implied returns when no views are entered, and incorporates user views when provided. Advanced parameters override defaults when changed.

---

### Stage 12 — Natural Language Constraints + Tax-Aware Optimization

Add the constraint layer on top of the optimizer, including capital gains awareness.

**Backend:**
- New `ConstraintParserAgent` in `agents/constraint_parser.py`: accepts a free-text string and the current portfolio (tickers + lots), returns a structured `ConstraintSet` (Pydantic model). Claude parses statements like "keep at least 50 shares of AAPL", "no position larger than 15%", "reduce total portfolio by $10,000", "avoid selling positions held less than 6 months"
- `ConstraintSet` model: `max_weights: dict[str, float]`, `min_weights: dict[str, float]`, `min_shares: dict[str, float]`, `portfolio_reduction_target: float | None` (in dollars), `tax_aware: bool`, `tax_aware_weight: float`
- New `POST /optimize/parse-constraints` endpoint: calls ConstraintParserAgent, returns the parsed `ConstraintSet` for frontend preview before the user confirms
- Extend `PortfolioOptimizer.optimize()` to accept and apply a `ConstraintSet`: inject weight bounds into PyPortfolioOpt/skfolio, apply portfolio reduction logic to total value calculation
- Tax-aware mode: for each potential sale, compute estimated tax liability from lot-level data; add a weighted tax-cost penalty to the objective function. Configurable rates stored in `config/settings.py` (`short_term_tax_rate`, `long_term_tax_rate`)
- Extend `AllocationRequirement` with `est_tax_impact: float | None` and `holding_days: int | None`

**Frontend:**
- Add a "Constraints" section to the Optimizer configuration panel (below principal, above strategy selector)
- Free-text input with a "Parse" button; on parse, renders structured constraint chips (each dismissable) showing the interpreted constraint in plain English
- "Tax-aware" toggle (enabled automatically if portfolio has lot data; greyed out if not)
- Tax weight slider: 0 (ignore) → 1 (strongly prefer tax efficiency); shown only when tax-aware is on
- Allocation table gains "Est. Tax" and "Held" columns when tax-aware mode is active

**Exit criteria:** User can type "don't sell more than half my MSFT" and see it parsed into a min-shares constraint chip. Running the optimizer with tax-aware on produces a different allocation than without, and the allocation table shows estimated tax per position.

---

### Stage 13 — Walk-Forward Backtesting

Replace the current static weight simulation with a true rolling re-optimization engine.

**Backend:**
- New `run_walk_forward_backtest()` method on `PortfolioOptimizer` (or a dedicated `WalkForwardBacktester` class)
- Algorithm: given a lookback window and rebalance cadence, iterate through time. At each rebalance date, fetch price data up to that date only, run the optimization, hold the resulting weights until the next rebalance date, compute portfolio return for that interval. Accumulate portfolio value series. No future data ever enters any optimization step.
- Buy-and-hold mode: optimize once on the first available window, then hold static weights for the entire period — produces a useful comparison baseline
- Extend `BacktestResult` with `rebalance_dates: list[str]`, `rebalance_cadence: str`, `strategy_used: str`
- Extend `BacktestRequest` with `cadence: Literal["monthly", "quarterly", "annual", "buy_and_hold"]`
- `POST /optimize/backtest` updated to use the new engine; old static simulation removed

**Frontend:**
- Replace the current 1Y/3Y/5Y + "Run Backtest" UI with a panel that exposes: lookback window (1Y / 3Y / 5Y), rebalancing cadence (Monthly / Quarterly / Annual / Buy & Hold)
- Rebalance dates shown as vertical markers on the cumulative return chart (dashed lines)
- Stats table gains a "Rebalance events" count row
- Buy-and-hold mode still appears as a toggle for direct comparison — when selected, the chart shows both walk-forward and buy-and-hold on the same axes

**Exit criteria:** Walk-forward backtest produces materially different results from a static weight backtest on the same data. Rebalance date markers are visible on the chart. Buy-and-hold can be compared directly alongside the walk-forward line.

---

### Stage 14 — Chat Interface

Add the floating chat panel backed by the orchestrator.

**Backend:**
- New `POST /chat` endpoint accepting `{ message: str, context: ChatContext }`
- `ChatContext` carries: `page: str`, `portfolio: Portfolio | None`, `current_result: dict | None` (the last result payload from whichever page is active)
- A new `ChatAgent` (or extend `OrchestratorAgent`) that: (1) inspects the context, (2) classifies the message as a command (triggers an agent action and returns structured + narrative result), a question about the current result (calls ReviewAgent with the result + question), or a general research query (calls ResearchAgent)
- Command routing examples: "optimize my portfolio for minimum volatility" → triggers optimize with current portfolio + strategy override, returns full `OptimizeResult`; "what's the correlation between AAPL and NVDA?" → triggers ResearchAgent
- Response model: `{ narrative: str, action_result: dict | None, suggested_next: str | None }` — `action_result` is non-null when the chat triggered an agent action and can be rendered as a result card inline
- Session history is maintained server-side in a short-lived dict keyed by a session token (generated client-side, stored in `sessionStorage`); last 10 exchanges kept for context

**Frontend:**
- New `ChatPanel.tsx` component: fixed bottom-right, above the FAB, initially collapsed to a circular icon button
- Expanded state: 360×520px panel with message history, text input, send button, and a "Clear" button
- Messages from the assistant can render either plain text or, when `action_result` is present, an inline compact result card (e.g. a mini allocation table or a mini metrics summary)
- Context is assembled at send time from `AppContext` (current portfolio, last results for the active page)
- The panel is always mounted but collapsed; no route changes required

**Exit criteria:** User can type "what would my portfolio look like optimized for max Sharpe?" in the chat panel and receive a narrative response plus a compact allocation result card, without leaving the current page.

---

### v2.0.0 Open Questions

- **Chat streaming:** v2 uses standard request/response. Streaming (SSE or WebSockets) would improve UX significantly for longer responses — candidate for v2.1.
- **Chat result cards:** The design for inline result cards in the chat panel (mini allocation table, mini metrics card) needs detailed UI work before Stage 14 begins.
