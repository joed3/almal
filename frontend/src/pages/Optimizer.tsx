/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type { OptimizationStrategy } from '../context/AppContext';
import AllocationTable from '../components/AllocationTable';
import BacktestChart from '../components/BacktestChart';
import EfficientFrontierChart from '../components/EfficientFrontierChart';
import InfoPopover from '../components/InfoPopover';
import NarrativeBlock from '../components/NarrativeBlock';
import { downloadCSV } from '../utils/export';
import { exportOptimizerHTML } from '../utils/exportHTML';

// ---------------------------------------------------------------------------
// Strategy metadata
// ---------------------------------------------------------------------------

interface StrategyMeta {
  value: OptimizationStrategy;
  label: string;
  description: string;
  wikiUrl: string;
}

interface StrategyGroup {
  group: string;
  strategies: StrategyMeta[];
}

const STRATEGY_GROUPS: StrategyGroup[] = [
  {
    group: 'Conservative',
    strategies: [
      {
        value: 'min_volatility',
        label: 'Min Volatility',
        description:
          'Finds the portfolio with the lowest possible variance. Prioritises stability over returns.',
        wikiUrl: 'https://en.wikipedia.org/wiki/Modern_portfolio_theory',
      },
      {
        value: 'risk_parity',
        label: 'Risk Parity',
        description:
          'Allocates capital so each asset contributes equally to total portfolio risk (Equal Risk Contribution).',
        wikiUrl: 'https://en.wikipedia.org/wiki/Risk_parity',
      },
    ],
  },
  {
    group: 'Moderate',
    strategies: [
      {
        value: 'max_sharpe',
        label: 'Max Sharpe',
        description:
          'Maximises return per unit of risk. Sits on the efficient frontier at the tangency point.',
        wikiUrl: 'https://en.wikipedia.org/wiki/Sharpe_ratio',
      },
      {
        value: 'regularized_sharpe',
        label: 'Regularized Max Sharpe',
        description:
          'Max Sharpe with L2 regularisation (Ledoit–Wolf shrinkage). Reduces sensitivity to estimation error in expected returns.',
        wikiUrl: 'https://en.wikipedia.org/wiki/Ledoit%E2%80%93Wolf_estimator',
      },
      {
        value: 'cvar',
        label: 'CVaR Minimization',
        description:
          'Minimises Conditional Value at Risk (Expected Shortfall) — the expected loss in the worst-case tail scenarios.',
        wikiUrl: 'https://en.wikipedia.org/wiki/Expected_shortfall',
      },
    ],
  },
  {
    group: 'Aggressive',
    strategies: [
      {
        value: 'max_return',
        label: 'Max Return',
        description:
          'Targets the highest achievable return within the feasible set, concentrating in top-performing assets.',
        wikiUrl: 'https://en.wikipedia.org/wiki/Modern_portfolio_theory',
      },
      {
        value: 'hrp',
        label: 'Hierarchical Risk Parity',
        description:
          'Uses hierarchical clustering on the correlation matrix to build a diversified portfolio without inverting the covariance matrix.',
        wikiUrl: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2708678',
      },
    ],
  },
  {
    group: 'Views-based',
    strategies: [
      {
        value: 'black_litterman',
        label: 'Black–Litterman',
        description:
          'Blends market-implied equilibrium returns with investor views (optional) to produce Bayesian-adjusted expected returns, then maximises Sharpe.',
        wikiUrl: 'https://en.wikipedia.org/wiki/Black%E2%80%93Litterman_model',
      },
    ],
  },
];

const ALL_STRATEGIES: StrategyMeta[] = STRATEGY_GROUPS.flatMap((g) => g.strategies);

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface SearchResult {
  symbol: string;
  name: string;
}

interface OptimizeResponse {
  intent: string;
  success: boolean;
  result: {
    strategy: string;
    allocations: any[];
    metrics: any;
    frontier_curve: any[];
    leftover_cash: number;
  };
  narrative?: string;
  error?: string;
}

interface BacktestStats {
  total_return: number;
  annualized_return: number;
  annual_volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
  calmar_ratio: number;
}

interface BacktestResult {
  dates: string[];
  portfolio_cumulative: number[];
  benchmark_cumulative: number[];
  benchmark: string;
  lookback_years: number;
  rebalance_dates: string[];
  rebalance_cadence: string;
  strategy_used: string;
  stats: BacktestStats;
  benchmark_stats: BacktestStats;
  bah_cumulative?: number[];
  bah_stats?: BacktestStats;
}

