import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CorrelationHeatmap from '../components/CorrelationHeatmap';
import RiskReturnScatter from '../components/RiskReturnScatter';
import type { ScatterPoint } from '../components/RiskReturnScatter';
import { useAppContext } from '../context/AppContext';
import { useChartTheme } from '../hooks/useChartTheme';

interface TickerInfo {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  pe_ratio: number | null;
  dividend_yield: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  current_price: number | null;
  currency: string | null;
  exchange: string | null;
  description: string | null;
}

interface PerformanceMetrics {
  total_return: number;
  annualized_return: number;
  volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
}

interface SuggestionItem {
  ticker: string;
  correlation: number;
  performance: PerformanceMetrics;
  info: TickerInfo;
}

interface SuggestResponse {
  suggestions: SuggestionItem[];
  correlation_matrix?: Record<string, Record<string, number>> | null;
  portfolio_ticker_metrics?: Record<string, PerformanceMetrics> | null;
}

type SuggestSort = 'correlation' | 'return' | 'sharpe' | 'volatility';

const CURATED_CANDIDATES: { category: string; tickers: { symbol: string; name: string }[] }[] = [
  {
    category: 'Fixed Income',
    tickers: [
      { symbol: 'TLT', name: '20+ Year Treasury Bond' },
      { symbol: 'IEF', name: '7-10 Year Treasury Bond' },
      { symbol: 'BND', name: 'Total Bond Market' },
      { symbol: 'LQD', name: 'IG Corporate Bonds' },
      { symbol: 'HYG', name: 'High Yield Corp Bonds' },
      { symbol: 'TIP', name: 'Treasury Inflation-Protected' },
    ],
  },
  {
    category: 'International Equity',
    tickers: [
      { symbol: 'EFA', name: 'Developed Markets (MSCI EAFE)' },
      { symbol: 'VEA', name: 'FTSE Developed ex-US' },
      { symbol: 'EEM', name: 'Emerging Markets' },
      { symbol: 'VWO', name: 'FTSE Emerging Markets' },
      { symbol: 'IEFA', name: 'Core MSCI EAFE' },
    ],
  },
  {
    category: 'Commodities & Real Assets',
    tickers: [
      { symbol: 'GLD', name: 'Gold Trust' },
      { symbol: 'IAU', name: 'iShares Gold' },
      { symbol: 'SLV', name: 'Silver Trust' },
      { symbol: 'GSG', name: 'S&P GSCI Commodities' },
      { symbol: 'DBC', name: 'DB Commodity Index' },
    ],
  },
  {
    category: 'Real Estate',
    tickers: [
      { symbol: 'VNQ', name: 'US Real Estate' },
      { symbol: 'VNQI', name: 'International Real Estate' },
      { symbol: 'IYR', name: 'iShares US Real Estate' },
    ],
  },
  {
    category: 'Low Volatility & Defensive',
    tickers: [
      { symbol: 'USMV', name: 'US Min Volatility' },
      { symbol: 'EFAV', name: 'EAFE Min Volatility' },
      { symbol: 'SPLV', name: 'S&P 500 Low Volatility' },
      { symbol: 'XLU', name: 'Utilities Sector' },
      { symbol: 'XLP', name: 'Consumer Staples Sector' },
    ],
  },
  {
    category: 'Factor & Sector',
    tickers: [
      { symbol: 'VLUE', name: 'MSCI USA Value' },
      { symbol: 'MTUM', name: 'MSCI USA Momentum' },
      { symbol: 'QUAL', name: 'MSCI USA Quality' },
      { symbol: 'IWM', name: 'Russell 2000 Small-Cap' },
      { symbol: 'XLE', name: 'Energy Sector' },
      { symbol: 'XLV', name: 'Healthcare Sector' },
    ],
  },
  {
    category: 'Large-Cap & Broad Market ETFs',
    tickers: [
      { symbol: 'SPY',  name: 'S&P 500 (SPDR)' },
      { symbol: 'VOO',  name: 'S&P 500 (Vanguard)' },
      { symbol: 'VTI',  name: 'Total US Stock Market' },
      { symbol: 'VUG',  name: 'Vanguard Growth' },
      { symbol: 'VIG',  name: 'Vanguard Dividend Appreciation' },
      { symbol: 'DIA',  name: 'Dow Jones Industrial Avg' },
      { symbol: 'MGK',  name: 'Vanguard Mega-Cap Growth' },
    ],
  },
  {
    category: 'Technology ETFs',
    tickers: [
      { symbol: 'QQQ',  name: 'Nasdaq 100' },
      { symbol: 'XLK',  name: 'Technology Select Sector' },
      { symbol: 'VGT',  name: 'Vanguard IT' },
      { symbol: 'SOXX', name: 'iShares Semiconductor' },
      { symbol: 'IGV',  name: 'iShares Software' },
      { symbol: 'CIBR', name: 'First Trust Cybersecurity' },
      { symbol: 'ARKK', name: 'ARK Innovation' },
    ],
  },
  {
    category: 'High-Growth Stocks',
    tickers: [
      { symbol: 'AAPL', name: 'Apple' },
      { symbol: 'MSFT', name: 'Microsoft' },
      { symbol: 'NVDA', name: 'NVIDIA' },
      { symbol: 'GOOGL', name: 'Alphabet (Google)' },
      { symbol: 'AMZN', name: 'Amazon' },
      { symbol: 'META', name: 'Meta Platforms' },
      { symbol: 'TSLA', name: 'Tesla' },
      { symbol: 'AVGO', name: 'Broadcom' },
      { symbol: 'NFLX', name: 'Netflix' },
      { symbol: 'CRM',  name: 'Salesforce' },
    ],
  },
  {
    category: 'Dividend & Income Stocks',
    tickers: [
      { symbol: 'JNJ',  name: 'Johnson & Johnson' },
      { symbol: 'KO',   name: 'Coca-Cola' },
      { symbol: 'PG',   name: 'Procter & Gamble' },
      { symbol: 'PEP',  name: 'PepsiCo' },
      { symbol: 'MCD',  name: "McDonald's" },
      { symbol: 'MO',   name: 'Altria Group' },
      { symbol: 'VZ',   name: 'Verizon' },
      { symbol: 'XOM',  name: 'ExxonMobil' },
      { symbol: 'CVX',  name: 'Chevron' },
      { symbol: 'NEE',  name: 'NextEra Energy' },
      { symbol: 'DUK',  name: 'Duke Energy' },
      { symbol: 'SO',   name: 'Southern Company' },
    ],
  },
];

