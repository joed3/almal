import { useRef, useState } from 'react';
import _Plot from 'react-plotly.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MetricCard from '../components/MetricCard';

// react-plotly.js is CJS; in Vite dev the namespace object is returned instead
// of the component directly — unwrap .default if needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = (_Plot as any).default ?? _Plot;

// ---------------------------------------------------------------------------
// Types
import { parseCSV } from '../utils/csv';
import { useAppContext } from '../context/AppContext';
import type { Horizon } from '../context/AppContext';

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
}

interface ProfileResult {
  metrics: PerformanceMetrics;
  benchmarks: BenchmarkResult[];
  weights: HoldingWeight[];
  portfolio_series: Record<string, number>;
  narrative: string | null;
}

interface AgentResponse {
  intent: string;
  success: boolean;
  result: ProfileResult;
  narrative: string | null;
  error: string | null;
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
    case '1M':
      start = toISODate(new Date(today.getTime() - 30 * 86400000));
      break;
    case '3M':
      start = toISODate(new Date(today.getTime() - 90 * 86400000));
      break;
    case '6M':
      start = toISODate(new Date(today.getTime() - 180 * 86400000));
      break;
    case 'YTD':
      start = `${today.getFullYear()}-01-01`;
      break;
    case '1Y':
      start = toISODate(new Date(today.getTime() - 365 * 86400000));
      break;
    case '3Y':
      start = toISODate(new Date(today.getTime() - 1095 * 86400000));
      break;
    case 'Max':
      start = toISODate(new Date(today.getTime() - 1825 * 86400000));
      break;
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
  const context = useAppContext();
  const {
    portfolio, setPortfolio,
    profilerResult, setProfilerResult: setResult,
    selectedBenchmarks, setSelectedBenchmarks,
    horizon, setHorizon
  } = context;

  const result = profilerResult as ProfileResult | null;

  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Multi-benchmark state
  const [customInput, setCustomInput] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [weightSortAsc, setWeightSortAsc] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Benchmark chip helpers ----------------------------------------------

  function addBenchmark(ticker: string) {
    const upper = ticker.trim().toUpperCase();
    if (!upper) return;
    if (selectedBenchmarks.includes(upper)) return;
    setSelectedBenchmarks((prev) => [...prev, upper]);
  }

  function removeBenchmark(ticker: string) {
    if (selectedBenchmarks.length <= 1) return;
    setSelectedBenchmarks((prev) => prev.filter((b) => b !== ticker));
  }

  function handleAddCustom() {
    addBenchmark(customInput);
    setCustomInput('');
  }

  // ---- File handling -------------------------------------------------------

  function handleFile(file: File) {
    setParseError(null);
    setPortfolio(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseCSV(text);
        setPortfolio(parsed);
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
      if (!data.success) {
        throw new Error(data.error ?? 'Analysis failed.');
      }

      const profileResult = data.result;
      // Merge narrative from top-level AgentResponse if present.
      if (data.narrative && !profileResult.narrative) {
        profileResult.narrative = data.narrative;
      }
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
      type: 'scatter',
      mode: 'lines',
      name: 'Portfolio',
      x: portDates,
      y: portDates.map((d) => (r.portfolio_series[d] - 1) * 100),
      line: { color: '#60a5fa', width: 2 },
    };

    const benchTraces: Partial<Plotly.ScatterData>[] = r.benchmarks.map((bm, i) => {
      const bmDates = Object.keys(bm.series).sort();
      return {
        type: 'scatter',
        mode: 'lines',
        name: bm.ticker,
        x: bmDates,
        y: bmDates.map((d) => (bm.series[d] - 1) * 100),
        line: { color: BENCHMARK_COLORS[i % BENCHMARK_COLORS.length], width: 2 },
      };
    });

    return [portTrace, ...benchTraces];
  }

  // ---- Sorted weights ------------------------------------------------------

  const sortedWeights = result
    ? [...result.weights].sort((a, b) =>
        weightSortAsc ? a.weight - b.weight : b.weight - a.weight,
      )
    : [];

  // ---- Benchmark comparisons for metric cards ------------------------------

  function bmComparisons(
    getter: (bm: BenchmarkResult) => number,
    formatter: (v: number) => string,
    skipFirst = false,
  ) {
    if (!result) return undefined;
    const items = skipFirst ? result.benchmarks.slice(1) : result.benchmarks;
    return items.map((bm) => ({ ticker: bm.ticker, value: formatter(getter(bm)) }));
  }

