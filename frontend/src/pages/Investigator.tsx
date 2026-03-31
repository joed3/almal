import { useRef, useState } from 'react';
import _Plot from 'react-plotly.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MetricCard from '../components/MetricCard';
import InfoPopover from '../components/InfoPopover';
import { parseCSV } from '../utils/csv';
import type { Portfolio } from '../utils/csv';
import { useAppContext } from '../context/AppContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = (_Plot as any).default ?? _Plot;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Investigator() {
  const context = useAppContext();
  const {
    portfolio, setPortfolio,
    investigatorSearchQuery: searchQuery, setInvestigatorSearchQuery: setSearchQuery,
    selectedTicker, setSelectedTicker,
    investigatorResult, setInvestigatorResult: setAnalysisResult,
    investigatorNarrative: analysisNarrative, setInvestigatorNarrative: setAnalysisNarrative
  } = context;

  const analysisResult = investigatorResult as TickerAnalysisResult | null;

  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Local Loading/Error state
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Portfolio File State
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Search Handling -----------------------------------------------------

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

  // ---- Data Fetching -------------------------------------------------------

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
      if (!data.success) {
        throw new Error(data.error ?? 'Analysis failed.');
      }

      setAnalysisResult(data.result);
      setAnalysisNarrative(data.narrative);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setLoadingAnalysis(false);
    }
  }

  // ---- File Handling -------------------------------------------------------

  function handleFile(file: File) {
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseCSV(text);
        setPortfolio(parsed);
        // Automatically rerun analysis if a ticker is already selected
        if (selectedTicker) {
          fetchAnalysis(selectedTicker, parsed);
        }
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse CSV.');
      }
    };
    reader.readAsText(file);
  }

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
  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // ---- Rendering Helpers ---------------------------------------------------

  function renderChart() {
    if (!analysisResult?.history?.bars || analysisResult.history.bars.length === 0) return null;
    const { bars } = analysisResult.history;
    const dates = bars.map((b) => b.date);
    const closes = bars.map((b) => b.close);

    return (
      <div className="bg-gray-900 rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-300 mb-3 uppercase tracking-wide">
          1-Year Price History
        </h2>
        <Plot
          data={[
            {
              type: 'scatter',
              mode: 'lines',
              name: 'Price',
              x: dates,
              y: closes,
              line: { color: '#34d399', width: 2 },
            },
          ]}
          layout={{
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            margin: { t: 10, r: 20, b: 40, l: 50 },
            xaxis: { color: '#9ca3af', gridcolor: '#374151' },
            yaxis: { color: '#9ca3af', gridcolor: '#374151', tickprefix: '$' },
            font: { color: '#d1d5db' },
            autosize: true,
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%', height: 320 }}
          useResizeHandler
        />
      </div>
    );
  }

  function renderNarrative() {
    if (!analysisNarrative) return null;
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
          AI Investment Critique
        </p>
        <div className="prose-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => <h2 className="font-semibold text-slate-100">{children}</h2>,
              h3: ({ children }) => <h3 className="font-semibold text-slate-100">{children}</h3>,
              strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
              ul: ({ children }) => <ul className="list-disc list-inside space-y-1">{children}</ul>,
              li: ({ children }) => <li className="text-slate-300">{children}</li>,
              p: ({ children }) => <p className="text-slate-200">{children}</p>,
            }}
          >
            {analysisNarrative}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  function renderPortfolioFit() {
    if (!portfolio || !analysisResult?.portfolio_fit) return null;
    const { correlation, current_metrics, simulated_metrics } = analysisResult.portfolio_fit;

    // Changes
    const retChange = simulated_metrics.annualized_return - current_metrics.annualized_return;
    const volChange = simulated_metrics.volatility - current_metrics.volatility;
    const sharpeChange = simulated_metrics.sharpe_ratio - current_metrics.sharpe_ratio;

    return (
      <div className="bg-gray-900 rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wide">
            Portfolio Fit (Assuming 5% Allocation)
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Simulated impact on your portfolio metrics if you allocated 5% weight to {selectedTicker}.
            This assumes a simple buy-and-hold linear blend over the trailing 1-year historical price data, with no complex rebalancing.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="bg-gray-800 rounded-md p-4 flex-1">
            <p className="text-sm text-gray-400 flex items-center">
              Correlation to Portfolio
              <InfoPopover
                title="Correlation"
                content="A statistical measure of how this asset moves in relation to your existing portfolio. 1.0 means they move perfectly together, 0 means no relationship, and -1.0 means they move in opposite directions."
                wikiUrl="https://en.wikipedia.org/wiki/Correlation_(statistics)"
              />
            </p>
            <p className="text-2xl font-semibold text-white mt-1">
              {correlation.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">1.0 = moves exactly together</p>
          </div>

          <div className="bg-gray-800 rounded-md p-4 flex-1">
            <p className="text-sm text-gray-400 flex items-center">
              Simulated Ann. Return
              <InfoPopover
                title="Simulated Annualized Return"
                content="The hypothetical annualized return of your portfolio if a 5% allocation was made to this asset, proportionally reducing existing holdings. This simulation is based entirely on historical price data and is not a future projection."
                wikiUrl="https://en.wikipedia.org/wiki/Compound_annual_growth_rate"
              />
            </p>
            <p className="text-2xl font-semibold text-white mt-1">
              {pct(simulated_metrics.annualized_return)}
            </p>
            <p className={`text-xs mt-1 ${retChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {retChange >= 0 ? '+' : ''}{pct(retChange, 2)} vs current
            </p>
          </div>

          <div className="bg-gray-800 rounded-md p-4 flex-1">
            <p className="text-sm text-gray-400 flex items-center">
              Simulated Volatility
              <InfoPopover
                title="Simulated Volatility"
                content="The hypothetical annualized standard deviation (risk) of your portfolio if a 5% allocation was made to this asset. Calculated using historical price data, not future projections."
                wikiUrl="https://en.wikipedia.org/wiki/Volatility_(finance)"
              />
            </p>
            <p className="text-2xl font-semibold text-white mt-1">
              {pct(simulated_metrics.volatility)}
            </p>
            <p className={`text-xs mt-1 ${volChange < 0 ? 'text-green-400' : 'text-red-400'}`}>
              {volChange >= 0 ? '+' : ''}{pct(volChange, 2)} vs current
            </p>
          </div>

          <div className="bg-gray-800 rounded-md p-4 flex-1">
            <p className="text-sm text-gray-400 flex items-center">
              Simulated Sharpe
              <InfoPopover
                title="Simulated Sharpe Ratio"
                content="The hypothetical risk-adjusted return (excess return per unit of volatility) of your portfolio if a 5% allocation was made to this asset. Calculated using historical price data, not future projections."
                wikiUrl="https://en.wikipedia.org/wiki/Sharpe_ratio"
              />
            </p>
            <p className="text-2xl font-semibold text-white mt-1">
              {fmt2(simulated_metrics.sharpe_ratio)}
            </p>
            <p className={`text-xs mt-1 ${sharpeChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {sharpeChange >= 0 ? '+' : ''}{fmt2(sharpeChange)} vs current
            </p>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Title & Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white mb-2">Investment Investigator</h1>
        <p className="text-gray-400">
          Deep-dive into individual securities with AI-assisted research and fundamental analysis.
          Optionally upload your portfolio to see how a new asset fits your strategy.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column: Controls (Search + Portfolio Upload) */}
        <div className="space-y-6">
          <div className="bg-gray-900 rounded-lg p-5">
            <h2 className="text-sm font-medium text-gray-300 mb-3 uppercase tracking-wide">
              Search Asset
            </h2>
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ticker or company name..."
                className="w-full bg-gray-800 text-white border border-gray-700 rounded-md px-4 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="absolute right-2 top-2 bg-blue-600 text-white px-3 py-0.5 rounded text-sm hover:bg-blue-500 disabled:opacity-50"
              >
                {isSearching ? '...' : 'Go'}
              </button>

              {showSearchDropdown && searchResults.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {searchResults.map((res) => (
                    <li
                      key={res.symbol}
                      onClick={() => fetchAnalysis(res.symbol, portfolio)}
                      className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-gray-200"
                    >
                      <strong className="text-white">{res.symbol}</strong> — {res.name}
                    </li>
                  ))}
                </ul>
              )}
            </form>
          </div>

          <div className="bg-gray-900 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wide">
              Portfolio Context (Optional)
            </h2>
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={[
                'border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors',
                isDragging
                  ? 'border-blue-400 bg-blue-950/30'
                  : 'border-gray-700 hover:border-gray-500 bg-gray-800/50',
              ].join(' ')}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={onFileInputChange}
              />
              {portfolio ? (
                <div className="space-y-1">
                  <p className="text-green-400 font-medium text-sm">
                    {portfolio.holdings.length} holdings loaded
                  </p>
                  <p className="text-gray-500 text-xs mt-1">Click or drop to replace</p>
                </div>
              ) : (
                <p className="text-gray-400 text-sm">Drag & drop CSV to enable portfolio fit</p>
              )}
            </div>
            {parseError && <p className="text-red-400 text-xs">{parseError}</p>}
          </div>
        </div>

        {/* Right Column: Analysis Dashboard */}
        <div className="lg:col-span-2 space-y-6">
          {loadingAnalysis && (
            <div className="flex h-40 items-center justify-center bg-gray-900 rounded-lg border border-gray-800">
              <p className="text-blue-400 animate-pulse">Running analysis...</p>
            </div>
          )}

          {apiError && (
             <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
               {apiError}
             </div>
          )}

          {!loadingAnalysis && analysisResult && selectedTicker && (
            <div className="space-y-6 animate-fadeIn">

              {/* Info Header */}
              <div className="bg-gray-900 rounded-lg p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-3xl font-bold text-white">
                      {selectedTicker} <span className="text-gray-500 text-xl font-normal ml-2">{analysisResult.info.name}</span>
                    </h2>
                    <p className="text-gray-400 mt-1">
                      {analysisResult.info.sector} • {analysisResult.info.industry}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-white">
                      ${analysisResult.info.current_price?.toFixed(2) ?? 'N/A'}
                    </p>
                    <p className="text-gray-400 mt-1">Current Price</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 border-t border-gray-800 pt-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Market Cap</p>
                    <p className="text-lg text-white font-medium">{formatCurrency(analysisResult.info.market_cap)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">P/E Ratio</p>
                    <p className="text-lg text-white font-medium">{analysisResult.info.pe_ratio?.toFixed(2) ?? 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Dividend Yield</p>
                    <p className="text-lg text-white font-medium">
                      {analysisResult.info.dividend_yield ? pct(analysisResult.info.dividend_yield) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">52W Range</p>
                    <p className="text-lg text-white font-medium">
                      ${analysisResult.info.week_52_low?.toFixed(2) ?? '?'} - ${analysisResult.info.week_52_high?.toFixed(2) ?? '?'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Price Chart */}
              {renderChart()}

              {/* Advanced Metrics */}
              <div className="flex flex-wrap gap-3">
                 <MetricCard
                   label="1Y Return"
                   value={pct(analysisResult.performance.total_return)}
                   positive={analysisResult.performance.total_return >= 0}
                   description="The overall gain or loss of the asset over the 1-year period."
                   wikiUrl="https://en.wikipedia.org/wiki/Rate_of_return"
                 />
                 <MetricCard
                   label="Volatility"
                   value={pct(analysisResult.performance.volatility)}
                   positive={null}
                   description="Annualised standard deviation of daily returns — measures how much the asset price fluctuates."
                   wikiUrl="https://en.wikipedia.org/wiki/Volatility_(finance)"
                 />
                 <MetricCard
                   label="Sharpe Ratio"
                   value={fmt2(analysisResult.performance.sharpe_ratio)}
                   positive={analysisResult.performance.sharpe_ratio >= 0}
                   description="Risk-adjusted return: excess return per unit of volatility."
                   wikiUrl="https://en.wikipedia.org/wiki/Sharpe_ratio"
                 />
                 <MetricCard
                   label="Max Drawdown"
                   value={pct(analysisResult.performance.max_drawdown)}
                   positive={analysisResult.performance.max_drawdown >= 0}
                   description="The largest peak-to-trough decline over the 1-year period."
                   wikiUrl="https://en.wikipedia.org/wiki/Drawdown_(economics)"
                 />
              </div>

              {/* Portfolio Fit */}
              {renderPortfolioFit()}

              {/* Narrative Critique */}
              {renderNarrative()}
            </div>
          )}

          {!loadingAnalysis && !analysisResult && !apiError && (
             <div className="flex flex-col items-center justify-center h-64 border border-dashed border-gray-700 rounded-lg text-gray-500 p-8 text-center bg-gray-900/30">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-5.197-5.197" />
               </svg>
               <p>Search for an asset to see detailed analysis.</p>
             </div>
          )}

        </div>
      </div>
    </div>
  );
}
