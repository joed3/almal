import { useState } from 'react';
import _Plot from 'react-plotly.js';
import MetricCard from '../components/MetricCard';
import InfoPopover from '../components/InfoPopover';
import NarrativeBlock from '../components/NarrativeBlock';
import CorrelationHeatmap from '../components/CorrelationHeatmap';
import RiskReturnScatter from '../components/RiskReturnScatter';
import type { ScatterPoint } from '../components/RiskReturnScatter';
import type { Portfolio } from '../utils/csv';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { downloadCSV } from '../utils/export';
import { exportInvestigatorHTML } from '../utils/exportHTML';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = (_Plot as any).default ?? _Plot;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvestigatorMode = 'investigate' | 'suggest';
type SuggestSort = 'correlation' | 'return' | 'sharpe' | 'volatility';

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

interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceHistory {
  ticker: string;
  bars: PriceBar[];
  start_date: string;
  end_date: string;
}

interface PerformanceMetrics {
  total_return: number;
  annualized_return: number;
  volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
}

interface PortfolioFit {
  correlation: number;
  current_metrics: PerformanceMetrics;
  simulated_metrics: PerformanceMetrics;
  narrative: string | null;
}

interface TickerAnalysisResult {
  info: TickerInfo;
  history: PriceHistory;
  performance: PerformanceMetrics;
  portfolio_fit: PortfolioFit | null;
  portfolio_series?: Record<string, number>;
}

interface AgentResponse {
  intent: string;
  success: boolean;
  result: TickerAnalysisResult;
  narrative: string | null;
  error: string | null;
}

interface SearchResult {
  symbol: string;
  name: string;
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

// ---------------------------------------------------------------------------
// Curated candidate universe
// ---------------------------------------------------------------------------

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

const ALL_CURATED_SYMBOLS = CURATED_CANDIDATES.flatMap((c) => c.tickers.map((t) => t.symbol));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(v: number, decimals = 2): string {
  return (v * 100).toFixed(decimals) + '%';
}

function fmt2(v: number): string {
  return v.toFixed(2);
}

function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'N/A';
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  return '$' + n.toLocaleString('en-US');
}

