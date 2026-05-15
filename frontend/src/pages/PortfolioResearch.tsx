import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import _Plot from 'react-plotly.js';
import MetricCard from '../components/MetricCard';
import InfoPopover from '../components/InfoPopover';
import NarrativeBlock from '../components/NarrativeBlock';
import AutocompleteInput from '../components/AutocompleteInput';
import type { AutocompleteResult } from '../components/AutocompleteInput';
import type { Portfolio } from '../utils/csv';
import { useAppContext } from '../context/AppContext';
import { useChartTheme } from '../hooks/useChartTheme';
import { downloadCSV } from '../utils/export';
import { exportInvestigatorHTML } from '../utils/exportHTML';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = (_Plot as any).default ?? _Plot;

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

export default function PortfolioResearch() {
  const {
    portfolio,
    investigatorSearchQuery: searchQuery,
    setInvestigatorSearchQuery: setSearchQuery,
    selectedTicker,
    setSelectedTicker,
    investigatorResult,
    setInvestigatorResult: setAnalysisResult,
    investigatorNarrative: analysisNarrative,
    setInvestigatorNarrative: setAnalysisNarrative,
    investigatorLoading: loadingAnalysis,
    setInvestigatorLoading: setLoadingAnalysis,
    investigatorApiError: apiError,
    setInvestigatorApiError: setApiError,
  } = useAppContext();

  const { fontColor, gridcolor, axisColor } = useChartTheme();
  const analysisResult = investigatorResult as TickerAnalysisResult | null;

  const [searchResults, setSearchResults] = useState<AutocompleteResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchParams] = useSearchParams();

  // Auto-trigger analysis from ?ticker= URL param on mount
  useEffect(() => {
    const ticker = searchParams.get('ticker');
    if (ticker) {
      setSearchQuery(ticker);
      fetchAnalysis(ticker, portfolio);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced autocomplete search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const resp = await fetch(
          `http://localhost:8100/market/search?q=${encodeURIComponent(searchQuery)}`
        );
        if (!resp.ok) throw new Error();
        const data: { symbol: string; name: string }[] = await resp.json();
        setSearchResults(data);
        setSearchOpen(data.length > 0);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  async function fetchAnalysis(symbol: string, currentPortfolio: Portfolio | null) {
    setSelectedTicker(symbol);
    setSearchOpen(false);
    setApiError(null);
    setAnalysisResult(null);
    setAnalysisNarrative(null);
    setLoadingAnalysis(true);
    try {
      const endpoint = currentPortfolio
        ? `/market/ticker/${symbol}/fit`
        : `/market/ticker/${symbol}/analysis`;
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

  function downloadTickerCSV() {
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
  }

  function renderChart() {
    if (!analysisResult?.history?.bars?.length) return null;
    const { bars } = analysisResult.history;
    const firstClose = bars[0].close;
    const traces: Partial<Plotly.ScatterData>[] = [
      {
        type: 'scatter',
        mode: 'lines',
        name: selectedTicker ?? 'Ticker',
        x: bars.map((b) => b.date),
        y: bars.map((b) => ((b.close / firstClose) - 1) * 100),
        line: { color: '#34d399', width: 2 },
      },
    ];
    if (analysisResult.portfolio_series) {
      const portDates = Object.keys(analysisResult.portfolio_series).sort();
      traces.push({
        type: 'scatter',
        mode: 'lines',
        name: 'Portfolio',
        x: portDates,
        y: portDates.map((d) => (analysisResult.portfolio_series![d] - 1) * 100),
        line: { color: '#60a5fa', width: 2, dash: 'dot' },
      });
    }
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-stone-200 dark:border-gray-800">
        <h2 className="text-sm font-medium text-stone-600 dark:text-gray-300 mb-3 uppercase tracking-wide">
          {analysisResult.portfolio_series ? '1-Year Return vs Portfolio' : '1-Year Price Return'}
        </h2>
        <Plot
          data={traces as Plotly.Data[]}
          layout={{
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            margin: { t: 10, r: 20, b: 40, l: 55 },
            xaxis: { color: axisColor, gridcolor },
            yaxis: { color: axisColor, gridcolor, ticksuffix: '%' },
            legend: { font: { color: fontColor }, bgcolor: 'transparent', x: 0, y: 1 },
            font: { color: fontColor },
            autosize: true,
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
            Simulated impact on your portfolio if you allocated 5% weight to {selectedTicker}.
            Based on trailing 1-year historical price data with no complex rebalancing.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="bg-stone-50 dark:bg-gray-800 rounded-md p-4 flex-1">
            <p className="text-sm text-stone-500 dark:text-gray-400 flex items-center">
              Correlation to Portfolio
              <InfoPopover
                title="Correlation"
                content="A statistical measure of how this asset moves in relation to your existing portfolio. 1.0 means they move perfectly together, 0 means no relationship, and -1.0 means they move in opposite directions."
                wikiUrl="https://en.wikipedia.org/wiki/Correlation_(statistics)"
              />
            </p>
            <p className="text-2xl font-semibold text-stone-900 dark:text-white mt-1">{correlation.toFixed(2)}</p>
            <p className="text-xs text-stone-400 dark:text-gray-500 mt-1">1.0 = moves exactly together</p>
          </div>
          <div className="bg-stone-50 dark:bg-gray-800 rounded-md p-4 flex-1">
            <p className="text-sm text-stone-500 dark:text-gray-400 flex items-center">
              Simulated Ann. Return
              <InfoPopover
                title="Simulated Annualized Return"
                content="The hypothetical annualized return of your portfolio if a 5% allocation was made to this asset, proportionally reducing existing holdings."
                wikiUrl="https://en.wikipedia.org/wiki/Compound_annual_growth_rate"
              />
            </p>
            <p className="text-2xl font-semibold text-stone-900 dark:text-white mt-1">{pct(simulated_metrics.annualized_return)}</p>
            <p className={`text-xs mt-1 ${retChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {retChange >= 0 ? '+' : ''}{pct(retChange, 2)} vs current
            </p>
          </div>
          <div className="bg-stone-50 dark:bg-gray-800 rounded-md p-4 flex-1">
            <p className="text-sm text-stone-500 dark:text-gray-400 flex items-center">
              Simulated Volatility
              <InfoPopover
                title="Simulated Volatility"
                content="The hypothetical annualized standard deviation (risk) of your portfolio if a 5% allocation was made to this asset."
                wikiUrl="https://en.wikipedia.org/wiki/Volatility_(finance)"
              />
            </p>
            <p className="text-2xl font-semibold text-stone-900 dark:text-white mt-1">{pct(simulated_metrics.volatility)}</p>
            <p className={`text-xs mt-1 ${volChange < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {volChange >= 0 ? '+' : ''}{pct(volChange, 2)} vs current
            </p>
          </div>
          <div className="bg-stone-50 dark:bg-gray-800 rounded-md p-4 flex-1">
            <p className="text-sm text-stone-500 dark:text-gray-400 flex items-center">
              Simulated Sharpe
              <InfoPopover
                title="Simulated Sharpe Ratio"
                content="The hypothetical risk-adjusted return of your portfolio if a 5% allocation was made to this asset."
                wikiUrl="https://en.wikipedia.org/wiki/Sharpe_ratio"
              />
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

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-white mb-2">Research</h1>
        <p className="text-stone-600 dark:text-gray-400">
          Deep-dive into individual securities with AI-assisted analysis and fundamental data.
          {portfolio ? ' Portfolio context active — fit analysis included.' : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left: search + quick facts */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-5 border border-stone-200 dark:border-gray-800">
            <h2 className="text-sm font-medium text-stone-600 dark:text-gray-300 mb-3 uppercase tracking-wide">
              Search Asset
            </h2>
            <AutocompleteInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSelect={(r) => fetchAnalysis(r.symbol, portfolio)}
              results={searchResults}
              loading={isSearching}
              open={searchOpen}
              onOpen={setSearchOpen}
              placeholder="Ticker or company name…"
            />
          </div>

          {selectedTicker && analysisResult && (
            <div className="bg-white dark:bg-gray-900 rounded-lg p-5 border border-stone-200 dark:border-gray-800 space-y-1">
              <p className="text-xs text-stone-500 dark:text-gray-400 uppercase tracking-wide mb-2">Quick Facts</p>
              <p className="text-xs text-stone-600 dark:text-gray-300">
                <span className="font-medium">Exchange:</span>{' '}
                {analysisResult.info.exchange ?? 'N/A'} · {analysisResult.info.currency ?? ''}
              </p>
              {analysisResult.info.description && (
                <p className="text-xs text-stone-500 dark:text-gray-400 leading-relaxed line-clamp-6 mt-2">
                  {analysisResult.info.description}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right: analysis results */}
        <div className="lg:col-span-2 space-y-6">
          {loadingAnalysis && (
            <div className="flex h-40 items-center justify-center bg-white dark:bg-gray-900 rounded-lg border border-stone-200 dark:border-gray-800">
              <p className="text-blue-500 dark:text-blue-400 animate-pulse">Running analysis…</p>
            </div>
          )}

          {apiError && (
            <div className="bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-700 rounded-lg px-4 py-3 text-red-700 dark:text-red-300 text-sm">
              {apiError}
            </div>
          )}

          {!loadingAnalysis && analysisResult && selectedTicker && (
            <div className="space-y-6 animate-fadeIn">
              {/* Info header */}
              <div className="bg-white dark:bg-gray-900 rounded-lg p-5 border border-stone-200 dark:border-gray-800">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-3xl font-bold text-stone-900 dark:text-white">
                      {selectedTicker}
                      <span className="text-stone-400 dark:text-gray-500 text-xl font-normal ml-2">
                        {analysisResult.info.name}
                      </span>
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
                      <button
                        onClick={downloadTickerCSV}
                        className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-gray-400 hover:text-stone-800 dark:hover:text-gray-200 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        CSV
                      </button>
                      <button
                        onClick={() => exportInvestigatorHTML(analysisResult, selectedTicker!, analysisNarrative)}
                        className="flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-gray-400 hover:text-stone-800 dark:hover:text-gray-200 border border-stone-200 dark:border-gray-700 rounded-md px-2.5 py-1 transition-colors"
                      >
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
        </div>
      </div>
    </div>
  );
}