interface BacktestResponse {
  success: boolean;
  result?: BacktestResult;
  narrative?: string;
  error?: string;
}

interface BLView {
  ticker: string;
  expected_return: number;
  confidence: 'low' | 'medium' | 'high';
}

interface AdvancedParams {
  risk_free_rate?: number;
  cvar_beta?: number;
  hrp_linkage?: string;
  bl_tau?: number;
  bl_market_proxy?: string;
}

// ---------------------------------------------------------------------------
// Lookback defaults per strategy
// ---------------------------------------------------------------------------

const STRATEGY_LOOKBACK_DEFAULTS: Record<OptimizationStrategy, number> = {
  min_volatility: 3,
  max_sharpe: 3,
  max_return: 3,
  regularized_sharpe: 3,
  risk_parity: 3,
  cvar: 5,        // CVaR benefits from more tail observations
  hrp: 3,
  black_litterman: 3,
};

const LOOKBACK_OPTIONS = [
  { years: 1, label: '1Y' },
  { years: 3, label: '3Y' },
  { years: 5, label: '5Y' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function strategyMeta(value: OptimizationStrategy): StrategyMeta | undefined {
  return ALL_STRATEGIES.find((s) => s.value === value);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StrategySelectorProps {
  value: OptimizationStrategy;
  onChange: (v: OptimizationStrategy) => void;
}

function StrategySelector({ value, onChange }: StrategySelectorProps) {
  return (
    <div className="space-y-2">
      {STRATEGY_GROUPS.map((group) => (
        <div key={group.group}>
          <p className="text-xs font-semibold text-stone-400 dark:text-gray-500 uppercase tracking-wider mb-1">
            {group.group}
          </p>
          <div className="space-y-1">
            {group.strategies.map((s) => (
              <label
                key={s.value}
                className={[
                  'flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors text-sm',
                  value === s.value
                    ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-stone-900 dark:text-white'
                    : 'hover:bg-stone-50 dark:hover:bg-gray-800 border border-transparent text-stone-700 dark:text-gray-300',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="strategy"
                  value={s.value}
                  checked={value === s.value}
                  onChange={() => onChange(s.value)}
                  className="accent-blue-600 shrink-0"
                />
                <span className="flex-1 leading-snug">{s.label}</span>
                <InfoPopover title={s.label} content={s.description} wikiUrl={s.wikiUrl} />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface AdvancedParamsPanelProps {
  strategy: OptimizationStrategy;
  params: AdvancedParams;
  onChange: (p: AdvancedParams) => void;
  blViews: BLView[];
  onBlViewsChange: (views: BLView[]) => void;
  candidates: string[];
}

function AdvancedParamsPanel({
  strategy,
  params,
  onChange,
  blViews,
  onBlViewsChange,
  candidates,
}: AdvancedParamsPanelProps) {
  const set = (key: keyof AdvancedParams, val: string | number | undefined) =>
    onChange({ ...params, [key]: val });

  return (
    <div className="mt-2 p-3 bg-stone-50 dark:bg-gray-800/60 rounded-md border border-stone-200 dark:border-gray-700 space-y-3 text-sm">

      {/* Risk-free rate — available for all mean-variance strategies */}
      {['max_sharpe', 'min_volatility', 'regularized_sharpe', 'max_return', 'black_litterman'].includes(strategy) && (
        <div>
          <label className="block text-xs text-stone-500 dark:text-gray-400 mb-1">
            Risk-free rate (decimal)
            <InfoPopover content="Annual risk-free rate used in Sharpe ratio calculation. Default: 0.02 (2%)." />
          </label>
          <input
            type="number"
            step="0.001"
            min="0"
            max="0.2"
            placeholder="0.02"
            value={params.risk_free_rate ?? ''}
            onChange={(e) => set('risk_free_rate', e.target.value === '' ? undefined : Number(e.target.value))}
            className="w-full bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded px-2 py-1.5 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {/* CVaR beta */}
      {strategy === 'cvar' && (
        <div>
          <label className="block text-xs text-stone-500 dark:text-gray-400 mb-1">
            CVaR confidence level (β)
            <InfoPopover content="The tail probability cutoff. β=0.95 means we minimise the expected loss in the worst 5% of scenarios." wikiUrl="https://en.wikipedia.org/wiki/Expected_shortfall" />
          </label>
          <input
            type="number"
            step="0.01"
            min="0.5"
            max="0.999"
            placeholder="0.95"
            value={params.cvar_beta ?? ''}
            onChange={(e) => set('cvar_beta', e.target.value === '' ? undefined : Number(e.target.value))}
            className="w-full bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded px-2 py-1.5 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {/* HRP linkage method */}
      {strategy === 'hrp' && (
        <div>
          <label className="block text-xs text-stone-500 dark:text-gray-400 mb-1">
            Linkage method
            <InfoPopover content="Clustering linkage algorithm used to build the dendrogram. 'ward' minimises variance within clusters." />
          </label>
          <select
            value={params.hrp_linkage ?? 'ward'}
            onChange={(e) => set('hrp_linkage', e.target.value)}
            className="w-full bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded px-2 py-1.5 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ward">Ward (default)</option>
            <option value="single">Single</option>
            <option value="complete">Complete</option>
            <option value="average">Average</option>
          </select>
        </div>
      )}

      {/* Black-Litterman params */}
      {strategy === 'black_litterman' && (
        <>
          <div>
            <label className="block text-xs text-stone-500 dark:text-gray-400 mb-1">
              Market proxy ticker
              <InfoPopover content="Ticker used to estimate market risk aversion (δ) and implied equilibrium returns. Default: SPY." />
            </label>
            <input
              type="text"
              placeholder="SPY"
              value={params.bl_market_proxy ?? ''}
              onChange={(e) => set('bl_market_proxy', e.target.value.toUpperCase() || undefined)}
              className="w-full bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded px-2 py-1.5 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-500 dark:text-gray-400 mb-1">
              Tau (τ)
              <InfoPopover content="Scales the uncertainty of the prior. Smaller values give more weight to the market equilibrium. Default: 0.05." wikiUrl="https://en.wikipedia.org/wiki/Black%E2%80%93Litterman_model" />
            </label>
            <input
              type="number"
              step="0.01"
              min="0.001"
              max="1"
              placeholder="0.05"
              value={params.bl_tau ?? ''}
              onChange={(e) => set('bl_tau', e.target.value === '' ? undefined : Number(e.target.value))}
              className="w-full bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded px-2 py-1.5 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Views sub-panel */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-stone-500 dark:text-gray-400 font-medium">
                Your Views (optional)
                <InfoPopover content="Express expected annual returns for specific tickers. Leave empty to rely on market-implied equilibrium only." wikiUrl="https://en.wikipedia.org/wiki/Black%E2%80%93Litterman_model" />
              </span>
              <button
                type="button"
                onClick={() => onBlViewsChange([...blViews, { ticker: '', expected_return: 0.1, confidence: 'medium' }])}
                className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                + Add view
              </button>
            </div>
            {blViews.length === 0 && (
              <p className="text-xs text-stone-400 dark:text-gray-500 italic">
                No views — using market-implied equilibrium returns.
              </p>
            )}
            {blViews.map((view, i) => (
              <div key={i} className="flex items-center gap-2 mt-1">
                <select
                  value={view.ticker}
                  onChange={(e) => {
                    const updated = [...blViews];
                    updated[i] = { ...view, ticker: e.target.value };
                    onBlViewsChange(updated);
                  }}
                  className="w-28 bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded px-2 py-1 text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Ticker…</option>
                  {candidates.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Return (e.g. 0.12)"
                  value={view.expected_return}
                  onChange={(e) => {
                    const updated = [...blViews];
                    updated[i] = { ...view, expected_return: Number(e.target.value) };
                    onBlViewsChange(updated);
                  }}
                  className="w-32 bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded px-2 py-1 text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <select
                  value={view.confidence}
                  onChange={(e) => {
                    const updated = [...blViews];
                    updated[i] = { ...view, confidence: e.target.value as BLView['confidence'] };
                    onBlViewsChange(updated);
                  }}
                  className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded px-2 py-1 text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <button
                  type="button"
                  onClick={() => onBlViewsChange(blViews.filter((_, j) => j !== i))}
                  className="text-stone-400 hover:text-red-500 text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Optimizer() {
  const {
    portfolio, setPortfolio,
    optimizerCandidates: candidates, setOptimizerCandidates: setCandidates,
    optimizerPrincipal: principal, setOptimizerPrincipal: setPrincipal,
    optimizerStrategy: strategy, setOptimizerStrategy: setStrategy,
    optimizerRebalanceMode: rebalanceMode, setOptimizerRebalanceMode: setRebalanceMode,
    optimizerResult: result, setOptimizerResult: setResult,
    optimizerBacktestResult: backtestData, setOptimizerBacktestResult: setBacktestData,
  } = useAppContext();

  // UI local state
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Advanced params state
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedParams, setAdvancedParams] = useState<AdvancedParams>({});
  const [blViews, setBlViews] = useState<BLView[]>([]);

  // Lookback years for optimization data window
  const [lookbackYears, setLookbackYears] = useState<number>(
    STRATEGY_LOOKBACK_DEFAULTS[strategy]
  );

  // Backtest state
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [backtestYears, setBacktestYears] = useState(3);
  const [backtestCadence, setBacktestCadence] = useState('quarterly');

  // Search local state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (searchQuery.includes(',') || searchQuery.includes(' ')) {
      const tokens = searchQuery.split(/[\s,;]+/).map(t => t.trim().toUpperCase()).filter(t => /^[A-Z]{1,5}$/.test(t));
      const merged = Array.from(new Set([...candidates, ...tokens]));
      setCandidates(merged);
      setSearchQuery('');
      setShowSearchDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const resp = await fetch(`http://localhost:8100/market/search?q=${encodeURIComponent(searchQuery)}`);
      if (!resp.ok) throw new Error('Failed to fetch search results.');
      const data: SearchResult[] = await resp.json();
      setSearchResults(data);
      setShowSearchDropdown(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (symbol: string) => {
    const merged = Array.from(new Set([...candidates, symbol.toUpperCase()]));
    setCandidates(merged);
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const removeTicker = (t: string) => {
    setCandidates(candidates.filter((c) => c !== t));
  };

  const handleLoadFromPortfolio = () => {
    if (!portfolio || !portfolio.holdings) return;
    const portTickers = portfolio.holdings.map(h => h.ticker.toUpperCase());
    const merged = Array.from(new Set([...candidates, ...portTickers]));
    setCandidates(merged);
    setRebalanceMode(true);
  };

  const parseFileText = (text: string) => {
    const tokens = text.split(/[\n,;\s]+/).map(t => t.trim().toUpperCase()).filter(t => /^[A-Z]{1,5}$/.test(t));
    const merged = Array.from(new Set([...candidates, ...tokens]));
    if (merged.length > 0) setCandidates(merged);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) parseFileText(text);
    };
    reader.readAsText(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const runOptimization = async () => {
    const current_portfolio: Record<string, number> = {};
    const activeTickers = [...candidates];

    if (rebalanceMode && portfolio) {
      portfolio.holdings.forEach(h => {
        const ticker = h.ticker.toUpperCase();
        current_portfolio[ticker] = (current_portfolio[ticker] || 0) + h.total_shares;
        if (!activeTickers.includes(ticker)) activeTickers.push(ticker);
      });
    }

    if (activeTickers.length < 2) {
      setError("Please add or load at least 2 tickers to optimize.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setBacktestData(null);

    // Build the request payload, stripping undefined advanced params
    const cleanParams = Object.fromEntries(
      Object.entries(advancedParams).filter(([, v]) => v !== undefined && v !== '')
    );
    const validViews = blViews.filter((v) => v.ticker && v.expected_return !== undefined);

    try {
      const res = await fetch('http://127.0.0.1:8100/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers: activeTickers,
          new_cash: principal,
          current_portfolio,
          strategy,
          lookback_years: lookbackYears,
          advanced_params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
          views: validViews.length > 0 ? validViews : undefined,
        }),
      });

      const data: OptimizeResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to run optimization');
      }
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async () => {
    if (!result) return;
    const weights: Record<string, number> = {};
    for (const alloc of result.result.allocations) {
      if (alloc.weight > 0) weights[alloc.ticker] = alloc.weight;
    }
    const tickers = Object.keys(weights);
    if (tickers.length === 0) return;

    setBacktestLoading(true);
    setBacktestError(null);
    setBacktestData(null);

    // Build the request payload, stripping undefined advanced params
    const cleanParams = Object.fromEntries(
      Object.entries(advancedParams).filter(([, v]) => v !== undefined && v !== '')
    );
    const validViews = blViews.filter((v) => v.ticker && v.expected_return !== undefined);

    try {
      const res = await fetch('http://127.0.0.1:8100/optimize/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers,
          strategy,
          cadence: backtestCadence,
          lookback_years: backtestYears,
          advanced_params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
          views: validViews.length > 0 ? validViews : undefined,
          benchmark: 'SPY'
        }),
      });
      const data: BacktestResponse = await res.json();
      if (!data.success || !data.result) {
        throw new Error(data.error || 'Backtest failed');
      }
      setBacktestData(data);
    } catch (err: any) {
      setBacktestError(err.message);
    } finally {
      setBacktestLoading(false);
    }
  };

  const downloadAllocationCSV = () => {
    if (!result) return;
    downloadCSV(
      'allocation.csv',
      ['Ticker', 'Target Weight (%)', 'Current Shares', 'Target Shares', 'Delta', 'Capital ($)'],
      result.result.allocations.map((a: any) => [
        a.ticker,
        (a.weight * 100).toFixed(2),
        a.current_shares,
        a.target_shares,
        a.shares_delta,
        a.target_dollars.toFixed(2),
      ]),
    );
  };

  const downloadBacktestCSV = () => {
    if (!backtestData?.result) return;
    const r = backtestData.result as BacktestResult;
    downloadCSV(
      'backtest.csv',
      ['Date', 'Portfolio Cumulative Return', `${r.benchmark} Cumulative Return`],
      r.dates.map((d, i) => [d, r.portfolio_cumulative[i], r.benchmark_cumulative[i]]),
    );
  };

  const currentStrategyMeta = strategyMeta(strategy);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-white">Portfolio Optimizer</h1>
        <p className="text-stone-600 dark:text-gray-400 mt-2">
          Harness mathematical algorithms to compute the optimal weight distribution for a set of candidate investments based on your risk tolerance.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column: Configuration */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-5 border border-stone-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-white mb-4">Configuration</h2>

            <div className="space-y-5">

              {/* No portfolio loaded hint */}
              {!portfolio && (
                <div className="flex items-start gap-2 p-3 bg-stone-50 dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-md">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-stone-400 dark:text-gray-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="8" strokeLinecap="round" />
                    <line x1="12" y1="12" x2="12" y2="16" strokeLinecap="round" />
                  </svg>
                  <p className="text-xs text-stone-500 dark:text-gray-400">
                    Load a portfolio via the button below to enable Rebalance Mode.
                  </p>
                </div>
              )}

              {/* Rebalance mode toggle */}
              {portfolio && (
                <div className="flex items-center justify-between gap-2 p-3 bg-stone-50 dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-md">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="rebalanceToggle"
                      checked={rebalanceMode}
                      onChange={(e) => setRebalanceMode(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-stone-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                    />
                    <label htmlFor="rebalanceToggle" className="text-sm font-medium text-stone-700 dark:text-gray-300 cursor-pointer select-none">
                      Rebalance Mode (using loaded portfolio)
                    </label>
                  </div>
                  <button
                    onClick={() => { setPortfolio(null); setRebalanceMode(false); }}
                    className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Principal */}
              <div>
                <label className="block text-sm font-medium text-stone-600 dark:text-gray-400 mb-1">
                  {rebalanceMode ? 'New Cash to Add ($)' : 'Principal Amount ($)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={principal}
                  onChange={(e) => setPrincipal(Number(e.target.value))}
                  className="w-full bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-md py-2 px-3 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Strategy selector */}
              <div>
                <label className="block text-sm font-medium text-stone-600 dark:text-gray-400 mb-2">
                  Optimization Strategy
                </label>
                <StrategySelector value={strategy} onChange={(v) => {
                  setStrategy(v);
                  setAdvancedParams({});
                  setBlViews([]);
                  setLookbackYears(STRATEGY_LOOKBACK_DEFAULTS[v]);
                }} />

                {/* Advanced Details accordion */}
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((o) => !o)}
                  className="mt-2 flex items-center gap-1 text-xs text-stone-500 dark:text-gray-400 hover:text-stone-800 dark:hover:text-gray-200 transition-colors"
                >
                  <svg
                    className={`w-3 h-3 transition-transform ${advancedOpen ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Advanced Details
                  {currentStrategyMeta && (
                    <span className="text-stone-400 dark:text-gray-500 ml-1">— {currentStrategyMeta.label}</span>
                  )}
                </button>

                {advancedOpen && (
                  <AdvancedParamsPanel
                    strategy={strategy}
                    params={advancedParams}
                    onChange={setAdvancedParams}
                    blViews={blViews}
                    onBlViewsChange={setBlViews}
                    candidates={candidates}
                  />
                )}
              </div>

              {/* Lookback window */}
              <div>
                <label className="block text-sm font-medium text-stone-600 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                  Historical Data Window
                  <InfoPopover
                    content="Years of price history used to estimate expected returns and covariance. Longer windows are more stable; shorter windows are more reactive to recent market conditions."
                  />
                </label>
                <div className="flex rounded-md overflow-hidden border border-stone-200 dark:border-gray-700">
                  {LOOKBACK_OPTIONS.map(({ years, label }) => {
                    const isDefault = years === STRATEGY_LOOKBACK_DEFAULTS[strategy];
                    return (
                      <button
                        key={years}
                        type="button"
                        onClick={() => setLookbackYears(years)}
                        className={[
                          'flex-1 px-3 py-1.5 text-xs font-medium transition-colors relative',
                          lookbackYears === years
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-gray-800 text-stone-500 dark:text-gray-400 hover:bg-stone-50 dark:hover:bg-gray-700',
                        ].join(' ')}
                      >
                        {label}
                        {isDefault && lookbackYears !== years && (
                          <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-blue-400 opacity-60" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {lookbackYears !== STRATEGY_LOOKBACK_DEFAULTS[strategy] && (
                  <button
                    type="button"
                    onClick={() => setLookbackYears(STRATEGY_LOOKBACK_DEFAULTS[strategy])}
                    className="mt-1 text-xs text-stone-400 dark:text-gray-500 hover:text-stone-600 dark:hover:text-gray-300 transition-colors"
                  >
                    Reset to default ({STRATEGY_LOOKBACK_DEFAULTS[strategy]}Y)
                  </button>
                )}
              </div>

              {/* Candidate universe */}
              <div>
                <label className="block text-sm font-medium text-stone-600 dark:text-gray-400 mb-1 flex justify-between">
                  <span>Candidate Universe</span>
                  {portfolio && portfolio.holdings.length > 0 && (
                    <button
                      onClick={handleLoadFromPortfolio}
                      className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-semibold"
                    >
                      Load Portfolio Tickers
                    </button>
                  )}
                </label>

                <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-3 relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search ticker or company..."
                    className="flex-1 bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-md py-2 px-3 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-stone-400 dark:placeholder-gray-600"
                  />
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="bg-blue-600 hover:bg-blue-500 text-white rounded-md px-3 font-medium transition-colors disabled:opacity-50"
                  >
                    {isSearching ? '...' : 'Add'}
                  </button>

                  {showSearchDropdown && searchResults.length > 0 && (
                    <ul className="absolute top-11 z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {searchResults.map((res) => (
                        <li
                          key={res.symbol}
                          onClick={() => selectSearchResult(res.symbol)}
                          className="px-4 py-2 hover:bg-stone-50 dark:hover:bg-gray-700 cursor-pointer text-stone-700 dark:text-gray-200 text-sm"
                        >
                          <strong className="text-stone-900 dark:text-white">{res.symbol}</strong> — {res.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </form>

                <div
                  className={`border-2 border-dashed rounded-md p-4 text-center transition-colors cursor-pointer ${
                    isDragging
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                      : 'border-stone-300 dark:border-gray-700 hover:border-stone-400 dark:hover:border-gray-500'
                  }`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
                    }}
                  />
                  <p className="text-sm text-stone-500 dark:text-gray-400">Drag a CSV/TXT list of tickers here</p>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {candidates.map(ticker => (
                    <span
                      key={ticker}
                      className="inline-flex items-center px-2 py-1 rounded bg-stone-100 dark:bg-gray-800 text-xs font-semibold text-stone-700 dark:text-gray-200 border border-stone-200 dark:border-gray-700"
                    >
                      {ticker}
                      <button
                        onClick={() => removeTicker(ticker)}
                        className="ml-1 text-stone-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  {candidates.length === 0 && (
                    <span className="text-sm text-stone-400 dark:text-gray-600 italic">No candidates added.</span>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={runOptimization}
                  disabled={loading || (candidates.length < 2 && !rebalanceMode)}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-md py-3 transition-colors shadow-sm"
                >
                  {loading ? 'Solving...' : 'Run Optimization'}
                </button>
              </div>

            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-700 rounded-lg p-4">
              <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Right Column: Results Dashboard */}
        <div className="lg:col-span-2 space-y-6">
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] border-2 border-dashed border-stone-200 dark:border-gray-800 rounded-xl text-stone-400 dark:text-gray-500">
              <svg className="w-12 h-12 mb-4 text-stone-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p>Select your universe and execute to view allocation results.</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center p-24">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          )}

          {!loading && result && (
            <div className="space-y-6 animate-fadeIn flex flex-col">

              <div className="flex justify-end">
                <button
                  onClick={() => exportOptimizerHTML(result, backtestData)}
                  className="flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-gray-400 hover:text-stone-800 dark:hover:text-gray-200 border border-stone-200 dark:border-gray-700 rounded-md px-3 py-1.5 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export HTML
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-900 border border-stone-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="text-sm text-stone-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                    Expected Annual Return
                    <InfoPopover
                      title="Expected Annual Return"
                      content="The anticipated annualized return based on the optimization model's inputs and historical data weighting techniques."
                      wikiUrl="https://en.wikipedia.org/wiki/Expected_return"
                    />
                  </div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {(result.result.metrics.expected_annual_return * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-900 border border-stone-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="text-sm text-stone-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                    Expected Volatility
                    <InfoPopover
                      title="Portfolio Volatility"
                      content="The annualized standard deviation of the portfolio, estimating future risk based on historical covariances."
                      wikiUrl="https://en.wikipedia.org/wiki/Volatility_(finance)"
                    />
                  </div>
                  <div className="text-2xl font-bold text-stone-900 dark:text-gray-100">
                    {(result.result.metrics.annual_volatility * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-900 border border-stone-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="text-sm text-stone-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                    Sharpe Ratio
                    <InfoPopover
                      title="Sharpe Ratio"
                      content="The risk-adjusted performance measure. Represents excess reward generated per unit of systemic volatility."
                      wikiUrl="https://en.wikipedia.org/wiki/Sharpe_ratio"
                    />
                  </div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {result.result.metrics.sharpe_ratio.toFixed(2)}
                  </div>
                </div>
              </div>

              {result.result.frontier_curve.length > 0 && (
                <div className="order-2">
                  <EfficientFrontierChart
                    curve={result.result.frontier_curve}
                    optimalMetrics={result.result.metrics}
                  />
                </div>
              )}

              <div className="order-3">
                <AllocationTable
                  allocations={result.result.allocations}
                  leftoverCash={result.result.leftover_cash}
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={downloadAllocationCSV}
                    className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-gray-400 hover:text-stone-800 dark:hover:text-gray-200 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download CSV
                  </button>
                </div>
              </div>

              {result.narrative && (
                <div className="order-4">
                  <NarrativeBlock narrative={result.narrative} title="AI Critic Review" />
                </div>
              )}

              {/* Backtest section */}
              <div className="order-5 bg-white dark:bg-gray-900 rounded-lg p-5 border border-stone-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-stone-900 dark:text-white">Historical Backtest</h2>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm">
                      {[1, 3, 5].map((yr) => (
                        <button
                          key={yr}
                          onClick={() => { setBacktestYears(yr); setBacktestData(null); }}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            backtestYears === yr
                              ? 'bg-stone-200 dark:bg-gray-700 text-stone-900 dark:text-white'
                              : 'text-stone-500 dark:text-gray-400 hover:bg-stone-100 dark:hover:bg-gray-800'
                          }`}
                        >
                          {yr}Y
                        </button>
                      ))}
                    </div>
                    <select
                      value={backtestCadence}
                      onChange={(e) => { setBacktestCadence(e.target.value); setBacktestData(null); }}
                      className="bg-white dark:bg-gray-800 border border-stone-200 dark:border-gray-700 text-stone-700 dark:text-gray-300 text-xs font-medium rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annual">Annual</option>
                      <option value="buy_and_hold">Buy & Hold</option>
                    </select>
                    <button
                      onClick={runBacktest}
                      disabled={backtestLoading}
                      className="bg-stone-800 dark:bg-gray-100 hover:bg-stone-700 dark:hover:bg-white text-white dark:text-gray-900 text-xs font-semibold px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                    >
                      {backtestLoading ? 'Running…' : 'Run Backtest'}
                    </button>
                  </div>
                </div>

                {backtestError && (
                  <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded px-3 py-2">
                    {backtestError}
                  </p>
                )}

                {backtestLoading && (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                  </div>
                )}

                {!backtestLoading && !backtestData && !backtestError && (
                  <p className="text-sm text-stone-400 dark:text-gray-500 text-center py-8">
                    Apply the optimized weights to historical data to see how this portfolio would have performed.
                  </p>
                )}

                {!backtestLoading && backtestData?.result && (() => {
                  const bt = backtestData.result as BacktestResult;
                  return (
                    <div className="space-y-5">
                      <BacktestChart
                        dates={bt.dates}
                        portfolioCumulative={bt.portfolio_cumulative}
                        benchmarkCumulative={bt.benchmark_cumulative}
                        benchmark={bt.benchmark}
                        rebalanceDates={bt.rebalance_dates}
                        bahCumulative={bt.bah_cumulative}
                      />

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-stone-500 dark:text-gray-400 border-b border-stone-200 dark:border-gray-700">
                              <th className="text-left py-2 font-medium">Metric</th>
                              <th className="text-right py-2 font-medium">Walk-Forward</th>
                              {bt.bah_stats && (
                                <th className="text-right py-2 font-medium">Buy & Hold</th>
                              )}
                              <th className="text-right py-2 font-medium">{bt.benchmark}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100 dark:divide-gray-800">
                            {[
                              { label: 'Total Return', p: (bt.stats.total_return * 100).toFixed(2) + '%', b: (bt.benchmark_stats.total_return * 100).toFixed(2) + '%', bah: bt.bah_stats ? (bt.bah_stats.total_return * 100).toFixed(2) + '%' : null },
                              { label: 'Ann. Return', p: (bt.stats.annualized_return * 100).toFixed(2) + '%', b: (bt.benchmark_stats.annualized_return * 100).toFixed(2) + '%', bah: bt.bah_stats ? (bt.bah_stats.annualized_return * 100).toFixed(2) + '%' : null },
                              { label: 'Ann. Volatility', p: (bt.stats.annual_volatility * 100).toFixed(2) + '%', b: (bt.benchmark_stats.annual_volatility * 100).toFixed(2) + '%', bah: bt.bah_stats ? (bt.bah_stats.annual_volatility * 100).toFixed(2) + '%' : null },
                              { label: 'Sharpe Ratio', p: bt.stats.sharpe_ratio.toFixed(2), b: bt.benchmark_stats.sharpe_ratio.toFixed(2), bah: bt.bah_stats ? bt.bah_stats.sharpe_ratio.toFixed(2) : null },
                              { label: 'Max Drawdown', p: (bt.stats.max_drawdown * 100).toFixed(2) + '%', b: (bt.benchmark_stats.max_drawdown * 100).toFixed(2) + '%', bah: bt.bah_stats ? (bt.bah_stats.max_drawdown * 100).toFixed(2) + '%' : null },
                              { label: 'Calmar Ratio', p: bt.stats.calmar_ratio.toFixed(2), b: bt.benchmark_stats.calmar_ratio.toFixed(2), bah: bt.bah_stats ? bt.bah_stats.calmar_ratio.toFixed(2) : null },
                            ].map(({ label, p, b, bah }) => (
                              <tr key={label}>
                                <td className="py-2 text-stone-500 dark:text-gray-400">{label}</td>
                                <td className="py-2 text-right font-medium text-stone-900 dark:text-gray-100">{p}</td>
                                {bah !== null && (
                                  <td className="py-2 text-right font-medium text-stone-600 dark:text-gray-300">{bah}</td>
                                )}
                                <td className="py-2 text-right text-stone-500 dark:text-gray-400">{b}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={downloadBacktestCSV}
                          className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-gray-400 hover:text-stone-800 dark:hover:text-gray-200 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download Backtest CSV
                        </button>
                      </div>

                      {backtestData.narrative && (
                        <NarrativeBlock narrative={backtestData.narrative} title="Backtest Note" />
                      )}
                    </div>
                  );
                })()}
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}
