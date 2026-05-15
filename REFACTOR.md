# Almal — Refactor & Roadmap Notes

## 1. Honest Assessment of Where We Are

The app is feature-complete and technically solid (TypeScript strict, dark mode, Plotly charts,
async FastAPI, pre-commit hooks). But three months of iterative feature adds have created some
structural debt:

- **Investigator.tsx** is 1,150 lines handling two conceptually distinct workflows
- **Optimizer.tsx** is 1,418 lines — essentially a mini-app embedded in a single component
- 14+ context variables for Investigator alone; 6+ for Optimizer
- Chart theming (`isDark`, `fontColor`, `gridcolor`) re-declared independently in every chart
- Search autocomplete re-implemented three times (Profiler benchmarks, Investigator, Optimizer)
- No shared table component despite two sector-grouped tables on different pages

The result is an app that *works* but is harder to navigate than it needs to be. Users face too
many controls at once, modes aren't clearly signposted, and the left-panel / right-panel split
becomes cramped on realistic screen sizes.

---

## 2. UI / UX Refactor Plan

### 2.1 Navigation — Flatten the Mental Model

**Current:** Three pages (Profiler, Investigator, Optimizer) in a top nav bar. The Investigator
has two sub-modes (Investigate / Suggest) in a tab toggle inside the page itself.

**Problem:** Users must first pick a page, then discover there are modes within that page.
The Suggest mode in particular shares nothing visually with the Investigate mode and could
be a standalone destination.

**Proposed routes:**

| Route | Purpose |
|---|---|
| `/` | Portfolio dashboard (rename Profiler → Dashboard) |
| `/research` | Single-asset deep dive (current Investigate mode) |
| `/diversify` | Diversifier scoring (current Suggest mode) |
| `/optimize` | Portfolio optimizer |

This maps one user intent per route and removes the in-page mode toggle. The TopNav link
labels become the navigation vocabulary: **Dashboard · Research · Diversify · Optimize**.

### 2.2 Portfolio Dashboard (was: Profiler)

The Profiler is in reasonable shape. Two targeted improvements:

1. **Collapse benchmark controls into a compact popover.** The autocomplete chip bar +
   horizon toggle + Analyse button currently compete for the same row. Move benchmarks
   into a "⚙ Settings" popover button; expose only the horizon buttons and Analyse CTA
   at the top level.

2. **Progressive disclosure for the heatmap.** The correlation heatmap is useful but heavy.
   Render it collapsed ("Show correlation heatmap ▾") by default — the chart is below the fold
   anyway and most users won't need it on first glance.

### 2.3 Research Page (was: Investigate mode)

Mostly clean. One improvement: the ticker info header (name, price, market cap, P/E, yield,
52W range) currently fills a full 3×3 grid that forces the performance chart below the fold.
Compress it into a single narrow header bar so the price chart is immediately visible.

### 2.4 Diversify Page (was: Suggest mode)

This is where the most friction lives:

1. **Candidate pool as a sidebar, not a blocking left panel.** The 420 px of checkboxes
   is the first thing users see, but it's a configuration step. Put it in a collapsible
   "Candidates ▾" drawer that slides in from the right (or an overlay). The main area
   defaults to showing the scatter + heatmap from the last run (or an empty state CTA).

2. **Run button always visible.** Currently buried at the bottom of the checkbox list.
   Make it a sticky footer inside the drawer, always in reach.

3. **Replace checkbox tree with asset-class filter chips.** "Fixed Income · International ·
   Commodities · Real Estate · Low-Vol · Factor · Broad Market · Tech · Growth · Income"
   — clicking a chip toggles that whole category. Users rarely want to cherry-pick
   individual tickers from the curated pool; they want to include/exclude asset classes.
   Show the active candidate count as a badge on the chip. Keep a separate "Custom tickers"
   input for non-curated additions.

4. **Scatter as the hero element.** After a run, the scatter should fill the main content
   area. The heatmap and candidate cards should be below, accessible by scrolling. This is
   close to the current layout but the scatter needs breathing room.

### 2.5 Optimizer

The Optimizer is doing too many things in one screen. Suggested restructure:

1. **Split into two steps with a stepper header:**
   - **Step 1 — Configure:** universe, principal, strategy, constraints
   - **Step 2 — Results:** allocation table, frontier chart, backtest

   The stepper keeps the current work visible (users can see Step 1 summary when reviewing
   Step 2) and removes the need to scroll past a 400 px control panel to reach results.