const CHIP_LABELS: Record<string, string> = {
  'Fixed Income': 'Fixed Income',
  'International Equity': 'International',
  'Commodities & Real Assets': 'Commodities',
  'Real Estate': 'Real Estate',
  'Low Volatility & Defensive': 'Low Vol',
  'Factor & Sector': 'Factor/Sector',
  'Large-Cap & Broad Market ETFs': 'Large-Cap',
  'Technology ETFs': 'Tech',
  'High-Growth Stocks': 'Growth',
  'Dividend & Income Stocks': 'Dividend',
};

function correlationLabel(corr: number): { label: string; classes: string } {
  if (corr < 0.2)  return { label: 'Strong',   classes: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
  if (corr < 0.5)  return { label: 'Good',     classes: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
  if (corr < 0.72) return { label: 'Moderate', classes: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
  return                 { label: 'Weak',     classes: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' };
}

function pct(v: number, decimals = 2): string {
  return (v * 100).toFixed(decimals) + '%';
}

function fmt2(v: number): string {
  return v.toFixed(2);
}

const curatedNameMap = new Map(
  CURATED_CANDIDATES.flatMap((c) => c.tickers.map((t) => [t.symbol, t.name]))
);

export default function DiversifyPage() {
  const navigate = useNavigate();
  const {
    portfolio,
    investigatorSuggestResults,
    setInvestigatorSuggestResults: setSuggestResults,
    investigatorSuggestMatrix,
    setInvestigatorSuggestMatrix: setSuggestMatrix,
    investigatorPortfolioSectorMap: portfolioSectorMap,
    setInvestigatorPortfolioSectorMap: setPortfolioSectorMap,
    investigatorSuggestSort,
    setInvestigatorSuggestSort,
    investigatorPortfolioMetrics,
    setInvestigatorPortfolioMetrics: setPortfolioMetrics,
    investigatorSuggestLoading: suggestLoading,
    setInvestigatorSuggestLoading: setSuggestLoading,
    investigatorSuggestError: suggestError,
    setInvestigatorSuggestError: setSuggestError,
  } = useAppContext();

  const { isDark } = useChartTheme();
  const suggestResults = investigatorSuggestResults as SuggestionItem[] | null;
  const suggestMatrix = investigatorSuggestMatrix as Record<string, Record<string, number>> | null;
  const suggestSort = investigatorSuggestSort as SuggestSort;
  const castPortfolioMetrics = investigatorPortfolioMetrics as Record<string, PerformanceMetrics> | null;

  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    () => new Set(CURATED_CANDIDATES.map((c) => c.category))
  );
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [excludedTickers, setExcludedTickers] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState('');
  const [customTickers, setCustomTickers] = useState<string[]>([]);

  const portfolioSymbols = new Set(
    (portfolio?.holdings ?? []).map((h) => h.ticker.toUpperCase())
  );

  const selectedSymbols = new Set(
    CURATED_CANDIDATES
      .filter((c) => activeCategories.has(c.category))
      .flatMap((c) => c.tickers
        .filter((t) => !excludedTickers.has(t.symbol))
        .map((t) => t.symbol))
  );

  const effectiveCandidates = [...selectedSymbols, ...customTickers].filter(
    (s) => !portfolioSymbols.has(s)
  );

  function toggleCategory(category: string) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function toggleTicker(symbol: string) {
    setExcludedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  function selectAllInCategory(cat: (typeof CURATED_CANDIDATES)[0]) {
    setExcludedTickers((prev) => {
      const next = new Set(prev);
      for (const t of cat.tickers) next.delete(t.symbol);
      return next;
    });
  }

  function deselectAllInCategory(cat: (typeof CURATED_CANDIDATES)[0]) {
    setExcludedTickers((prev) => {
      const next = new Set(prev);
      for (const t of cat.tickers) {
        if (!portfolioSymbols.has(t.symbol)) next.add(t.symbol);
      }
      return next;
    });
  }

  function addCustomTicker() {
    const tokens = customInput
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => /^[A-Z0-9.-]{1,10}$/.test(t));
    if (tokens.length === 0) return;
    setCustomTickers((prev) => Array.from(new Set([...prev, ...tokens])));
    setCustomInput('');
  }

  function removeCustomTicker(t: string) {
    setCustomTickers((prev) => prev.filter((c) => c !== t));
  }

  async function runSuggest() {
    if (!portfolio || effectiveCandidates.length === 0) return;
    setSuggestLoading(true);
    setSuggestError(null);
    setSuggestResults(null);
    setSuggestMatrix(null);
    setPortfolioMetrics(null);
    try {
      const resp = await fetch('http://localhost:8100/market/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: portfolio.holdings, candidates: effectiveCandidates }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${resp.status}`);
      }
      const data: SuggestResponse = await resp.json();
      setSuggestResults(data.suggestions);
      if (data.correlation_matrix) setSuggestMatrix(data.correlation_matrix);
      if (data.portfolio_ticker_metrics) setPortfolioMetrics(data.portfolio_ticker_metrics);

      const portTickers = portfolio.holdings.map((h) => h.ticker.toUpperCase());
      if (portTickers.length > 0) {
        fetch('http://localhost:8100/market/sectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers: portTickers }),
        })
          .then((r) => r.json())
          .then((metas: { ticker: string; sector: string | null }[]) => {
            const sm: Record<string, string | null> = {};
            for (const m of metas) sm[m.ticker] = m.sector;
            setPortfolioSectorMap(sm);
          })
          .catch(() => {});
      }
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setSuggestLoading(false);
    }
  }

  const sortedSuggestions = suggestResults
    ? [...suggestResults].sort((a, b) => {
        switch (suggestSort) {
          case 'correlation': return a.correlation - b.correlation;
          case 'return':      return b.performance.annualized_return - a.performance.annualized_return;
          case 'sharpe':      return b.performance.sharpe_ratio - a.performance.sharpe_ratio;
          case 'volatility':  return a.performance.volatility - b.performance.volatility;
        }
      })
    : [];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-white mb-2">Diversify</h1>
        <p className="text-stone-600 dark:text-gray-400">
          Score a candidate pool by diversification value — surface what your portfolio is missing.
        </p>
      </div>

      {/* Candidate pool controls */}
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 border border-stone-200 dark:border-gray-800 space-y-5">
        {!portfolio ? (
          <div className="text-center py-6">
            <p className="text-sm text-stone-400 dark:text-gray-500">
              Load a portfolio first to find diversifiers.
            </p>
          </div>
        ) : (
          <>
            {/* Category chips */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-stone-500 dark:text-gray-400 uppercase tracking-wide">
                  Asset Categories
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (activeCategories.size === CURATED_CANDIDATES.length) {
                      setActiveCategories(new Set());
                    } else {
                      setActiveCategories(new Set(CURATED_CANDIDATES.map((c) => c.category)));
                    }
                  }}
                  className="text-xs text-stone-400 dark:text-gray-500 hover:text-stone-600 dark:hover:text-gray-300 underline transition-colors"
                >
                  {activeCategories.size === CURATED_CANDIDATES.length ? 'Clear all' : 'Select all'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {CURATED_CANDIDATES.map((cat) => {
                  const isActive = activeCategories.has(cat.category);
                  const isExpanded = expandedCategory === cat.category;
                  const availableCount = cat.tickers.filter((t) => !portfolioSymbols.has(t.symbol)).length;
                  const selectedCount = isActive
                    ? cat.tickers.filter((t) => !portfolioSymbols.has(t.symbol) && !excludedTickers.has(t.symbol)).length
                    : 0;
                  const badgeCount = isActive ? selectedCount : availableCount;
                  const chipLabel = CHIP_LABELS[cat.category] ?? cat.category;
                  const activeStyle = 'bg-blue-600 text-white border-blue-600 hover:bg-blue-500 hover:border-blue-500';
                  const inactiveStyle = 'bg-white dark:bg-gray-900 text-stone-500 dark:text-gray-400 border-stone-300 dark:border-gray-700 hover:border-stone-400 dark:hover:border-gray-600';
                  return (
                    <div key={cat.category} className="inline-flex items-stretch">
                      {/* Toggle the whole category */}
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat.category)}
                        className={[
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-l-full text-xs font-medium border border-r-0 transition-colors',
                          isActive ? activeStyle : inactiveStyle,
                        ].join(' ')}
                      >
                        {chipLabel}
                        {badgeCount > 0 && (
                          <span
                            className={[
                              'rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold',
                              isActive
                                ? 'bg-blue-500 text-white'
                                : 'bg-stone-100 dark:bg-gray-800 text-stone-500 dark:text-gray-500',
                            ].join(' ')}
                          >
                            {badgeCount}
                          </span>
                        )}
                      </button>
                      {/* Expand to pick individual tickers */}
                      <button
                        type="button"
                        onClick={() => setExpandedCategory(isExpanded ? null : cat.category)}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${chipLabel}`}
                        className={[
                          'inline-flex items-center px-1.5 rounded-r-full text-xs font-medium border transition-colors',
                          isActive ? activeStyle : inactiveStyle,
                          isExpanded ? 'opacity-80' : '',
                        ].join(' ')}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Expanded ticker panel */}
              {expandedCategory && (() => {
                const cat = CURATED_CANDIDATES.find((c) => c.category === expandedCategory);
                if (!cat) return null;
                const isCatActive = activeCategories.has(cat.category);
                const available = cat.tickers.filter((t) => !portfolioSymbols.has(t.symbol));
                const nSelected = available.filter((t) => !excludedTickers.has(t.symbol)).length;
                return (
                  <div className="mt-1 p-3 bg-stone-50 dark:bg-gray-800/60 rounded-lg border border-stone-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-xs font-semibold text-stone-700 dark:text-gray-300">
                        {cat.category}
                      </p>
                      {isCatActive && (
                        <div className="flex gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => selectAllInCategory(cat)}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() => deselectAllInCategory(cat)}
                            className="text-stone-400 dark:text-gray-500 hover:underline"
                          >
                            Deselect all
                          </button>
                        </div>
                      )}
                    </div>
                    {!isCatActive && (
                      <p className="text-xs text-stone-400 dark:text-gray-500 mb-2 italic">
                        Enable this category to select individual tickers.
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0.5">
                      {cat.tickers.map((t) => {
                        const inPortfolio = portfolioSymbols.has(t.symbol);
                        const disabled = inPortfolio || !isCatActive;
                        const isChecked = !disabled && !excludedTickers.has(t.symbol);
                        return (
                          <label
                            key={t.symbol}
                            className={[
                              'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors select-none',
                              disabled
                                ? 'opacity-40 cursor-not-allowed'
                                : 'cursor-pointer hover:bg-white dark:hover:bg-gray-700/60',
                            ].join(' ')}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={disabled}
                              onChange={() => !disabled && toggleTicker(t.symbol)}
                              className="rounded border-stone-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 disabled:cursor-not-allowed shrink-0"
                            />
                            <span className="flex items-baseline gap-1.5 min-w-0">
                              <span className="font-semibold text-stone-900 dark:text-white shrink-0">{t.symbol}</span>
                              <span className="text-stone-400 dark:text-gray-500 truncate">{t.name}</span>
                            </span>
                            {inPortfolio && (
                              <span className="ml-auto shrink-0 text-[10px] text-stone-400 dark:text-gray-600">portfolio</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    {isCatActive && nSelected < available.length && (
                      <p className="text-[10px] text-stone-400 dark:text-gray-500 mt-2">
                        {nSelected} of {available.length} selected
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Custom ticker input */}
            <div>
              <p className="text-xs font-medium text-stone-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Add Custom Tickers
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomTicker()}
                  placeholder="e.g. BITO, GBTC"
                  className="flex-1 bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-stone-400 dark:placeholder-gray-600"
                />
                <button
                  type="button"
                  onClick={addCustomTicker}
                  disabled={!customInput.trim()}
                  className="bg-stone-100 dark:bg-gray-800 hover:bg-stone-200 dark:hover:bg-gray-700 border border-stone-300 dark:border-gray-700 text-stone-700 dark:text-gray-300 text-sm px-3 rounded-md transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              {customTickers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {customTickers.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 dark:bg-gray-800 border border-stone-200 dark:border-gray-700 text-xs font-semibold text-stone-700 dark:text-gray-200"
                    >
                      {t}
                      <button
                        onClick={() => removeCustomTicker(t)}
                        className="text-stone-400 hover:text-red-500 leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Run button */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-stone-400 dark:text-gray-500">
                {effectiveCandidates.length} candidates selected
              </p>
              <button
                onClick={runSuggest}
                disabled={suggestLoading || effectiveCandidates.length === 0}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-md py-2 px-6 text-sm transition-colors"
              >
                {suggestLoading ? 'Analysing…' : 'Find Diversifiers'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Loading state */}
      {suggestLoading && (
        <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-gray-900 rounded-lg border border-stone-200 dark:border-gray-800 gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
          <p className="text-sm text-stone-500 dark:text-gray-400">
            Fetching data for {effectiveCandidates.length} candidates…
          </p>
        </div>
      )}

      {/* Error */}
      {suggestError && (
        <div className="bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-700 rounded-lg px-4 py-3 text-red-700 dark:text-red-300 text-sm">
          {suggestError}
        </div>
      )}

      {/* Empty result */}
      {!suggestLoading && suggestResults && suggestResults.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 bg-white dark:bg-gray-900 rounded-lg border border-stone-200 dark:border-gray-800 text-stone-400 dark:text-gray-500 text-sm">
          No valid results returned — check your candidate selection.
        </div>
      )}

      {/* Scatter hero */}
      {!suggestLoading && sortedSuggestions.length > 0 && (() => {
        const scatterPoints: ScatterPoint[] = [
          ...(portfolio?.holdings ?? [])
            .filter((h) => castPortfolioMetrics?.[h.ticker.toUpperCase()] != null)
            .map((h) => {
              const t = h.ticker.toUpperCase();
              const m = castPortfolioMetrics![t];
              return {
                ticker: t,
                volatility: m.volatility,
                annualized_return: m.annualized_return,
                sharpe_ratio: m.sharpe_ratio,
                sector: portfolioSectorMap[t] ?? null,
                isPortfolio: true,
              } as ScatterPoint;
            }),
          ...(suggestResults ?? []).map((s) => ({
            ticker: s.ticker,
            volatility: s.performance.volatility,
            annualized_return: s.performance.annualized_return,
            sharpe_ratio: s.performance.sharpe_ratio,
            sector: s.info.sector ?? null,
            isPortfolio: false,
            correlationScore: s.correlation,
          } as ScatterPoint)),
        ];
        if (scatterPoints.length < 2) return null;
        return (
          <RiskReturnScatter
            points={scatterPoints}
            isDark={isDark}
            title="Risk / Return — Portfolio vs Candidates"
          />
        );
      })()}

      {/* Heatmap */}
      {!suggestLoading && sortedSuggestions.length > 0 && suggestMatrix && (() => {
        const byCorr = [...(suggestResults ?? [])].sort((a, b) => a.correlation - b.correlation);
        const nS = byCorr.length;
        const bottom10 = byCorr.slice(0, Math.min(10, nS)).map((s) => s.ticker);
        const top10 = byCorr.slice(Math.max(0, nS - 10)).map((s) => s.ticker);
        const portTickers = [...portfolioSymbols];
        const heatTickers = [...new Set([...portTickers, ...bottom10, ...top10])];
        const sectorMap: Record<string, string | null> = { ...portfolioSectorMap };
        const corrScores: Record<string, number> = {};
        for (const s of (suggestResults ?? [])) {
          sectorMap[s.ticker] = s.info.sector ?? null;
          corrScores[s.ticker] = s.correlation;
        }
        const heatH = Math.max(400, Math.min(680, heatTickers.length * 22 + 120));
        return (
          <CorrelationHeatmap
            matrix={suggestMatrix}
            tickers={heatTickers}
            sectorMap={sectorMap}
            portfolioTickers={portTickers}
            correlationScores={corrScores}
            isDark={isDark}
            title="Correlation Heatmap — Portfolio vs Top & Bottom 10 Candidates"
            height={heatH}
          />
        );
      })()}

      {/* Candidate cards */}
      {!suggestLoading && sortedSuggestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-stone-500 dark:text-gray-400">
              {sortedSuggestions.length} candidates ranked — lower correlation = stronger diversifier
            </p>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-stone-400 dark:text-gray-500 mr-1">Sort:</span>
              {(
                [
                  { key: 'correlation', label: 'Correlation' },
                  { key: 'return',      label: '1Y Return'   },
                  { key: 'sharpe',      label: 'Sharpe'      },
                  { key: 'volatility',  label: 'Volatility'  },
                ] as { key: SuggestSort; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setInvestigatorSuggestSort(key)}
                  className={[
                    'px-2.5 py-1 rounded transition-colors',
                    suggestSort === key
                      ? 'bg-blue-600 text-white'
                      : 'text-stone-500 dark:text-gray-400 hover:bg-stone-100 dark:hover:bg-gray-800',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sortedSuggestions.map((s) => {
              const badge = correlationLabel(s.correlation);
              const displayName = s.info.name ?? curatedNameMap.get(s.ticker) ?? '—';
              return (
                <div
                  key={s.ticker}
                  className="bg-white dark:bg-gray-900 rounded-lg border border-stone-200 dark:border-gray-800 p-4 space-y-3 hover:border-stone-300 dark:hover:border-gray-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-lg font-bold text-stone-900 dark:text-white">{s.ticker}</span>
                      <p className="text-xs text-stone-500 dark:text-gray-400 truncate mt-0.5">{displayName}</p>
                      {(s.info.sector || s.info.industry) && (
                        <p className="text-xs text-stone-400 dark:text-gray-600 truncate">
                          {s.info.sector ?? s.info.industry}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${badge.classes}`}>
                        {badge.label}
                      </span>
                      <p className="text-xs text-stone-400 dark:text-gray-500 mt-1">corr {s.correlation.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs border-t border-stone-100 dark:border-gray-800 pt-2">
                    <div>
                      <p className="text-stone-400 dark:text-gray-500 mb-0.5">1Y Return</p>
                      <p className={`font-semibold ${s.performance.annualized_return >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {s.performance.annualized_return >= 0 ? '+' : ''}{pct(s.performance.annualized_return)}
                      </p>
                    </div>
                    <div>
                      <p className="text-stone-400 dark:text-gray-500 mb-0.5">Sharpe</p>
                      <p className={`font-semibold ${s.performance.sharpe_ratio >= 0 ? 'text-stone-900 dark:text-gray-100' : 'text-red-600 dark:text-red-400'}`}>
                        {fmt2(s.performance.sharpe_ratio)}
                      </p>
                    </div>
                    <div>
                      <p className="text-stone-400 dark:text-gray-500 mb-0.5">Volatility</p>
                      <p className="font-semibold text-stone-900 dark:text-gray-100">{pct(s.performance.volatility)}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/research?ticker=${s.ticker}`)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 border border-blue-200 dark:border-blue-900 hover:border-blue-400 dark:hover:border-blue-700 rounded-md transition-colors"
                  >
                    Research
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
