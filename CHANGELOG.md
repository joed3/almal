# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-31

### Added
- **Historical Backtesting:** After running an optimization, users can simulate how the optimized weights would have performed historically (1Y / 3Y / 5Y window) vs. SPY. Outputs cumulative return chart, full stats table (total return, annualized return, volatility, Sharpe, max drawdown, Calmar ratio), and an AI caveat note.
- **HTML Export:** Every results view now has an "Export HTML" button that generates a fully self-contained, interactive report file. Plotly charts remain zoomable and pannable (served via CDN). All InfoPopovers are present with hover tooltips. AI narrative blocks render markdown with VERDICT badges. Covers all three pages: Portfolio Profiler, Investment Investigator, and Portfolio Optimizer (including backtest if run).
- **CSV Export:** Download CSV buttons on the Optimizer allocation table, backtest stats, Profiler holdings table, and Investigator key stats.
- **UI Redesign:** Replaced sidebar navigation with a sticky top nav bar. Light theme (warm off-white) is now the default with a persistent dark/light toggle (preference saved to `localStorage`). Single floating action button (FAB) bottom-right handles all portfolio CSV uploads across all pages.
- **AI Narrative Redesign:** All three Review Agent prompts shortened to ~250 words. Responses now open with a `VERDICT:` line rendered as a colour-coded badge (emerald / amber / orange / red). Dedicated `NarrativeBlock` component renders markdown with dual-theme prose styling.

### Changed
- Browser tab title updated from "frontend" to "Almal".
- Portfolio upload zones removed from individual pages (Profiler, Investigator, Optimizer); all upload handled via the FAB.
- Plotly charts in all three pages are now theme-aware (grid and axis colours respond to light/dark toggle).
- Review Agent `max_tokens` reduced from 1500 to 600.

## [0.2.0] - 2026-03-31

### Added
- **Investment Investigator:** Fully functional single-asset research dashboard with live interactive metrics, autocomplete indexing, price history trend charts, and a portfolio fit matrix simulation.
- **Portfolio Optimizer:** Fully functional optimization sweep engine incorporating PyPortfolioOpt bounds, discrete allocation mapping, realtime efficient frontier charting, and inline portfolio context tracking.
- **Agent Intelligence:** Implemented unmocked Anthropic-driven ReviewAgent critiques for both singular investments and optimized allocations.

## [0.1.0] - Unreleased

### Added

- Initial project scaffold with `pyproject.toml` (hatchling build, uv dependency groups)
- FastAPI backend skeleton with `/health` endpoint and Pydantic response model
- `pydantic-settings`-based `Settings` class loading from `.env`
- Agent stubs: `OrchestratorAgent`, `ResearchAgent`, `OptimizerAgent`, `ReviewAgent`
- `pytest` test suite with async `httpx` client fixture and health endpoint test
- React + TypeScript frontend shell created via Vite with Tailwind CSS (v4) and `react-router-dom`
- Dark-themed sidebar navigation with placeholder pages: Portfolio Profiler, Investigator, Optimizer
- Pre-commit hooks: `pre-commit-hooks`, `black`, `ruff`, `mypy`, `pytest`
- `.env.example` with `ANTHROPIC_API_KEY` placeholder