2. **Simplify the strategy selector.** Eight strategies with accordion sub-params is
   overwhelming. Group into three personas: *Conservative* (min-vol, CVaR), *Balanced*
   (max-Sharpe, regularized-Sharpe), *Advanced* (risk-parity, HRP, Black-Litterman).
   Selecting a persona shows only the 1–2 strategies in that group. Advanced params
   stay hidden unless the user expands a "Show advanced settings" section.

3. **Constraint input is the biggest rough edge.** The plain-English NLP parse is
   interesting but fragile. A better first-pass UX: replace it with a structured form
   — max weight per ticker (slider), min weight per ticker (input), sector concentration
   limit (dropdown). Keep the NLP field as an "or describe in plain English" secondary
   option. This covers 90% of use cases without requiring a backend round-trip.

### 2.5a Position Lock Constraints (next feature priority)

A very common real-world use case the current UI makes unnecessarily hard: *"I don't want
the optimizer to sell any of my AAPL shares"* or *"Cap my MSFT position at 80 shares."*
These map to `min_shares` and `max_shares` constraints on the optimizer, but today they
are only reachable by typing natural language into the NLP field — which is both fragile
and hard to discover.

**What the backend already supports:**
- `ConstraintSet.min_shares`: per-ticker floor on share count (already implemented and
  wired through to `_apply_weight_bounds` in `optimization.py`)

**What's missing:**
- `ConstraintSet.max_shares`: per-ticker ceiling on share count — the backend converts
  a share count to a weight bound using current prices and total portfolio value, exactly
  as it does for `min_shares`, but no `max_shares` field or ceiling logic exists yet.

#### Backend changes (small)

1. Add `max_shares: dict[str, float]` to `ConstraintSet` in `src/models/optimizer.py`.

2. In `_apply_weight_bounds` (`src/analysis/optimization.py`), apply the ceiling
   symmetrically to the existing `min_shares` floor logic:

```python
if ticker in constraints.max_shares:
    hi = min(hi, constraints.max_shares[ticker] * price / total_value)
```

3. Add `max_shares` to the constraint parser prompt so the NLP route also understands
   *"no more than 100 shares of MSFT"*.

4. Add `no_sell_tickers: list[str]` as a convenience field to `ConstraintSet`. The
   backend resolves it at optimisation time by looking up each ticker's current share
   count from the submitted `current_portfolio` dict and writing the equivalent
   `min_shares` entry — so the frontend doesn't have to do the maths.

#### Frontend changes (the bigger lift)

The key design principle: **position locks belong in the allocation table, not in the
constraint text box.** Users think in terms of their holdings, not abstract constraints.
They should be able to look at a row and click a button to lock it.

**Phase 1 — Lock toggles in the pre-run holdings view**

When a portfolio is loaded and the Optimizer is in rebalance mode, show the current
holdings in a compact table on the left panel (ticker, current shares). Add two controls
per row:

- A **🔒 No-sell toggle** — when enabled, sends `no_sell_tickers: [ticker]` in the
  constraint payload. The optimizer will never allocate fewer shares than the current
  position.
- A **share cap input** (optional) — a small number input labelled "Max shares". When
  filled, sends `max_shares: { ticker: value }`. Useful for concentration limits.

A **"Lock all"** button at the top of the table sets no-sell for every holding in one
click — the equivalent of "rebalance only by adding, never by selling."

**Phase 2 — Live feedback in the results table**

After running, the allocation table (Step 2 of the stepper) shows a `shares_delta`
column. Rows where the optimizer proposes a reduction (negative delta) should be
visually flagged — amber row tint and a downward arrow icon. Each such row gets a
quick-action **🔒 Lock & re-run** button that adds a no-sell constraint for that
ticker and immediately re-submits the optimization. This creates a tight, intuitive
feedback loop without requiring the user to navigate back to Step 1.

**Phase 3 — Persistence across runs**

Store the active position locks in the Optimizer section of `AppContext` alongside the
other optimizer state. Locks should survive re-runs (unless explicitly cleared by the
user), so that adding a constraint and re-running doesn't lose previously locked
positions.

#### UX summary