  // ---- Render --------------------------------------------------------------

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-semibold text-white mb-2">Portfolio Profiler</h1>
        <p className="text-gray-400">
          Upload your holdings CSV, choose benchmarks and a time horizon, then run
          analysis to see performance metrics and an AI-generated critique.
        </p>
      </div>

      {/* Upload panel */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-blue-400 bg-blue-950/30'
            : 'border-gray-700 hover:border-gray-500 bg-gray-900/50',
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
            <p className="text-green-400 font-medium">
              {portfolio.holdings.length} holdings loaded
            </p>
            <p className="text-gray-400 text-sm">
              {portfolio.holdings.map((h) => h.ticker).join(', ')}
            </p>
            <p className="text-gray-500 text-xs mt-2">Click or drop to replace</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-gray-300">Drag &amp; drop a CSV file here, or click to browse</p>
            <p className="text-gray-500 text-sm">
              Required columns: <code className="text-gray-400">ticker</code> and{' '}
              <code className="text-gray-400">shares</code>
            </p>
          </div>
        )}
      </div>
      {parseError && <p className="text-red-400 text-sm -mt-4">{parseError}</p>}

      {/* Controls row */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Multi-benchmark selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 uppercase tracking-wide">Benchmarks</label>

          {/* Selected benchmark chips */}
          <div className="flex flex-wrap gap-1 mb-1">
            {selectedBenchmarks.map((bm) => (
              <span
                key={bm}
                className="inline-flex items-center gap-1 bg-gray-700 text-white text-xs px-2 py-1 rounded-full"
              >
                {bm}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeBenchmark(bm);
                  }}
                  disabled={selectedBenchmarks.length <= 1}
                  className="text-gray-400 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                  aria-label={`Remove ${bm}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          {/* Add from presets */}
          <div className="flex items-center gap-2">
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  addBenchmark(e.target.value);
                  e.target.value = '';
                }
              }}
              className="bg-gray-800 text-white border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="" disabled>
                Add preset…
              </option>
              {PRESET_BENCHMARKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            {/* Custom ticker input */}
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddCustom();
              }}
              placeholder="Custom ticker"
              className="bg-gray-800 text-white border border-gray-700 rounded-md px-3 py-2 text-sm w-28 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleAddCustom}
              className="px-3 py-2 rounded-md bg-gray-700 text-white text-sm hover:bg-gray-600 transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Horizon toggle */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 uppercase tracking-wide">Time Horizon</label>
          <div className="flex rounded-md overflow-hidden border border-gray-700">
            {HORIZONS.map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={[
                  'px-3 py-2 text-sm font-medium transition-colors',
                  horizon === h
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white',
                ].join(' ')}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        {/* Analyse button */}
        <button
          onClick={handleAnalyze}
          disabled={!portfolio || loading}
          className="px-5 py-2 rounded-md bg-blue-600 text-white font-medium text-sm hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Analysing…' : 'Analyse'}
        </button>
      </div>

      {/* API error */}
      {apiError && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {apiError}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-8">
          {/* Metrics cards */}
          <div className="flex flex-wrap gap-3">
            <MetricCard
              label="Total Return"
              value={pct(result.metrics.total_return)}
              positive={result.metrics.total_return >= 0}
              benchmarks={bmComparisons((bm) => bm.total_return, pct)}
              description="The overall gain or loss of the portfolio over the selected period, expressed as a percentage."
              wikiUrl="https://en.wikipedia.org/wiki/Rate_of_return"
            />
            <MetricCard
              label="Ann. Return"
              value={pct(result.metrics.annualized_return)}
              positive={result.metrics.annualized_return >= 0}
              benchmarks={bmComparisons((bm) => bm.annualized_return, pct)}
              description="Total return scaled to a one-year rate, enabling fair comparison across different time periods."
              wikiUrl="https://en.wikipedia.org/wiki/Compound_annual_growth_rate"
            />
            <MetricCard
              label="Volatility"
              value={pct(result.metrics.volatility)}
              positive={null}
              benchmarks={bmComparisons((bm) => bm.volatility, pct)}
              description="Annualised standard deviation of daily returns — measures how much the portfolio value fluctuates."
              wikiUrl="https://en.wikipedia.org/wiki/Volatility_(finance)"
            />
            <MetricCard
              label="Sharpe Ratio"
              value={fmt2(result.metrics.sharpe_ratio)}
              positive={result.metrics.sharpe_ratio >= 0}
              benchmarks={bmComparisons((bm) => bm.sharpe_ratio, fmt2)}
              description="Risk-adjusted return: excess return per unit of volatility. Higher values indicate better risk-adjusted performance."
              wikiUrl="https://en.wikipedia.org/wiki/Sharpe_ratio"
            />
            <MetricCard
              label="Max Drawdown"
              value={pct(result.metrics.max_drawdown)}
              positive={result.metrics.max_drawdown >= 0}
              benchmarks={bmComparisons((bm) => bm.max_drawdown, pct)}
              description="The largest peak-to-trough decline over the period. A measure of downside risk."
              wikiUrl="https://en.wikipedia.org/wiki/Drawdown_(economics)"
            />
            <MetricCard
              label="Alpha"
              value={result.benchmarks[0] ? pct(result.benchmarks[0].alpha) : 'N/A'}
              positive={result.benchmarks[0] ? result.benchmarks[0].alpha >= 0 : null}
              sublabel={result.benchmarks[0] ? `vs ${result.benchmarks[0].ticker}` : undefined}
              benchmarks={bmComparisons((bm) => bm.alpha, pct, true)}
              description="Excess return relative to the benchmark after adjusting for market risk. Positive alpha means outperformance."
              wikiUrl="https://en.wikipedia.org/wiki/Alpha_(finance)"
            />
            <MetricCard
              label="Beta"
              value={result.benchmarks[0] ? fmt2(result.benchmarks[0].beta) : 'N/A'}
              positive={null}
              sublabel={result.benchmarks[0] ? `vs ${result.benchmarks[0].ticker}` : undefined}
              benchmarks={bmComparisons((bm) => bm.beta, fmt2, true)}
              description="Sensitivity of the portfolio to benchmark movements. Beta > 1 means more volatile than the benchmark."
              wikiUrl="https://en.wikipedia.org/wiki/Beta_(finance)"
            />
          </div>

          {/* Line chart */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h2 className="text-sm font-medium text-gray-300 mb-3 uppercase tracking-wide">
              Cumulative Return
            </h2>
            <Plot
              data={buildChartData(result) as Plotly.Data[]}
              layout={{
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'transparent',
                margin: { t: 10, r: 20, b: 40, l: 50 },
                xaxis: {
                  color: '#9ca3af',
                  gridcolor: '#374151',
                  showgrid: true,
                },
                yaxis: {
                  color: '#9ca3af',
                  gridcolor: '#374151',
                  showgrid: true,
                  ticksuffix: '%',
                },
                legend: {
                  font: { color: '#d1d5db' },
                  bgcolor: 'transparent',
                  x: 0,
                  y: 1,
                },
                font: { color: '#d1d5db' },
                autosize: true,
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%', height: 320 }}
              useResizeHandler
            />
          </div>

          {/* Holdings weight table */}
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wide">
                Holdings Weights
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="px-4 py-2 font-medium">Ticker</th>
                  <th className="px-4 py-2 font-medium text-right">Market Value</th>
                  <th
                    className="px-4 py-2 font-medium text-right cursor-pointer select-none hover:text-white"
                    onClick={() => setWeightSortAsc((s) => !s)}
                  >
                    Weight {weightSortAsc ? '▲' : '▼'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedWeights.map((w) => (
                  <tr key={w.ticker} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-2 font-medium text-white">{w.ticker}</td>
                    <td className="px-4 py-2 text-right text-gray-300">
                      ${w.market_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-300">
                      {pct(w.weight)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Review narrative */}
          {result.narrative && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
                AI Analysis
              </p>
              <div className="prose-sm">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h2: ({ children }) => (
                      <h2 className="font-semibold text-slate-100">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="font-semibold text-slate-100">{children}</h3>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-slate-100">{children}</strong>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside space-y-1">{children}</ul>
                    ),
                    li: ({ children }) => (
                      <li className="text-slate-300">{children}</li>
                    ),
                    p: ({ children }) => (
                      <p className="text-slate-200">{children}</p>
                    ),
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        className="text-blue-400 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {children}
                      </a>
                    ),
                    table: ({ children }) => (
                      <table className="w-full text-sm border-collapse mt-2">{children}</table>
                    ),
                    th: ({ children }) => (
                      <th className="text-left px-3 py-2 text-slate-400 border-b border-slate-600 font-medium">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-2 text-slate-300 border-b border-slate-700">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {result.narrative}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