function correlationLabel(corr: number): { label: string; classes: string } {
  if (corr < 0.2)  return { label: 'Strong',   classes: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
  if (corr < 0.5)  return { label: 'Good',     classes: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
  if (corr < 0.72) return { label: 'Moderate', classes: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
  return               { label: 'Weak',     classes: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Investigator() {
  const context = useAppContext();
  const {
    portfolio,
    investigatorSearchQuery: searchQuery, setInvestigatorSearchQuery: setSearchQuery,
    selectedTicker, setSelectedTicker,
    investigatorResult, setInvestigatorResult: setAnalysisResult,
    investigatorNarrative: analysisNarrative, setInvestigatorNarrative: setAnalysisNarrative,
    investigatorMode, setInvestigatorMode,
    investigatorSuggestResults, setInvestigatorSuggestResults,
    investigatorSuggestMatrix, setInvestigatorSuggestMatrix,
    investigatorPortfolioSectorMap, setInvestigatorPortfolioSectorMap,
    investigatorSuggestSort, setInvestigatorSuggestSort,
    investigatorPortfolioMetrics, setInvestigatorPortfolioMetrics,
    investigatorLoading, setInvestigatorLoading,
    investigatorApiError, setInvestigatorApiError,
    investigatorSuggestLoading, setInvestigatorSuggestLoading,
    investigatorSuggestError, setInvestigatorSuggestError,
  } = context;

  const { isDark } = useTheme();
  const analysisResult = investigatorResult as TickerAnalysisResult | null;

  const mode = investigatorMode as InvestigatorMode;
  const setMode = (m: InvestigatorMode) => setInvestigatorMode(m);
  const suggestResults = investigatorSuggestResults as SuggestionItem[] | null;
  const setSuggestResults = setInvestigatorSuggestResults;
  const suggestMatrix = investigatorSuggestMatrix as Record<string, Record<string, number>> | null;
  const setSuggestMatrix = setInvestigatorSuggestMatrix;
  const portfolioSectorMap = investigatorPortfolioSectorMap;
  const setPortfolioSectorMap = setInvestigatorPortfolioSectorMap;
  const suggestSort = investigatorSuggestSort as SuggestSort;
  const setSuggestSort = (s: SuggestSort) => setInvestigatorSuggestSort(s);
  const portfolioMetrics = investigatorPortfolioMetrics as Record<string, PerformanceMetrics> | null;
  const setPortfolioMetrics = setInvestigatorPortfolioMetrics;

  // Loading/error aliases from context (survive panel navigation)
  const loadingAnalysis = investigatorLoading;
  const setLoadingAnalysis = setInvestigatorLoading;
  const apiError = investigatorApiError;
  const setApiError = setInvestigatorApiError;
  const suggestLoading = investigatorSuggestLoading;
  const setSuggestLoading = setInvestigatorSuggestLoading;
  const suggestError = investigatorSuggestError;
  const setSuggestError = setInvestigatorSuggestError;

  // ---- Investigate mode state ----
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // ---- Suggest mode local (UI-only) state ----
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(
    () => new Set(ALL_CURATED_SYMBOLS),
  );
  const [customInput, setCustomInput] = useState('');
  const [customTickers, setCustomTickers] = useState<string[]>([]);

  // Plotly theme colors
  const gridcolor = isDark ? '#374151' : '#e5e7eb';
  const axisColor = isDark ? '#9ca3af' : '#6b7280';
  const fontColor = isDark ? '#d1d5db' : '#374151';

  // ---------------------------------------------------------------------------
  // Investigate mode handlers
  // ---------------------------------------------------------------------------

  const downloadTickerCSV = () => {
    if (!analysisResult || !selectedTicker) return;
    const info = analysisResult.info;
    downloadCSV(
      `${selectedTicker}_analysis.csv`,
      ['Field', 'Value'],
      [
        ['Ticker', selectedTicker],
        ['Name', info.name ?? ''],
        ['Sector', info.sector ?? ''],
        ['Industry', info.industry ?? ''],
        ['Current Price', info.current_price?.toFixed(2) ?? ''],
        ['Market Cap', info.market_cap ?? ''],
        ['P/E Ratio', info.pe_ratio?.toFixed(2) ?? ''],
        ['Dividend Yield', info.dividend_yield ? (info.dividend_yield * 100).toFixed(2) + '%' : ''],
        ['52W High', info.week_52_high?.toFixed(2) ?? ''],
        ['52W Low', info.week_52_low?.toFixed(2) ?? ''],
        ['Total Return (1Y)', (analysisResult.performance.total_return * 100).toFixed(2) + '%'],
        ['Annualized Return', (analysisResult.performance.annualized_return * 100).toFixed(2) + '%'],
        ['Volatility', (analysisResult.performance.volatility * 100).toFixed(2) + '%'],
        ['Sharpe Ratio', analysisResult.performance.sharpe_ratio.toFixed(2)],
        ['Max Drawdown', (analysisResult.performance.max_drawdown * 100).toFixed(2) + '%'],
      ],
    );
  };

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
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
  }

  async function fetchAnalysis(symbol: string, currentPortfolio: Portfolio | null) {
    setSelectedTicker(symbol);
    setShowSearchDropdown(false);
    setApiError(null);
    setAnalysisResult(null);
    setAnalysisNarrative(null);
    setLoadingAnalysis(true);

    try {
      const endpoint = currentPortfolio ? `/market/ticker/${symbol}/fit` : `/market/ticker/${symbol}/analysis`;
      const options: RequestInit = currentPortfolio
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ holdings: currentPortfolio.holdings }),
          }
        : { method: 'GET' };

      const resp = await fetch(`http://localhost:8100${endpoint}`, options);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${resp.status}`);
      }

      const data: AgentResponse = await resp.json();
      if (!data.success) throw new Error(data.error ?? 'Analysis failed.');

      setAnalysisResult(data.result);
      setAnalysisNarrative(data.narrative);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setLoadingAnalysis(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Suggest mode handlers
  // ---------------------------------------------------------------------------

  function toggleSymbol(symbol: string) {
    setSelectedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  function toggleCategory(symbols: string[], checked: boolean) {
    setSelectedSymbols((prev) => {
      const next = new Set(prev);
      symbols.forEach((s) => (checked ? next.add(s) : next.delete(s)));
      return next;
    });
  }

  function addCustomTicker() {
    const tokens = customInput.split(/[\s,;]+/).map((t) => t.trim().toUpperCase()).filter((t) => /^[A-Z0-9.-]{1,10}$/.test(t));
    if (tokens.length === 0) return;
    setCustomTickers((prev) => Array.from(new Set([...prev, ...tokens])));
    setCustomInput('');
  }

  function removeCustomTicker(t: string) {
    setCustomTickers((prev) => prev.filter((c) => c !== t));
  }

  const portfolioSymbols = new Set((portfolio?.holdings ?? []).map((h) => h.ticker.toUpperCase()));
  const effectiveCandidates = [...selectedSymbols, ...customTickers].filter(
    (s) => !portfolioSymbols.has(s),
  );

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
        body: JSON.stringify({
          holdings: portfolio.holdings,
          candidates: effectiveCandidates,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${resp.status}`);
      }
      const data: SuggestResponse = await resp.json();
      setSuggestResults(data.suggestions);
      if (data.correlation_matrix) setSuggestMatrix(data.correlation_matrix);
      if (data.portfolio_ticker_metrics) setPortfolioMetrics(data.portfolio_ticker_metrics);

      // Fetch sector/name for portfolio holdings (for heatmap grouping)
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
          .catch(() => {/* silently ignore */});
      }
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setSuggestLoading(false);
    }
  }

  function investigateSuggestion(ticker: string) {
    setMode('investigate');
    fetchAnalysis(ticker, portfolio);
  }

  // ---------------------------------------------------------------------------
  // Sorted suggestions
  // ---------------------------------------------------------------------------

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

  // Look up the curated name for a ticker (used on result cards)
  const curatedNameMap = new Map(
    CURATED_CANDIDATES.flatMap((c) => c.tickers.map((t) => [t.symbol, t.name])),
  );

  // ---------------------------------------------------------------------------
  // Investigate mode renderers
  // ---------------------------------------------------------------------------

  function renderChart() {
    if (!analysisResult?.history?.bars || analysisResult.history.bars.length === 0) return null;
    const { bars } = analysisResult.history;

    // Normalize ticker to % return from first close
    const firstClose = bars[0].close;
    const tickerTrace: Partial<Plotly.ScatterData> = {
      type: 'scatter', mode: 'lines',
      name: selectedTicker ?? 'Ticker',
      x: bars.map((b) => b.date),
      y: bars.map((b) => ((b.close / firstClose) - 1) * 100),
      line: { color: '#34d399', width: 2 },
    };

    const traces: Partial<Plotly.ScatterData>[] = [tickerTrace];

    // Overlay portfolio series if available (already normalised to 1.0 at start)
    if (analysisResult.portfolio_series) {
      const portDates = Object.keys(analysisResult.portfolio_series).sort();
      traces.push({
        type: 'scatter', mode: 'lines',
        name: 'Portfolio',
        x: portDates,
        y: portDates.map((d) => (analysisResult.portfolio_series![d] - 1) * 100),
        line: { color: '#60a5fa', width: 2, dash: 'dot' },
      });
    }

    const hasPortfolio = !!analysisResult.portfolio_series;
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-stone-200 dark:border-gray-800">
        <h2 className="text-sm font-medium text-stone-600 dark:text-gray-300 mb-3 uppercase tracking-wide">
          {hasPortfolio ? '1-Year Return vs Portfolio' : '1-Year Price Return'}
        </h2>
        <Plot
          data={traces as Plotly.Data[]}
          layout={{
            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
            margin: { t: 10, r: 20, b: 40, l: 55 },
            xaxis: { color: axisColor, gridcolor },
            yaxis: { color: axisColor, gridcolor, ticksuffix: '%' },
            legend: { font: { color: fontColor }, bgcolor: 'transparent', x: 0, y: 1 },
            font: { color: fontColor }, autosize: true,
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%', height: 320 }}
          useResizeHandler
        />
      </div>
    );
  }

  function renderPortfolioFit() {
    if (!portfolio || !analysisResult?.portfolio_fit) return null;
    const { correlation, current_metrics, simulated_metrics } = analysisResult.portfolio_fit;
    const retChange = simulated_metrics.annualized_return - current_metrics.annualized_return;
    const volChange = simulated_metrics.volatility - current_metrics.volatility;
    const sharpeChange = simulated_metrics.sharpe_ratio - current_metrics.sharpe_ratio;

    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg p-5 border border-stone-200 dark:border-gray-800 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-stone-600 dark:text-gray-300 uppercase tracking-wide">
            Portfolio Fit (Assuming 5% Allocation)
          </h2>
          <p className="text-xs text-stone-500 dark:text-gray-400 mt-1">
            Simulated impact on your portfolio metrics if you allocated 5% weight to {selectedTicker}.
            This assumes a simple buy-and-hold linear blend over the trailing 1-year historical price data, with no complex rebalancing.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="bg-stone-50 dark:bg-gray-800 rounded-md p-4 flex-1">
            <p className="text-sm text-stone-500 dark:text-gray-400 flex items-center">
              Correlation to Portfolio
              <InfoPopover title="Correlation" content="A statistical measure of how this asset moves in relation to your existing portfolio. 1.0 means they move perfectly together, 0 means no relationship, and -1.0 means they move in opposite directions." wikiUrl="https://en.wikipedia.org/wiki/Correlation_(statistics)" />
            </p>
            <p className="text-2xl font-semibold text-stone-900 dark:text-white mt-1">{correlation.toFixed(2)}</p>
            <p className="text-xs text-stone-400 dark:text-gray-500 mt-1">1.0 = moves exactly together</p>
          </div>
          <div className="bg-stone-50 dark:bg-gray-800 rounded-md p-4 flex-1">
            <p className="text-sm text-stone-500 dark:text-gray-400 flex items-center">
              Simulated Ann. Return
              <InfoPopover title="Simulated Annualized Return" content="The hypothetical annualized return of your portfolio if a 5% allocation was made to this asset, proportionally reducing existing holdings. This simulation is based entirely on historical price data and is not a future projection." wikiUrl="https://en.wikipedia.org/wiki/Compound_annual_growth_rate" />
            </p>
            <p className="text-2xl font-semibold text-stone-900 dark:text-white mt-1">{pct(simulated_metrics.annualized_return)}</p>
            <p className={`text-xs mt-1 ${retChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {retChange >= 0 ? '+' : ''}{pct(retChange, 2)} vs current
            </p>
          </div>
          <div className="bg-stone-50 dark:bg-gray-800 rounded-md p-4 flex-1">
            <p className="text-sm text-stone-500 dark:text-gray-400 flex items-center">
              Simulated Volatility
              <InfoPopover title="Simulated Volatility" content="The hypothetical annualized standard deviation (risk) of your portfolio if a 5% allocation was made to this asset." wikiUrl="https://en.wikipedia.org/wiki/Volatility_(finance)" />
            </p>
            <p className="text-2xl font-semibold text-stone-900 dark:text-white mt-1">{pct(simulated_metrics.volatility)}</p>
            <p className={`text-xs mt-1 ${volChange < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {volChange >= 0 ? '+' : ''}{pct(volChange, 2)} vs current
            </p>
          </div>
          <div className="bg-stone-50 dark:bg-gray-800 rounded-md p-4 flex-1">
            <p className="text-sm text-stone-500 dark:text-gray-400 flex items-center">
              Simulated Sharpe
              <InfoPopover title="Simulated Sharpe Ratio" content="The hypothetical risk-adjusted return of your portfolio if a 5% allocation was made to this asset." wikiUrl="https://en.wikipedia.org/wiki/Sharpe_ratio" />
            </p>
            <p className="text-2xl font-semibold text-stone-900 dark:text-white mt-1">{fmt2(simulated_metrics.sharpe_ratio)}</p>
            <p className={`text-xs mt-1 ${sharpeChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {sharpeChange >= 0 ? '+' : ''}{fmt2(sharpeChange)} vs current
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-white mb-2">Investment Investigator</h1>
        <p className="text-stone-600 dark:text-gray-400">
          {mode === 'investigate'
            ? 'Deep-dive into individual securities with AI-assisted research and fundamental analysis.' + (portfolio ? ' Portfolio context is active — portfolio fit analysis will be included.' : '')
            : 'Score a candidate pool by diversification value — surface what your portfolio is missing.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">

        {/* ---- Left panel ---- */}
        <div className="space-y-4">

          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-stone-200 dark:border-gray-700">
            {(['investigate', 'suggest'] as InvestigatorMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={[
                  'flex-1 py-2 text-sm font-medium transition-colors capitalize',
                  mode === m
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-900 text-stone-500 dark:text-gray-400 hover:bg-stone-50 dark:hover:bg-gray-800',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Investigate mode: search card */}
          {mode === 'investigate' && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-5 border border-stone-200 dark:border-gray-800">
              <h2 className="text-sm font-medium text-stone-600 dark:text-gray-300 mb-3 uppercase tracking-wide">
                Search Asset
              </h2>
              <form onSubmit={handleSearch} className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ticker or company name..."
                  className="w-full bg-white dark:bg-gray-800 text-stone-900 dark:text-white border border-stone-300 dark:border-gray-700 rounded-md px-4 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="absolute right-2 top-2 bg-blue-600 text-white px-3 py-0.5 rounded text-sm hover:bg-blue-500 disabled:opacity-50"
                >
                  {isSearching ? '...' : 'Go'}
                </button>
                {showSearchDropdown && searchResults.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {searchResults.map((res) => (
                      <li
                        key={res.symbol}
                        onClick={() => fetchAnalysis(res.symbol, portfolio)}
                        className="px-4 py-2 hover:bg-stone-50 dark:hover:bg-gray-700 cursor-pointer text-stone-700 dark:text-gray-200"
                      >
                        <strong className="text-stone-900 dark:text-white">{res.symbol}</strong> — {res.name}
                      </li>
                    ))}
                  </ul>
                )}
              </form>
            </div>
          )}

          {/* Suggest mode: candidate pool panel */}
          {mode === 'suggest' && (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-stone-200 dark:border-gray-800 overflow-hidden">

              {/* No portfolio notice */}
              {!portfolio && (
                <div className="p-5 text-center space-y-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 mx-auto text-stone-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  <p className="text-sm text-stone-500 dark:text-gray-400">Load a portfolio first to find diversifiers.</p>
                </div>
              )}

              {portfolio && (
                <>
                  {/* Curated candidate pool */}
                  <div className="divide-y divide-stone-100 dark:divide-gray-800 max-h-[420px] overflow-y-auto">
                    {CURATED_CANDIDATES.map((cat) => {
                      const catSymbols = cat.tickers.map((t) => t.symbol);
                      const ownedInCat = catSymbols.filter((s) => portfolioSymbols.has(s));
                      const selectableCatSymbols = catSymbols.filter((s) => !portfolioSymbols.has(s));
                      const allCatSelected = selectableCatSymbols.every((s) => selectedSymbols.has(s));
                      const someCatSelected = selectableCatSymbols.some((s) => selectedSymbols.has(s));

                      return (
                        <details key={cat.category} open className="group">
                          <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer list-none bg-stone-50 dark:bg-gray-800/60 hover:bg-stone-100 dark:hover:bg-gray-800 select-none">
                            <div className="flex items-center gap-2">
                              <svg className="w-3 h-3 text-stone-400 dark:text-gray-500 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="text-xs font-semibold text-stone-600 dark:text-gray-300 uppercase tracking-wide">{cat.category}</span>
                              {ownedInCat.length > 0 && (
                                <span className="text-xs text-stone-400 dark:text-gray-500">({ownedInCat.length} owned)</span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); toggleCategory(selectableCatSymbols, !allCatSelected); }}
                              className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 shrink-0"
                            >
                              {allCatSelected && someCatSelected ? 'None' : 'All'}
                            </button>
                          </summary>
                          <div className="px-3 py-2 space-y-1">
                            {cat.tickers.map((t) => {
                              const isOwned = portfolioSymbols.has(t.symbol);
                              return (
                                <label
                                  key={t.symbol}
                                  className={[
                                    'flex items-center gap-2.5 px-1.5 py-1 rounded text-sm cursor-pointer',
                                    isOwned
                                      ? 'opacity-40 cursor-not-allowed'
                                      : 'hover:bg-stone-50 dark:hover:bg-gray-800',
                                  ].join(' ')}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isOwned ? false : selectedSymbols.has(t.symbol)}
                                    disabled={isOwned}
                                    onChange={() => !isOwned && toggleSymbol(t.symbol)}
                                    className="accent-blue-600 shrink-0"
                                  />
                                  <span className="font-semibold text-stone-800 dark:text-gray-200 w-12 shrink-0">{t.symbol}</span>
                                  <span className="text-stone-500 dark:text-gray-400 truncate">{t.name}</span>
                                  {isOwned && <span className="text-xs text-stone-400 dark:text-gray-600 ml-auto shrink-0">owned</span>}
                                </label>
                              );
                            })}
                          </div>
                        </details>
                      );
                    })}
                  </div>

                  {/* Custom ticker input */}
                  <div className="p-4 border-t border-stone-100 dark:border-gray-800 space-y-2">
                    <p className="text-xs font-medium text-stone-500 dark:text-gray-400 uppercase tracking-wide">Add Custom Tickers</p>
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
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {customTickers.map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 dark:bg-gray-800 border border-stone-200 dark:border-gray-700 text-xs font-semibold text-stone-700 dark:text-gray-200">
                            {t}
                            <button onClick={() => removeCustomTicker(t)} className="text-stone-400 hover:text-red-500 leading-none">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Run button */}
                  <div className="px-4 pb-4">
                    <button
                      onClick={runSuggest}
                      disabled={suggestLoading || effectiveCandidates.length === 0}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-md py-2.5 text-sm transition-colors"
                    >
                      {suggestLoading
                        ? 'Analysing…'
                        : `Find Diversifiers (${effectiveCandidates.length} candidates)`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ---- Right panel ---- */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* ---- Investigate mode results ---- */}
          {mode === 'investigate' && (
            <>
              {loadingAnalysis && (
                <div className="flex h-40 items-center justify-center bg-white dark:bg-gray-900 rounded-lg border border-stone-200 dark:border-gray-800">
                  <p className="text-blue-500 dark:text-blue-400 animate-pulse">Running analysis...</p>
                </div>
              )}

              {apiError && (
                <div className="bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-700 rounded-lg px-4 py-3 text-red-700 dark:text-red-300 text-sm">
                  {apiError}
                </div>
              )}

              {!loadingAnalysis && analysisResult && selectedTicker && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Info Header */}
                  <div className="bg-white dark:bg-gray-900 rounded-lg p-5 border border-stone-200 dark:border-gray-800">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-3xl font-bold text-stone-900 dark:text-white">
                          {selectedTicker} <span className="text-stone-400 dark:text-gray-500 text-xl font-normal ml-2">{analysisResult.info.name}</span>
                        </h2>
                        <p className="text-stone-500 dark:text-gray-400 mt-1">
                          {analysisResult.info.sector} • {analysisResult.info.industry}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-stone-900 dark:text-white">
                          ${analysisResult.info.current_price?.toFixed(2) ?? 'N/A'}
                        </p>
                        <p className="text-stone-500 dark:text-gray-400 mt-1">Current Price</p>
                        <div className="flex items-center gap-3 mt-2 ml-auto">
                          <button onClick={downloadTickerCSV} className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-gray-400 hover:text-stone-800 dark:hover:text-gray-200 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            CSV
                          </button>
                          <button onClick={() => exportInvestigatorHTML(analysisResult, selectedTicker!, analysisNarrative)} className="flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-gray-400 hover:text-stone-800 dark:hover:text-gray-200 border border-stone-200 dark:border-gray-700 rounded-md px-2.5 py-1 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Export HTML
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 border-t border-stone-100 dark:border-gray-800 pt-4">
                      <div>
                        <p className="text-xs text-stone-400 dark:text-gray-500 uppercase tracking-wide">Market Cap</p>
                        <p className="text-lg text-stone-900 dark:text-white font-medium">{formatCurrency(analysisResult.info.market_cap)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-400 dark:text-gray-500 uppercase tracking-wide">P/E Ratio</p>
                        <p className="text-lg text-stone-900 dark:text-white font-medium">{analysisResult.info.pe_ratio?.toFixed(2) ?? 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-400 dark:text-gray-500 uppercase tracking-wide">Dividend Yield</p>
                        <p className="text-lg text-stone-900 dark:text-white font-medium">
                          {analysisResult.info.dividend_yield ? pct(analysisResult.info.dividend_yield) : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-400 dark:text-gray-500 uppercase tracking-wide">52W Range</p>
                        <p className="text-lg text-stone-900 dark:text-white font-medium">
                          ${analysisResult.info.week_52_low?.toFixed(2) ?? '?'} – ${analysisResult.info.week_52_high?.toFixed(2) ?? '?'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {renderChart()}

                  <div className="flex flex-wrap gap-3">
                    <MetricCard label="1Y Return" value={pct(analysisResult.performance.total_return)} positive={analysisResult.performance.total_return >= 0} description="The overall gain or loss of the asset over the 1-year period." wikiUrl="https://en.wikipedia.org/wiki/Rate_of_return" />
                    <MetricCard label="Volatility" value={pct(analysisResult.performance.volatility)} positive={null} description="Annualised standard deviation of daily returns." wikiUrl="https://en.wikipedia.org/wiki/Volatility_(finance)" />
                    <MetricCard label="Sharpe Ratio" value={fmt2(analysisResult.performance.sharpe_ratio)} positive={analysisResult.performance.sharpe_ratio >= 0} description="Risk-adjusted return: excess return per unit of volatility." wikiUrl="https://en.wikipedia.org/wiki/Sharpe_ratio" />
                    <MetricCard label="Max Drawdown" value={pct(analysisResult.performance.max_drawdown)} positive={analysisResult.performance.max_drawdown >= 0} description="The largest peak-to-trough decline over the 1-year period." wikiUrl="https://en.wikipedia.org/wiki/Drawdown_(economics)" />
                  </div>

                  {renderPortfolioFit()}

                  {analysisNarrative && (
                    <NarrativeBlock narrative={analysisNarrative} title="AI Investment Critique" />
                  )}
                </div>
              )}

              {!loadingAnalysis && !analysisResult && !apiError && (
                <div className="flex flex-col items-center justify-center h-64 border border-dashed border-stone-300 dark:border-gray-700 rounded-lg text-stone-400 dark:text-gray-500 p-8 text-center bg-white dark:bg-gray-900/30">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-stone-300 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-5.197-5.197" />
                  </svg>
                  <p>Search for an asset to see detailed analysis.</p>
                </div>
              )}
            </>
          )}

          {/* ---- Suggest mode results ---- */}
          {mode === 'suggest' && (
            <div className="flex flex-col flex-1 gap-4 min-h-0">
              {suggestLoading && (
                <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-gray-900 rounded-lg border border-stone-200 dark:border-gray-800 gap-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
                  <p className="text-sm text-stone-500 dark:text-gray-400">Fetching data for {effectiveCandidates.length} candidates…</p>
                </div>
              )}

              {suggestError && (
                <div className="bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-700 rounded-lg px-4 py-3 text-red-700 dark:text-red-300 text-sm">
                  {suggestError}
                </div>
              )}

              {!suggestLoading && suggestResults && suggestResults.length === 0 && (
                <div className="flex flex-col items-center justify-center h-40 bg-white dark:bg-gray-900 rounded-lg border border-stone-200 dark:border-gray-800 text-stone-400 dark:text-gray-500 text-sm">
                  No valid results returned — check your candidate selection.
                </div>
              )}

              {!suggestLoading && sortedSuggestions.length > 0 && (() => {
                const scatterPoints: ScatterPoint[] = [
                  ...(portfolio?.holdings ?? [])
                    .filter((h) => portfolioMetrics?.[h.ticker.toUpperCase()] != null)
                    .map((h) => {
                      const t = h.ticker.toUpperCase();
                      const m = (portfolioMetrics as Record<string, PerformanceMetrics>)[t];
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
                  <div className="flex-1 min-h-0">
                    <RiskReturnScatter
                      points={scatterPoints}
                      isDark={isDark}
                      title="Risk / Return — Portfolio vs Candidates"
                      height="100%"
                    />
                  </div>
                );
              })()}

              {!suggestLoading && !suggestResults && !suggestError && (
                <div className="flex flex-col items-center justify-center h-64 border border-dashed border-stone-300 dark:border-gray-700 rounded-lg text-stone-400 dark:text-gray-500 p-8 text-center bg-white dark:bg-gray-900/30 space-y-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-stone-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  {!portfolio
                    ? <p>Load a portfolio to find diversifiers.</p>
                    : <p>Select candidates and run analysis to see suggestions ranked by diversification value.</p>}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Full-width heatmap */}
      {mode === 'suggest' && !suggestLoading && sortedSuggestions.length > 0 && suggestMatrix && (() => {
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

      {/* Full-width candidate cards */}
      {mode === 'suggest' && !suggestLoading && sortedSuggestions.length > 0 && (
        <div className="space-y-4">
          {/* Sort controls */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-stone-500 dark:text-gray-400">
              {sortedSuggestions.length} candidates ranked — lower correlation = stronger diversifier
            </p>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-stone-400 dark:text-gray-500 mr-1">Sort:</span>
              {([
                { key: 'correlation', label: 'Correlation' },
                { key: 'return',      label: '1Y Return'   },
                { key: 'sharpe',      label: 'Sharpe'      },
                { key: 'volatility',  label: 'Volatility'  },
              ] as { key: SuggestSort; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSuggestSort(key)}
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

          {/* Result cards — wider grid at full page width */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sortedSuggestions.map((s) => {
              const badge = correlationLabel(s.correlation);
              const displayName = s.info.name ?? curatedNameMap.get(s.ticker) ?? '—';
              return (
                <div
                  key={s.ticker}
                  className="bg-white dark:bg-gray-900 rounded-lg border border-stone-200 dark:border-gray-800 p-4 space-y-3 hover:border-stone-300 dark:hover:border-gray-700 transition-colors"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-lg font-bold text-stone-900 dark:text-white">{s.ticker}</span>
                      <p className="text-xs text-stone-500 dark:text-gray-400 truncate mt-0.5">{displayName}</p>
                      {(s.info.sector || s.info.industry) && (
                        <p className="text-xs text-stone-400 dark:text-gray-600 truncate">{s.info.sector ?? s.info.industry}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${badge.classes}`}>
                        {badge.label}
                      </span>
                      <p className="text-xs text-stone-400 dark:text-gray-500 mt-1">corr {s.correlation.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Stats row */}
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

                  {/* Investigate button */}
                  <button
                    onClick={() => investigateSuggestion(s.ticker)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 border border-blue-200 dark:border-blue-900 hover:border-blue-400 dark:hover:border-blue-700 rounded-md transition-colors"
                  >
                    Investigate
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
