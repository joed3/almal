/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppContext } from '../context/AppContext';
import type { OptimizationStrategy } from '../context/AppContext';
import { parseCSV } from '../utils/csv';
import AllocationTable from '../components/AllocationTable';
import EfficientFrontierChart from '../components/EfficientFrontierChart';
import InfoPopover from '../components/InfoPopover';

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

export default function Optimizer() {
  const {
    portfolio, setPortfolio,
    optimizerCandidates: candidates, setOptimizerCandidates: setCandidates,
    optimizerPrincipal: principal, setOptimizerPrincipal: setPrincipal,
    optimizerStrategy: strategy, setOptimizerStrategy: setStrategy,
    optimizerRebalanceMode: rebalanceMode, setOptimizerRebalanceMode: setRebalanceMode,
    optimizerResult: result, setOptimizerResult: setResult,
  } = useAppContext();

  // UI local state
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search local state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const portfolioInputRef = useRef<HTMLInputElement>(null);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Direct add if it looks like a ticker list
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
    if (merged.length > 0) {
      setCandidates(merged);
    }
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

  const handlePortfolioFile = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseCSV(text);
        setPortfolio(parsed);
        setRebalanceMode(true);
      } catch (err: any) {
        setError(err.message || 'Failed to parse portfolio CSV.');
      }
    };
    reader.readAsText(file);
  };

  const runOptimization = async () => {
    const current_portfolio: Record<string, number> = {};
    const activeTickers = [...candidates];

    if (rebalanceMode && portfolio) {
      portfolio.holdings.forEach(h => {
        const ticker = h.ticker.toUpperCase();
        current_portfolio[ticker] = (current_portfolio[ticker] || 0) + h.total_shares;
        if (!activeTickers.includes(ticker)) {
          activeTickers.push(ticker);
        }
      });
    }

    if (activeTickers.length < 2) {
      setError("Please add or load at least 2 tickers to optimize.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('http://127.0.0.1:8100/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers: activeTickers,
          new_cash: principal,
          current_portfolio,
          strategy,
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

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white">Portfolio Optimizer</h1>
        <p className="text-gray-400 mt-2">
          Harness mathematical algorithms to compute the optimal weight distribution for a set of candidate investments based on your risk tolerance.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column: Configuration */}
        <div className="space-y-6">
          <div className="bg-gray-900 rounded-lg p-5 border border-gray-800 shadow-md">
            <h2 className="text-lg font-semibold text-white mb-4">Configuration</h2>

            <div className="space-y-4">

              {/* Portfolio Load Dropzone */}
              {!portfolio && (
                <div
                  className="border border-dashed border-gray-700 hover:border-blue-500 bg-gray-950 rounded-lg p-4 text-center cursor-pointer transition-colors"
                  onClick={() => portfolioInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    if (e.dataTransfer.files?.[0]) handlePortfolioFile(e.dataTransfer.files[0]);
                  }}
                >
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    ref={portfolioInputRef}
                    onChange={(e) => {
                      if (e.target.files?.[0]) handlePortfolioFile(e.target.files[0]);
                    }}
                  />
                  <p className="text-sm font-medium text-blue-400">Load Existing Portfolio</p>
                  <p className="text-xs text-gray-500 mt-1">Drag & drop CSV to enable Rebalance Mode</p>
                </div>
              )}

              {portfolio && (
                <div className="flex items-center justify-between gap-2 mb-4 p-3 bg-gray-950 border border-gray-700 rounded-md">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="rebalanceToggle"
                      checked={rebalanceMode}
                      onChange={(e) => setRebalanceMode(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                    />
                    <label htmlFor="rebalanceToggle" className="text-sm font-medium text-gray-300 cursor-pointer select-none">
                      Rebalance Mode (using loaded portfolio)
                    </label>
                  </div>
                  <button
                    onClick={() => { setPortfolio(null); setRebalanceMode(false); }}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Clear Loader
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  {rebalanceMode ? 'New Cash to Add ($)' : 'Principal Amount ($)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={principal}
                  onChange={(e) => setPrincipal(Number(e.target.value))}
                  className="w-full bg-gray-950 border border-gray-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Optimization Strategy</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as OptimizationStrategy)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="max_sharpe">Moderate (Max Sharpe)</option>
                  <option value="min_volatility">Conservative (Min Volatility)</option>
                  <option value="regularized_sharpe">Balanced (Regularized Max Sharpe)</option>
                  <option value="max_return">Aggressive (Max Return)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1 flex justify-between">
                  <span>Candidate Universe</span>
                  {portfolio && portfolio.holdings.length > 0 && (
                    <button
                      onClick={handleLoadFromPortfolio}
                      className="text-blue-400 hover:text-blue-300 text-xs font-semibold"
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
                    className="flex-1 bg-gray-950 border border-gray-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600"
                  />
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="bg-blue-600 hover:bg-blue-500 text-white rounded-md px-3 font-medium transition-colors disabled:opacity-50"
                  >
                    {isSearching ? '...' : 'Add'}
                  </button>

                  {showSearchDropdown && searchResults.length > 0 && (
                    <ul className="absolute top-11 z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {searchResults.map((res) => (
                        <li
                          key={res.symbol}
                          onClick={() => selectSearchResult(res.symbol)}
                          className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-gray-200 text-sm"
                        >
                          <strong className="text-white">{res.symbol}</strong> — {res.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </form>

                <div
                  className={`border-2 border-dashed rounded-md p-4 text-center transition-colors cursor-pointer ${
                    isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-500'
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
                  <p className="text-sm text-gray-400">Drag a CSV/TXT list of tickers here</p>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {candidates.map(ticker => (
                    <span
                      key={ticker}
                      className="inline-flex items-center px-2 py-1 rounded bg-gray-800 text-xs font-semibold text-gray-200 border border-gray-700"
                    >
                      {ticker}
                      <button
                        onClick={() => removeTicker(ticker)}
                        className="ml-1 text-gray-500 hover:text-red-400"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  {candidates.length === 0 && (
                    <span className="text-sm text-gray-600 italic">No candidates added.</span>
                  )}
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={runOptimization}
                  disabled={loading || (candidates.length < 2 && !rebalanceMode)}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-md py-3 transition-colors shadow-lg"
                >
                  {loading ? 'Solving...' : 'Run Optimization'}
                </button>
              </div>

            </div>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500/50 rounded-lg p-4 animate-fadeIn">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Right Column: Results Dashboard */}
        <div className="lg:col-span-2 space-y-6">
          {!result && !loading && (
             <div className="flex flex-col items-center justify-center h-full min-h-[400px] border-2 border-dashed border-gray-800 rounded-xl text-gray-500">
               <svg className="w-12 h-12 mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <div className="text-sm text-gray-400 mb-1 flex items-center gap-1">
                    Expected Annual Return
                    <InfoPopover
                      title="Expected Annual Return"
                      content="The anticipated annualized return based on the optimization model's inputs and historical data weighting techniques."
                      wikiUrl="https://en.wikipedia.org/wiki/Expected_return"
                    />
                  </div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {(result.result.metrics.expected_annual_return * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <div className="text-sm text-gray-400 mb-1 flex items-center gap-1">
                    Expected Volatility
                    <InfoPopover
                      title="Portfolio Volatility"
                      content="The annualized standard deviation of the portfolio, estimating future risk based on historical covariances."
                      wikiUrl="https://en.wikipedia.org/wiki/Volatility_(finance)"
                    />
                  </div>
                  <div className="text-2xl font-bold text-gray-100">
                    {(result.result.metrics.annual_volatility * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <div className="text-sm text-gray-400 mb-1 flex items-center gap-1">
                    Sharpe Ratio
                    <InfoPopover
                      title="Sharpe Ratio"
                      content="The risk-adjusted performance measure. Represents excess reward generated per unit of systemic volatility."
                      wikiUrl="https://en.wikipedia.org/wiki/Sharpe_ratio"
                    />
                  </div>
                  <div className="text-2xl font-bold text-blue-400">
                    {result.result.metrics.sharpe_ratio.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="order-2">
                <EfficientFrontierChart
                  curve={result.result.frontier_curve}
                  optimalMetrics={result.result.metrics}
                />
              </div>

              <div className="order-3">
                <AllocationTable
                  allocations={result.result.allocations}
                  leftoverCash={result.result.leftover_cash}
                />
              </div>

              {result.narrative && (
                <div className="order-4 bg-gray-800 rounded-lg p-6 border border-gray-700 shadow-xl mt-6">
                  <h2 className="text-xl font-bold text-white mb-4">AI Critic Review</h2>
                  <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-li:text-gray-300">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {result.narrative}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

      </div>
    </div>
  );
}