```
Left panel (Configure):
  Current holdings table (rebalance mode only)
  ┌──────────┬──────────┬──────────────┬───────────┐
  │ Ticker   │ Shares   │ No-sell lock │ Max shares│
  ├──────────┼──────────┼──────────────┼───────────┤
  │ AAPL     │ 50       │ [🔒 ON]      │ —         │
  │ MSFT     │ 30       │ [  OFF]      │ 80        │
  │ GOOG     │ 10       │ [  OFF]      │ —         │
  └──────────┴──────────┴──────────────┴───────────┘
  [Lock all]   [Clear locks]

Right panel (Results) — flagged reduction row:
  ┌────────┬───────┬──────────┬─────────┬──────────────────┐
  │ Ticker │ Wt%   │ Current  │ Target  │ Delta            │
  ├────────┼───────┼──────────┼─────────┼──────────────────┤
  │ MSFT   │ 12%   │ 30 sh    │ ▼ 18 sh │ -12  [🔒 Lock]  │  ← amber
  └────────┴───────┴──────────┴─────────┴──────────────────┘
```

This replaces the most common constraint use case entirely — users should never need
to type "don't sell AAPL" into a text box.

### 2.6 Shared Component Cleanup

These are quick wins that pay compounding dividends:

| Extract | Where it's re-implemented today |
|---|---|
| `useChartTheme()` hook | Inline in RiskReturnScatter, CorrelationHeatmap, inline Plotly in Profiler & Optimizer |
| `<AutocompleteInput />` | Profiler benchmark search, Investigator ticker search, Optimizer candidate search |
| `<CorrelationBadge />` | Inline `correlationLabel()` used in Investigator cards + potentially Optimizer |
| `<SectorGroupedTable />` | Profiler holdings table, Optimizer allocation table |

---

## 3. Performance & Efficiency

### 3.1 Backend — The Main Bottleneck

Every analysis call serialises multiple sequential yfinance fetches. The suggest endpoint
already uses `asyncio.Semaphore(12)` for concurrency but several improvements remain:

**Cache price data.** A single in-process LRU cache (or Redis for multi-worker deploys)
keyed on `(ticker, start_date, end_date)` with a 15-minute TTL would eliminate redundant
fetches almost entirely in interactive sessions. A user switching between suggest runs or
tweaking benchmark sets repeatedly re-fetches the same prices.

```python
# Simple approach — functools.lru_cache on the sync fetch, wrapped in to_thread
from functools import lru_cache

@lru_cache(maxsize=512)
def _cached_fetch(ticker: str, start: date, end: date) -> PriceHistory:
    return _raw_yfinance_fetch(ticker, start, end)
```

**Batch yfinance downloads.** `yfinance.download(tickers=["AAPL","MSFT","TLT"], ...)` in a
single call is substantially faster than N individual calls. The current code fetches each
ticker separately in `asyncio.to_thread`. Grouping into batches of 20 before handing off
to yfinance would cut network overhead significantly.

**Pre-warm common tickers on startup.** SPY, QQQ, TLT, GLD — the five most-used benchmark
and candidate tickers — could be fetched and cached at server startup in a background task,
so the first user request is fast.

**Streaming responses for the AI narrative.** The Anthropic call in the ReviewAgent is the
slowest single step (2–4 s). Switch to streaming (`stream=True`) and send the narrative as
a server-sent event while the rest of the structured data is already rendered on the client.
This makes the page feel instant — charts appear immediately, narrative types in progressively.

### 3.2 Frontend — Rendering Cost

**Memoize Plotly data computation.** `RiskReturnScatter` and `CorrelationHeatmap` recompute
their traces and annotations on every parent re-render. Wrap the expensive `traces`, `sorted`,
`annotations` computations in `useMemo` keyed on the input data.

**Lazy-load heavy pages.** `CorrelationHeatmap` and Plotly together are ~1 MB of JS. Use
`React.lazy` + `Suspense` to split the Optimizer and Investigator suggest mode into separate
chunks that load on demand.

**Debounce the benchmark/ticker search.** The autocomplete currently fires on every keystroke.
A 200 ms debounce cuts backend search calls by ~70% in practice.

**Virtualise large tables.** If a portfolio has 40+ holdings (or the optimizer produces 40+
allocations), the table renders all rows eagerly. `@tanstack/react-virtual` can keep rendering
cost constant regardless of row count.

### 3.3 Architecture — Thinking Ahead

**Move portfolio storage to the backend.** Currently the portfolio is a CSV pasted into
the FAB; it's held in memory and lost on refresh. Persisting it in a lightweight backend
store (SQLite for self-hosted, Postgres for multi-user) would enable:
- Re-opening the app without re-uploading
- User accounts / multiple saved portfolios
- Server-side portfolio validation

