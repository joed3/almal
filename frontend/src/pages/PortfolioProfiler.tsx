import { useState, useRef, useEffect } from 'react';
import _Plot from 'react-plotly.js';
import MetricCard from '../components/MetricCard';
import NarrativeBlock from '../components/NarrativeBlock';
import CorrelationHeatmap from '../components/CorrelationHeatmap';
import RiskReturnScatter from '../components/RiskReturnScatter';
import AutocompleteInput from '../components/AutocompleteInput';
import type { ScatterPoint } from '../components/RiskReturnScatter';
import { useAppContext } from '../context/AppContext';
import { useChartTheme } from '../hooks/useChartTheme';
import type { Horizon } from '../context/AppContext';
import { downloadCSV } from '../utils/export';
import { exportProfilerHTML } from '../utils/exportHTML';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = (_Plot as any).default ?? _Plot;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PerformanceMetrics {
  total_return: number;
  annualized_return: number;
  volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
}

interface BenchmarkResult {
  ticker: string;
  total_return: number;
  annualized_return: number;
  volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
  alpha: number;
  beta: number;
  series: Record<string, number>;
}

interface HoldingWeight {
  ticker: string;
  market_value: number;
  weight: number;
  sector?: string | null;
  name?: string | null;
}

interface ProfileResult {
  metrics: PerformanceMetrics;
  benchmarks: BenchmarkResult[];
  weights: HoldingWeight[];
  portfolio_series: Record<string, number>;
  narrative: string | null;
  correlation_matrix?: Record<string, Record<string, number>> | null;
  ticker_metrics?: Record<string, PerformanceMetrics> | null;
}

interface AgentResponse {
  intent: string;
  success: boolean;
  result: ProfileResult;
  narrative: string | null;
  error: string | null;
}

interface SearchResult {
  symbol: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESET_BENCHMARKS = ['SPY', 'QQQ', 'VTI', 'IWM'];
const BENCHMARK_COLORS = ['#a3a3a3', '#f59e0b', '#34d399', '#f87171', '#c084fc'];
const HORIZONS: Horizon[] = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', 'Max'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function horizonDates(h: Horizon): { start: string; end: string } {
  const today = new Date();
  const end = toISODate(today);
  let start: string;
  switch (h) {
    case '1M':  start = toISODate(new Date(today.getTime() - 30 * 86400000));   break;
    case '3M':  start = toISODate(new Date(today.getTime() - 90 * 86400000));   break;
    case '6M':  start = toISODate(new Date(today.getTime() - 180 * 86400000));  break;
    case 'YTD': start = `${today.getFullYear()}-01-01`;                          break;
    case '1Y':  start = toISODate(new Date(today.getTime() - 365 * 86400000));  break;
    case '3Y':  start = toISODate(new Date(today.getTime() - 1095 * 86400000)); break;
    case 'Max': start = toISODate(new Date(today.getTime() - 1825 * 86400000)); break;
  }
  return { start, end };
}

function pct(v: number, decimals = 2): string {
  return (v * 100).toFixed(decimals) + '%';
}

