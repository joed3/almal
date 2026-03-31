import { useCallback, useRef, useState } from 'react';
import _Plot from 'react-plotly.js';
import MetricCard from '../components/MetricCard';

// react-plotly.js is CJS; in Vite dev the namespace object is returned instead
// of the component directly — unwrap .default if needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = (_Plot as any).default ?? _Plot;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Lot {
  ticker: string;
  shares: number;
  purchase_date: string | null;
  cost_basis: number | null;
}

interface Holding {
  ticker: string;
  lots: Lot[];
  total_shares: number;
  total_cost: number | null;
}

interface Portfolio {
  holdings: Holding[];
  uploaded_at: string;
}

interface PerformanceMetrics {
  total_return: number;
  annualized_return: number;
  volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
  alpha: number;
  beta: number;
  benchmark_total_return: number;
  benchmark_annualized_return: number;
}

interface HoldingWeight {
  ticker: string;
  market_value: number;
  weight: number;
}

interface ProfileResult {
  metrics: PerformanceMetrics;
  weights: HoldingWeight[];
  portfolio_series: Record<string, number>;
  benchmark_series: Record<string, number>;
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

const BENCHMARKS = ['SPY', 'QQQ', 'VTI', 'IWM', 'Custom…'];
type Horizon = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | 'Max';
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

// Parse CSV text into a Portfolio object (ticker, shares columns required).
function parseCSV(text: string): Portfolio {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have a header and at least one data row.');

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const tickerIdx = headers.findIndex((h) => h === 'ticker' || h === 'symbol');
  const sharesIdx = headers.findIndex((h) => h === 'shares' || h === 'quantity');

  if (tickerIdx === -1) throw new Error('CSV must have a "ticker" or "symbol" column.');
  if (sharesIdx === -1) throw new Error('CSV must have a "shares" or "quantity" column.');

  const holdingsMap: Record<string, number> = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (!cols[tickerIdx]) continue;
    const ticker = cols[tickerIdx].toUpperCase();
    const shares = parseFloat(cols[sharesIdx]);
    if (isNaN(shares)) continue;
    holdingsMap[ticker] = (holdingsMap[ticker] ?? 0) + shares;
  }

  const holdings: Holding[] = Object.entries(holdingsMap).map(([ticker, shares]) => ({
    ticker,
    lots: [{ ticker, shares, purchase_date: null, cost_basis: null }],
    total_shares: shares,
    total_cost: null,
  }));

  return {
    holdings,
    uploaded_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PortfolioProfiler() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [benchmark, setBenchmark] = useState<string>('SPY');
  const [customBenchmark, setCustomBenchmark] = useState<string>('');
  const [horizon, setHorizon] = useState<Horizon>('1Y');

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<ProfileResult | null>(null);

  const [weightSortAsc, setWeightSortAsc] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

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

    const effectiveBenchmark =
      benchmark === 'Custom…' ? customBenchmark.toUpperCase() : benchmark;

    const { start, end } = horizonDates(horizon);

    try {
      const resp = await fetch('http://localhost:8100/portfolio/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio,
          benchmark: effectiveBenchmark,
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
    const benchDates = Object.keys(r.benchmark_series).sort();

    const portTrace: Partial<Plotly.ScatterData> = {
      type: 'scatter',
      mode: 'lines',
      name: 'Portfolio',
      x: portDates,
      y: portDates.map((d) => ((r.portfolio_series[d] - 1) * 100)),
      line: { color: '#60a5fa', width: 2 },
    };

    const effectiveBenchmark =
      benchmark === 'Custom…' ? (customBenchmark || 'Benchmark') : benchmark;

    const benchTrace: Partial<Plotly.ScatterData> = {
      type: 'scatter',
      mode: 'lines',
      name: effectiveBenchmark,
      x: benchDates,
      y: benchDates.map((d) => ((r.benchmark_series[d] - 1) * 100)),
      line: { color: '#a3a3a3', width: 2 },
    };

    return [portTrace, benchTrace];
  }

  // ---- Sorted weights ------------------------------------------------------

  const sortedWeights = result
    ? [...result.weights].sort((a, b) =>
        weightSortAsc ? a.weight - b.weight : b.weight - a.weight,
      )
    : [];

  // ---- Render --------------------------------------------------------------

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-semibold text-white mb-2">Portfolio Profiler</h1>
        <p className="text-gray-400">
          Upload your holdings CSV, choose a benchmark and time horizon, then run
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
        {/* Benchmark selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 uppercase tracking-wide">Benchmark</label>
          <select
            value={benchmark}
            onChange={(e) => setBenchmark(e.target.value)}
            className="bg-gray-800 text-white border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {BENCHMARKS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {benchmark === 'Custom…' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 uppercase tracking-wide">
              Custom ticker
            </label>
            <input
              type="text"
              value={customBenchmark}
              onChange={(e) => setCustomBenchmark(e.target.value)}
              placeholder="e.g. BRK-B"
              className="bg-gray-800 text-white border border-gray-700 rounded-md px-3 py-2 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

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
            />
            <MetricCard
              label="Ann. Return"
              value={pct(result.metrics.annualized_return)}
              positive={result.metrics.annualized_return >= 0}
            />
            <MetricCard
              label="Volatility"
              value={pct(result.metrics.volatility)}
              positive={null}
            />
            <MetricCard
              label="Sharpe Ratio"
              value={fmt2(result.metrics.sharpe_ratio)}
              positive={result.metrics.sharpe_ratio >= 0}
            />
            <MetricCard
              label="Max Drawdown"
              value={pct(result.metrics.max_drawdown)}
              positive={result.metrics.max_drawdown >= 0}
            />
            <MetricCard
              label="Alpha"
              value={pct(result.metrics.alpha)}
              positive={result.metrics.alpha >= 0}
            />
            <MetricCard
              label="Beta"
              value={fmt2(result.metrics.beta)}
              positive={null}
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
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
                AI Analysis
              </p>
              <p className="text-slate-200 leading-relaxed">{result.narrative}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