**Pre-compute standard benchmarks.** SPY/QQQ daily returns for the last 5 years are static;
they could be pre-computed and served from a static JSON at build time instead of fetched
from yfinance on every request.

---

## 4. Hosting Options

Three realistic paths from prototype to real users, in order of complexity:

### Option A — Single VPS (simplest, cheapest, full control)

Deploy everything on one DigitalOcean / Hetzner / Linode droplet.

```
Nginx (reverse proxy + SSL via Certbot)
  ├── /          → Vite static build (served by Nginx directly)
  └── /api/*     → Uvicorn FastAPI (systemd service or Docker container)
```

- **Cost:** $6–12/month (2 GB RAM droplet handles small-to-medium load)
- **Ops:** One server to SSH into, one `git pull && docker-compose up -d` to deploy
- **Limits:** No auto-scaling; yfinance rate limits get hit faster under concurrent users;
  single point of failure
- **Good for:** Personal use, demos, early beta with < 50 concurrent users

### Option B — Managed Platform (best developer experience)

Split frontend and backend across purpose-built platforms:

- **Frontend:** Vercel or Cloudflare Pages — automatic deployments from `main`, global CDN,
  free tier generous
- **Backend:** Railway, Render, or Fly.io — one `railway.toml` / `render.yaml` configures the
  FastAPI service; managed TLS, automatic restarts, simple env var management
- **Optional cache:** Upstash Redis (serverless Redis, free tier 10k req/day) for price caching

- **Cost:** Free tier covers early usage; ~$10–25/month as traffic grows
- **Ops:** Zero server management; push to `main` triggers deploy
- **Limits:** Cold starts on free tier (Render spins down inactive services); yfinance calls
  from a shared IP may hit rate limits — need the cache layer
- **Good for:** Fastest path to a live URL for real users; best if the team is small

### Option C — Cloud-native (most scalable, most work)

AWS or GCP with proper infrastructure:

- Frontend: S3 + CloudFront (or Firebase Hosting)
- Backend: ECS Fargate (AWS) or Cloud Run (GCP) — containerised FastAPI, scales to zero
- Cache: ElastiCache (Redis) or Memorystore
- Optional: RDS Postgres for portfolio persistence; Cognito / Firebase Auth for user accounts

- **Cost:** $30–80/month baseline, scales with usage; free tiers available during development
- **Ops:** Terraform / CDK for infra-as-code; more to learn but production-grade from day one
- **Limits:** Over-engineered for a prototype; worth it only if planning for hundreds of users
  or if the team already knows AWS/GCP
- **Good for:** Production-grade launch with user accounts and portfolio persistence

### Recommended path

Start with **Option B** (Vercel + Railway). It takes an afternoon to set up, costs nothing
until real traffic arrives, and eliminates all ops burden. The one meaningful prep step is
adding a Redis price cache (Upstash) before going public — without it, concurrent users
will saturate yfinance rate limits within minutes.

---

## 5. Prioritised Action List

In rough order of impact vs effort:

1. **Add price caching (backend)** — highest ROI; fixes the main performance problem before launch
2. **Stream the AI narrative** — makes the app feel dramatically more responsive
3. **Split Investigator into Research + Diversify routes** — biggest UX clarity win
4. **Replace checkbox tree with asset-class chips (Diversify page)** — simplifies the busiest UI panel
5. **Extract `useChartTheme()` and `<AutocompleteInput />`** — reduces duplication, aids maintenance
6. **Stepper UX for Optimizer** — makes the Optimizer approachable for first-time users
7. **Add `max_shares` + `no_sell_tickers` to `ConstraintSet` (backend)** — small backend change that unlocks the position-lock UX; do this before the frontend work
8. **Position lock toggles in the Optimizer holdings table** — Phase 1 of 2.5a; replaces the most common NLP constraint use case with a direct UI control
9. **"Lock & re-run" action on flagged reduction rows** — Phase 2 of 2.5a; tight feedback loop in the results table
10. **Memoize Plotly trace computation** — keeps chart interactions snappy with large portfolios
11. **Deploy to Vercel + Railway** — puts the app in front of real users
12. **Add price cache TTL invalidation + batch yfinance downloads** — polish after initial launch
13. **Portfolio persistence (backend storage)** — enables user accounts and a real product loop