function fmt2(v: number): string {
  return v.toFixed(2);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PortfolioProfiler() {
  const {
    portfolio,
    profilerResult, setProfilerResult: setResult,
    selectedBenchmarks, setSelectedBenchmarks,
    horizon, setHorizon,
    profilerLoading: loading, setProfilerLoading: setLoading,
    profilerApiError: apiError, setProfilerApiError: setApiError,
  } = useAppContext();

  const { isDark, fontColor, gridcolor, axisColor } = useChartTheme();
  const result = profilerResult as ProfileResult | null;

  // Settings popover
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Heatmap collapse (collapsed by default)
  const [heatmapOpen, setHeatmapOpen] = useState(false);

  // Benchmark autocomplete
  const [bmQuery, setBmQuery] = useState('');
  const [bmResults, setBmResults] = useState<SearchResult[]>([]);
  const [bmSearching, setBmSearching] = useState(false);
  const [bmDropdown, setBmDropdown] = useState(false);

  // Table UI
  const [weightSortAsc, setWeightSortAsc] = useState(false);
  const [groupBySector, setGroupBySector] = useState(true);

  // Close settings popover on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Debounced benchmark search
  useEffect(() => {
    if (!bmQuery.trim()) {
      setBmResults([]);
      setBmDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setBmSearching(true);
      try {
        const resp = await fetch(
          `http://localhost:8100/market/search?q=${encodeURIComponent(bmQuery)}`
        );
        if (!resp.ok) throw new Error();
        const data: SearchResult[] = await resp.json();
        setBmResults(data);
        setBmDropdown(data.length > 0);
      } catch {
        setBmResults([]);
      } finally {
        setBmSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [bmQuery]);

  // ---- Benchmark helpers ---------------------------------------------------

  function addBenchmark(ticker: string) {
    const upper = ticker.trim().toUpperCase();
    if (!upper || selectedBenchmarks.includes(upper)) return;
    setSelectedBenchmarks((prev) => [...prev, upper]);
  }

  function removeBenchmark(ticker: string) {
    if (selectedBenchmarks.length <= 1) return;
    setSelectedBenchmarks((prev) => prev.filter((b) => b !== ticker));
  }

  function selectBenchmark(symbol: string) {
    addBenchmark(symbol);
    setBmQuery('');
    setBmResults([]);
    setBmDropdown(false);
  }

  // ---- Analysis ------------------------------------------------------------

  async function handleAnalyze() {
    if (!portfolio) return;
    setApiError(null);
    setResult(null);
    setLoading(true);
    const { start, end } = horizonDates(horizon);
    try {
      const resp = await fetch('http://localhost:8100/portfolio/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio,
          benchmarks: selectedBenchmarks,
          start_date: start,
          end_date: end,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${resp.status}`);
      }
      const data: AgentResponse = await resp.json();
      if (!data.success) throw new Error(data.error ?? 'Analysis failed.');
      const profileResult = data.result;
      if (data.narrative && !profileResult.narrative) profileResult.narrative = data.narrative;
      setResult(profileResult);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setLoading(false);
    }
  }

  // ---- Chart data ----------------------------------------------------------

  function buildChartData(r: ProfileResult) {
    const portDates = Object.keys(r.portfolio_series).sort();
    const portTrace: Partial<Plotly.ScatterData> = {
      type: 'scatter', mode: 'lines',
      name: 'Portfolio',
      x: portDates,
      y: portDates.map((d) => (r.portfolio_series[d] - 1) * 100),
      line: { color: '#60a5fa', width: 2 },
    };
    const benchTraces: Partial<Plotly.ScatterData>[] = r.benchmarks.map((bm, i) => {
      const bmDates = Object.keys(bm.series).sort();
      return {
        type: 'scatter', mode: 'lines',
        name: bm.ticker,
        x: bmDates,
        y: bmDates.map((d) => (bm.series[d] - 1) * 100),
        line: { color: BENCHMARK_COLORS[i % BENCHMARK_COLORS.length], width: 2 },
      };
    });
    return [portTrace, ...benchTraces];
  }

  // ---- Helpers -------------------------------------------------------------

  const sortedWeights = result
    ? [...result.weights].sort((a, b) => weightSortAsc ? a.weight - b.weight : b.weight - a.weight)
    : [];

  function bmComparisons(
    getter: (bm: BenchmarkResult) => number,
    formatter: (v: number) => string,
    skipFirst = false,
  ) {
    if (!result) return undefined;
    const items = skipFirst ? result.benchmarks.slice(1) : result.benchmarks;
    return items.map((bm) => ({ ticker: bm.ticker, value: formatter(getter(bm)) }));
  }

  const downloadProfileCSV = () => {
    if (!result) return;
    downloadCSV(
      'portfolio_profile.csv',
      ['Ticker', 'Market Value ($)', 'Weight (%)'],
      result.weights.map((w) => [w.ticker, w.market_value.toFixed(2), (w.weight * 100).toFixed(2)]),
    );
  };

  // ---- Render --------------------------------------------------------------

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-white mb-2">Dashboard</h1>
        <p className="text-stone-600 dark:text-gray-400">
          Analyse your portfolio against benchmarks and get an AI-generated performance critique.
        </p>
      </div>

      {/* Empty state */}
      {!portfolio && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-stone-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          <p className="text-stone-500 dark:text-gray-400 text-sm">
            Load your portfolio using the button below to get started.
          </p>
        </div>
      )}

      {/* Controls row */}
      {portfolio && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Horizon pills */}
          <div className="flex rounded-md overflow-hidden border border-stone-200 dark:border-gray-700">
            {HORIZONS.map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={[
                  'px-3 py-2 text-sm font-medium transition-colors',
                  horizon === h
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-stone-500 dark:text-gray-400 hover:bg-stone-50 dark:hover:bg-gray-700 hover:text-stone-900 dark:hover:text-white',
                ].join(' ')}
              >
                {h}
              </button>
            ))}
          </div>

          {/* Benchmark chips (read-only preview) */}
          <div className="flex flex-wrap gap-1.5">
            {selectedBenchmarks.map((bm) => (
              <span
                key={bm}
                className="inline-flex items-center gap-1 bg-stone-100 dark:bg-gray-700 border border-stone-200 dark:border-gray-600 text-stone-700 dark:text-gray-200 text-xs px-2 py-1 rounded-full"
              >
                {bm}
              </span>
            ))}
          </div>

          {/* Settings popover */}
          <div ref={settingsRef} className="relative ml-auto">
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              className={[
                'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border transition-colors',
                settingsOpen
                  ? 'bg-stone-100 dark:bg-gray-800 border-stone-300 dark:border-gray-600 text-stone-900 dark:text-white'
                  : 'bg-white dark:bg-gray-900 border-stone-200 dark:border-gray-700 text-stone-600 dark:text-gray-300 hover:border-stone-300 dark:hover:border-gray-600',
              ].join(' ')}
              aria-label="Benchmark settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Benchmarks
            </button>

            {settingsOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-white dark:bg-gray-900 border border-stone-200 dark:border-gray-700 rounded-lg shadow-lg p-4 space-y-4">
                <p className="text-xs font-medium text-stone-500 dark:text-gray-400 uppercase tracking-wide">
                  Benchmark Selection
                </p>

                {/* Active benchmark chips with remove */}
                <div className="flex flex-wrap gap-1.5">
                  {selectedBenchmarks.map((bm) => (
                    <span
                      key={bm}
                      className="inline-flex items-center gap-1 bg-stone-100 dark:bg-gray-700 border border-stone-200 dark:border-gray-600 text-stone-700 dark:text-gray-200 text-xs px-2 py-1 rounded-full"
                    >
                      {bm}
                      <button
                        onClick={() => removeBenchmark(bm)}
                        disabled={selectedBenchmarks.length <= 1}
                        className="text-stone-400 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                        aria-label={`Remove ${bm}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                {/* Preset quick-adds */}
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_BENCHMARKS.filter((b) => !selectedBenchmarks.includes(b)).map((b) => (
                    <button
                      key={b}
                      onClick={() => addBenchmark(b)}
                      className="px-2 py-1 rounded-full text-xs bg-stone-100 dark:bg-gray-800 border border-stone-200 dark:border-gray-700 text-stone-600 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      + {b}
                    </button>
                  ))}
                </div>

                {/* Autocomplete search */}
                <AutocompleteInput
                  value={bmQuery}
                  onChange={setBmQuery}
                  onSelect={(r) => selectBenchmark(r.symbol)}
                  results={bmResults}
                  loading={bmSearching}
                  open={bmDropdown}
                  onOpen={setBmDropdown}
                  placeholder="Search ticker or name…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const upper = bmQuery.trim().toUpperCase();
                      if (/^[A-Z0-9]{1,6}$/.test(upper)) {
                        selectBenchmark(upper);
                      } else if (bmResults.length > 0) {
                        selectBenchmark(bmResults[0].symbol);
                      }
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* Analyse button */}
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="px-5 py-2 rounded-md bg-blue-600 text-white font-medium text-sm hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Analysing…' : 'Analyse'}
          </button>
        </div>
      )}

      {/* API error */}
      {apiError && (
        <div className="bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-700 rounded-lg px-4 py-3 text-red-700 dark:text-red-300 text-sm">
          {apiError}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <div className="space-y-8">
          <div className="flex justify-end">
            <button
              onClick={() => exportProfilerHTML(result)}
              className="flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-gray-400 hover:text-stone-800 dark:hover:text-gray-200 border border-stone-200 dark:border-gray-700 rounded-md px-3 py-1.5 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export HTML
            </button>
          </div>

          {/* Metric cards */}
          <div className="flex flex-wrap gap-3">
            <MetricCard label="Total Return" value={pct(result.metrics.total_return)} positive={result.metrics.total_return >= 0} benchmarks={bmComparisons((bm) => bm.total_return, pct)} description="The overall gain or loss of the portfolio over the selected period." wikiUrl="https://en.wikipedia.org/wiki/Rate_of_return" />
            <MetricCard label="Ann. Return" value={pct(result.metrics.annualized_return)} positive={result.metrics.annualized_return >= 0} benchmarks={bmComparisons((bm) => bm.annualized_return, pct)} description="Total return scaled to a one-year rate, enabling fair comparison across different time periods." wikiUrl="https://en.wikipedia.org/wiki/Compound_annual_growth_rate" />
            <MetricCard label="Volatility" value={pct(result.metrics.volatility)} positive={null} benchmarks={bmComparisons((bm) => bm.volatility, pct)} description="Annualised standard deviation of daily returns — measures how much the portfolio value fluctuates." wikiUrl="https://en.wikipedia.org/wiki/Volatility_(finance)" />
            <MetricCard label="Sharpe Ratio" value={fmt2(result.metrics.sharpe_ratio)} positive={result.metrics.sharpe_ratio >= 0} benchmarks={bmComparisons((bm) => bm.sharpe_ratio, fmt2)} description="Risk-adjusted return: excess return per unit of volatility." wikiUrl="https://en.wikipedia.org/wiki/Sharpe_ratio" />
            <MetricCard label="Max Drawdown" value={pct(result.metrics.max_drawdown)} positive={result.metrics.max_drawdown >= 0} benchmarks={bmComparisons((bm) => bm.max_drawdown, pct)} description="The largest peak-to-trough decline over the period." wikiUrl="https://en.wikipedia.org/wiki/Drawdown_(economics)" />
            <MetricCard label="Alpha" value={result.benchmarks[0] ? pct(result.benchmarks[0].alpha) : 'N/A'} positive={result.benchmarks[0] ? result.benchmarks[0].alpha >= 0 : null} sublabel={result.benchmarks[0] ? `vs ${result.benchmarks[0].ticker}` : undefined} benchmarks={bmComparisons((bm) => bm.alpha, pct, true)} description="Excess return relative to the benchmark after adjusting for market risk." wikiUrl="https://en.wikipedia.org/wiki/Alpha_(finance)" />
            <MetricCard label="Beta" value={result.benchmarks[0] ? fmt2(result.benchmarks[0].beta) : 'N/A'} positive={null} sublabel={result.benchmarks[0] ? `vs ${result.benchmarks[0].ticker}` : undefined} benchmarks={bmComparisons((bm) => bm.beta, fmt2, true)} description="Sensitivity of the portfolio to benchmark movements." wikiUrl="https://en.wikipedia.org/wiki/Beta_(finance)" />
          </div>

          {/* Cumulative return chart */}
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-stone-200 dark:border-gray-800">
            <h2 className="text-sm font-medium text-stone-600 dark:text-gray-300 mb-3 uppercase tracking-wide">
              Cumulative Return
            </h2>
            <Plot
              data={buildChartData(result) as Plotly.Data[]}
              layout={{
                paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                margin: { t: 10, r: 20, b: 40, l: 50 },
                xaxis: { color: axisColor, gridcolor, showgrid: true },
                yaxis: { color: axisColor, gridcolor, showgrid: true, ticksuffix: '%' },
                legend: { font: { color: fontColor }, bgcolor: 'transparent', x: 0, y: 1 },
                font: { color: fontColor }, autosize: true,
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%', height: 320 }}
              useResizeHandler
            />
          </div>

          {/* Risk / Return scatter */}
          {result.ticker_metrics && (() => {
            const scatterPoints: ScatterPoint[] = result.weights
              .filter((w) => result.ticker_metrics![w.ticker] != null)
              .map((w) => ({
                ticker: w.ticker,
                volatility: result.ticker_metrics![w.ticker].volatility,
                annualized_return: result.ticker_metrics![w.ticker].annualized_return,
                sharpe_ratio: result.ticker_metrics![w.ticker].sharpe_ratio,
                sector: w.sector ?? null,
                weight: w.weight,
                isPortfolio: true,
              }));
            if (scatterPoints.length < 2) return null;
            return (
              <RiskReturnScatter
                points={scatterPoints}
                isDark={isDark}
                title="Risk / Return — Holdings"
                height={360}
              />
            );
          })()}

          {/* Holdings weight table */}
          <div className="bg-white dark:bg-gray-900 rounded-lg overflow-hidden border border-stone-200 dark:border-gray-800">
            <div className="px-4 py-3 border-b border-stone-200 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-medium text-stone-600 dark:text-gray-300 uppercase tracking-wide">
                Holdings Weights
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setGroupBySector((g) => !g)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${groupBySector ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' : 'bg-white dark:bg-gray-800 border-stone-200 dark:border-gray-700 text-stone-500 dark:text-gray-400 hover:text-stone-700 dark:hover:text-gray-200'}`}
                >
                  Group by Sector
                </button>
                <button
                  onClick={downloadProfileCSV}
                  className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-gray-400 hover:text-stone-800 dark:hover:text-gray-200 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  CSV
                </button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-stone-500 dark:text-gray-400 border-b border-stone-200 dark:border-gray-800">
                  <th className="px-4 py-2 font-medium">Ticker</th>
                  <th className="px-4 py-2 font-medium text-right">Market Value</th>
                  <th
                    className="px-4 py-2 font-medium text-right cursor-pointer select-none hover:text-stone-900 dark:hover:text-white"
                    onClick={() => !groupBySector && setWeightSortAsc((s) => !s)}
                  >
                    Weight {!groupBySector && (weightSortAsc ? '▲' : '▼')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupBySector ? (() => {
                  const hasSectorData = result.weights.some((w) => w.sector !== undefined);
                  if (!hasSectorData) {
                    return sortedWeights.map((w) => (
                      <tr key={w.ticker} className="border-b border-stone-100 dark:border-gray-800 hover:bg-stone-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-2 font-medium text-stone-900 dark:text-white">{w.ticker}</td>
                        <td className="px-4 py-2 text-right text-stone-600 dark:text-gray-300">${w.market_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-2 text-right text-stone-600 dark:text-gray-300">{pct(w.weight)}</td>
                      </tr>
                    ));
                  }
                  const sectorGroups: Record<string, HoldingWeight[]> = {};
                  for (const w of result.weights) {
                    const key = w.sector ?? 'ETF / Fund';
                    if (!sectorGroups[key]) sectorGroups[key] = [];
                    sectorGroups[key].push(w);
                  }
                  const sortedSectors = Object.entries(sectorGroups).sort(
                    ([, a], [, b]) => b.reduce((s, w) => s + w.weight, 0) - a.reduce((s, w) => s + w.weight, 0)
                  );
                  return sortedSectors.flatMap(([sector, holdings]) => {
                    const sectorWeight = holdings.reduce((s, w) => s + w.weight, 0);
                    const sectorValue = holdings.reduce((s, w) => s + w.market_value, 0);
                    return [
                      <tr key={`sector-${sector}`} className="bg-stone-50 dark:bg-gray-800/60 border-b border-stone-200 dark:border-gray-700">
                        <td className="px-4 py-2 font-semibold text-stone-700 dark:text-gray-200 text-xs uppercase tracking-wide">{sector}</td>
                        <td className="px-4 py-2 text-right text-xs font-semibold text-stone-600 dark:text-gray-300">${sectorValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-2 text-right text-xs font-semibold text-blue-600 dark:text-blue-400">{pct(sectorWeight)}</td>
                      </tr>,
                      ...holdings.sort((a, b) => b.weight - a.weight).map((w) => (
                        <tr key={w.ticker} className="border-b border-stone-100 dark:border-gray-800/60 hover:bg-stone-50 dark:hover:bg-gray-800/30">
                          <td className="pl-8 pr-4 py-2 text-stone-900 dark:text-white">
                            <span className="font-medium">{w.ticker}</span>
                            {w.name && <span className="ml-2 text-xs text-stone-400 dark:text-gray-500">{w.name}</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-stone-600 dark:text-gray-300">${w.market_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                          <td className="px-4 py-2 text-right text-stone-600 dark:text-gray-300">{pct(w.weight)}</td>
                        </tr>
                      )),
                    ];
                  });
                })() : sortedWeights.map((w) => (
                  <tr key={w.ticker} className="border-b border-stone-100 dark:border-gray-800 hover:bg-stone-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2 font-medium text-stone-900 dark:text-white">{w.ticker}</td>
                    <td className="px-4 py-2 text-right text-stone-600 dark:text-gray-300">${w.market_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-2 text-right text-stone-600 dark:text-gray-300">{pct(w.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Correlation heatmap — collapsible, collapsed by default */}
          {result.correlation_matrix && Object.keys(result.correlation_matrix).length >= 2 && (() => {
            const sectorMap: Record<string, string | null> = {};
            for (const w of result.weights) sectorMap[w.ticker] = w.sector ?? null;
            const holdingTickers = result.weights.map((w) => w.ticker);
            const heatH = Math.max(380, Math.min(620, holdingTickers.length * 22 + 100));
            return (
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-stone-200 dark:border-gray-800 overflow-hidden">
                <button
                  onClick={() => setHeatmapOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-stone-600 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-gray-800/50 transition-colors uppercase tracking-wide"
                >
                  Holdings Correlation
                  <svg
                    className={`w-4 h-4 text-stone-400 dark:text-gray-500 transition-transform ${heatmapOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {heatmapOpen && (
                  <div className="border-t border-stone-200 dark:border-gray-800">
                    <CorrelationHeatmap
                      matrix={result.correlation_matrix!}
                      tickers={holdingTickers}
                      sectorMap={sectorMap}
                      isDark={isDark}
                      title=""
                      height={heatH}
                    />
                  </div>
                )}
              </div>
            );
          })()}

          {/* AI narrative */}
          {result.narrative && <NarrativeBlock narrative={result.narrative} />}
        </div>
      )}
    </div>
  );
}
