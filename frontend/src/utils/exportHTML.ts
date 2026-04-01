/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * HTML export utilities.
 *
 * Generates self-contained, interactive HTML reports. Charts use the Plotly CDN
 * and remain fully interactive (hover, zoom, pan). Narrative text is rendered via
 * marked.js. Styling uses Tailwind CDN. No server round-trip is required.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function downloadHTML(filename: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Safely embed arbitrary data as JSON in a <script type="application/json"> block. */
function jsonBlock(id: string, data: unknown): string {
  // Escape any </script> that could appear in data values
  const json = JSON.stringify(data).replace(/<\/script>/gi, '<\\/script>');
  return `<script type="application/json" id="${id}">${json}</script>`;
}

/** Parse a VERDICT line and return { verdict, body }. */
function parseNarrative(text: string): { verdict: string | null; body: string } {
  const lines = text.trim().split('\n');
  const match = lines[0].trim().match(/^VERDICT:\s*(.+)$/i);
  if (match) {
    return { verdict: match[1].trim(), body: lines.slice(1).join('\n').trim() };
  }
  return { verdict: null, body: text.trim() };
}

function verdictBadgeStyle(verdict: string): string {
  const upper = verdict.toUpperCase();
  if (upper === 'OUTPERFORMING' || upper === 'STRONG')
    return 'background:#d1fae5;color:#065f46;';
  if (upper === 'ON PAR' || upper === 'MODERATE')
    return 'background:#fef3c7;color:#92400e;';
  if (upper === 'WEAK')
    return 'background:#ffedd5;color:#9a3412;';
  if (upper === 'UNDERPERFORMING' || upper === 'AVOID')
    return 'background:#fee2e2;color:#991b1b;';
  return 'background:#f5f5f4;color:#44403c;';
}

/** Render a NarrativeBlock-equivalent HTML section. Markdown rendered client-side by marked. */
function narrativeSection(narrative: string | null | undefined, title = 'AI Analysis', id = 'narrative'): string {
  if (!narrative) return '';
  const { verdict, body } = parseNarrative(narrative);
  const verdictHTML = verdict
    ? `<span style="font-size:0.7rem;font-weight:600;padding:2px 8px;border-radius:9999px;${verdictBadgeStyle(verdict)}">${verdict}</span>`
    : '';
  return `
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-top:16px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:0.7rem;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${title}</span>
      ${verdictHTML}
    </div>
    <div id="${id}-body" class="prose-content" style="font-size:0.875rem;color:#374151;line-height:1.6;"></div>
    ${jsonBlock(`${id}-data`, body)}
    <script>
      (function() {
        var el = document.getElementById('${id}-body');
        var raw = JSON.parse(document.getElementById('${id}-data').textContent);
        el.innerHTML = marked.parse(raw);
      })();
    </script>
  </div>`;
}

/** Render a hoverable info icon with a tooltip (pure-CSS, no JS). */
function infoIcon(description: string, wikiUrl?: string): string {
  const link = wikiUrl
    ? `<a href="${wikiUrl}" target="_blank" rel="noopener noreferrer" style="color:#3b82f6;font-size:0.7rem;display:inline-block;margin-top:4px;">Learn more →</a>`
    : '';
  return `
  <span class="info-icon-wrap" style="position:relative;display:inline-flex;align-items:center;cursor:default;margin-left:4px;vertical-align:middle;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" style="flex-shrink:0;">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8" stroke-linecap="round"/>
      <line x1="12" y1="12" x2="12" y2="16" stroke-linecap="round"/>
    </svg>
    <span class="info-tooltip" style="
      position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);
      width:220px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;
      padding:8px 10px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:100;
      font-size:0.72rem;color:#374151;line-height:1.5;font-weight:400;
      text-transform:none;letter-spacing:normal;white-space:normal;">
      ${description}${link}
    </span>
  </span>`;
}

interface MetricCardOptions {
  color?: string;
  sublabel?: string;
  description?: string;
  wikiUrl?: string;
  benchmarks?: Array<{ ticker: string; value: string }>;
}

function metricCard(label: string, value: string, opts: MetricCardOptions = {}): string {
  const { color = '#111827', sublabel, description, wikiUrl, benchmarks } = opts;
  const icon = description ? infoIcon(description, wikiUrl) : '';
  const sublabelHTML = sublabel
    ? `<div style="font-size:0.7rem;color:#9ca3af;margin-top:-2px;">${sublabel}</div>`
    : '';
  const benchmarkRows = benchmarks?.length
    ? `<div style="margin-top:6px;border-top:1px solid #f3f4f6;padding-top:6px;">
        ${benchmarks.map(b => `<div style="display:flex;justify-content:space-between;font-size:0.7rem;color:#6b7280;">
          <span>${b.ticker}</span><span>${b.value}</span>
        </div>`).join('')}
      </div>`
    : '';
  return `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;flex:1;min-width:140px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <span style="font-size:0.75rem;color:#6b7280;">${label}</span>${icon}
    </div>
    <div style="font-size:1.5rem;font-weight:700;color:${color};">${value}</div>
    ${sublabelHTML}${benchmarkRows}
  </div>`;
}

function statsRow(label: string, portfolio: string, benchmark: string): string {
  return `
  <tr>
    <td style="padding:8px 0;color:#6b7280;font-size:0.875rem;">${label}</td>
    <td style="padding:8px 0;text-align:right;font-weight:600;color:#111827;font-size:0.875rem;">${portfolio}</td>
    <td style="padding:8px 0;text-align:right;color:#6b7280;font-size:0.875rem;">${benchmark}</td>
  </tr>`;
}

/** Shell of a full self-contained HTML page. bodyContent is inserted into <body>. */
function pageShell(title: string, bodyContent: string, extraScripts = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Almal</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    body { font-family: inter, ui-sans-serif, system-ui, sans-serif; background: #f9fafb; color: #111827; }
    .prose-content h1, .prose-content h2, .prose-content h3 { font-weight: 600; margin: 12px 0 4px; color: #111827; }
    .prose-content p { margin: 6px 0; }
    .prose-content ul { list-style: disc; padding-left: 20px; margin: 6px 0; }
    .prose-content li { margin: 3px 0; }
    .prose-content strong { font-weight: 600; color: #111827; }
    table { border-collapse: collapse; }
    .info-icon-wrap:hover svg { stroke: #374151; }
    .info-tooltip { visibility: hidden; opacity: 0; pointer-events: none; transition: opacity 0.15s; }
    .info-icon-wrap:hover .info-tooltip { visibility: visible; opacity: 1; pointer-events: auto; }
  </style>
  ${extraScripts}
</head>
<body>
  <div style="max-width:1000px;margin:0 auto;padding:40px 24px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid #e5e7eb;">
      <span style="font-size:1.1rem;font-weight:700;color:#111827;letter-spacing:-0.02em;">Almal</span>
      <span style="font-size:0.75rem;color:#9ca3af;">Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
    </div>
    ${bodyContent}
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Optimizer export
// ---------------------------------------------------------------------------

export function exportOptimizerHTML(result: any, backtestData: any | null): void {
  const metrics = result.result.metrics;
  const allocations: any[] = result.result.allocations;
  const frontier: any[] = result.result.frontier_curve;
  const strategy: string = result.result.strategy;
  const leftover: number = result.result.leftover_cash;

  // Efficient frontier chart data
  const sortedFrontier = [...frontier].sort((a, b) => a.volatility - b.volatility);
  const fVols = sortedFrontier.map((p: any) => p.volatility * 100);
  const fRets = sortedFrontier.map((p: any) => (p.return ?? p.return_ ?? 0) * 100);

  const frontierTraces = [
    { x: fVols, y: fRets, type: 'scatter', mode: 'lines', name: 'Efficient Frontier', line: { color: '#3b82f6', width: 3 } },
    { x: [metrics.annual_volatility * 100], y: [metrics.expected_annual_return * 100], type: 'scatter', mode: 'markers', name: 'Optimal Portfolio', marker: { color: '#10b981', size: 12, symbol: 'star' } },
  ];
  const frontierLayout = {
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 10, r: 10, b: 40, l: 45 },
    font: { family: 'inter, sans-serif', color: '#374151' },
    xaxis: { title: { text: 'Volatility (Risk) %' }, gridcolor: '#e5e7eb', zerolinecolor: '#e5e7eb' },
    yaxis: { title: { text: 'Expected Return %' }, gridcolor: '#e5e7eb', zerolinecolor: '#e5e7eb' },
    showlegend: true, legend: { orientation: 'h', y: 1.1 },
  };

  // Allocation table rows
  const allocRows = allocations.map(a => `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 0;font-weight:600;color:#111827;">${a.ticker}</td>
      <td style="padding:10px 8px;text-align:right;color:#2563eb;">${(a.weight * 100).toFixed(2)}%</td>
      <td style="padding:10px 8px;text-align:right;color:#6b7280;">${Number(a.current_shares).toLocaleString()}</td>
      <td style="padding:10px 8px;text-align:right;font-weight:500;">${Number(a.target_shares).toLocaleString()}</td>
      <td style="padding:10px 8px;text-align:right;font-weight:600;color:${a.shares_delta > 0 ? '#059669' : a.shares_delta < 0 ? '#d97706' : '#9ca3af'};">
        ${a.shares_delta > 0 ? '+' : ''}${Number(a.shares_delta).toLocaleString()}
      </td>
      <td style="padding:10px 0;text-align:right;color:#374151;">$${Number(a.target_dollars).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>`).join('');

  // Backtest section
  let backtestHTML = '';
  if (backtestData?.result) {
    const bt = backtestData.result;
    const btTraces = [
      { x: bt.dates, y: bt.portfolio_cumulative.map((v: number) => (v - 1) * 100), type: 'scatter', mode: 'lines', name: 'Portfolio', line: { color: '#3b82f6', width: 2 } },
      { x: bt.dates, y: bt.benchmark_cumulative.map((v: number) => (v - 1) * 100), type: 'scatter', mode: 'lines', name: bt.benchmark, line: { color: '#9ca3af', width: 2, dash: 'dot' } },
    ];
    const btLayout = {
      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
      margin: { t: 10, r: 10, b: 40, l: 55 },
      font: { family: 'inter, sans-serif', color: '#374151' },
      xaxis: { gridcolor: '#e5e7eb', zerolinecolor: '#e5e7eb' },
      yaxis: { title: { text: 'Cumulative Return %' }, ticksuffix: '%', gridcolor: '#e5e7eb', zerolinecolor: '#e5e7eb' },
      showlegend: true, legend: { orientation: 'h', y: 1.1 },
    };
    const s = bt.stats;
    const bs = bt.benchmark_stats;
    backtestHTML = `
    <div style="margin-top:32px;">
      <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:16px;">Historical Backtest (${bt.lookback_years}Y vs ${bt.benchmark})</h2>
      ${jsonBlock('bt-traces', btTraces)}
      ${jsonBlock('bt-layout', btLayout)}
      <div id="bt-chart" style="height:280px;"></div>
      <script>
        (function() {
          var traces = JSON.parse(document.getElementById('bt-traces').textContent);
          var layout = JSON.parse(document.getElementById('bt-layout').textContent);
          Plotly.newPlot('bt-chart', traces, layout, { responsive: true, displayModeBar: false });
        })();
      </script>
      <div style="margin-top:20px;">
        <table style="width:100%;font-size:0.875rem;">
          <thead>
            <tr style="border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:0.75rem;font-weight:500;">
              <th style="text-align:left;padding:8px 0;">Metric</th>
              <th style="text-align:right;padding:8px 0;">Portfolio</th>
              <th style="text-align:right;padding:8px 0;">${bt.benchmark}</th>
            </tr>
          </thead>
          <tbody>
            ${statsRow('Total Return', (s.total_return * 100).toFixed(2) + '%', (bs.total_return * 100).toFixed(2) + '%')}
            ${statsRow('Ann. Return', (s.annualized_return * 100).toFixed(2) + '%', (bs.annualized_return * 100).toFixed(2) + '%')}
            ${statsRow('Ann. Volatility', (s.annual_volatility * 100).toFixed(2) + '%', (bs.annual_volatility * 100).toFixed(2) + '%')}
            ${statsRow('Sharpe Ratio', s.sharpe_ratio.toFixed(2), bs.sharpe_ratio.toFixed(2))}
            ${statsRow('Max Drawdown', (s.max_drawdown * 100).toFixed(2) + '%', (bs.max_drawdown * 100).toFixed(2) + '%')}
            ${statsRow('Calmar Ratio', s.calmar_ratio.toFixed(2), bs.calmar_ratio.toFixed(2))}
          </tbody>
        </table>
      </div>
      ${narrativeSection(backtestData.narrative, 'Backtest Note', 'bt-narrative')}
    </div>`;
  }

  const strategyLabel: Record<string, string> = {
    max_sharpe: 'Max Sharpe', min_volatility: 'Min Volatility',
    regularized_sharpe: 'Regularized Max Sharpe', max_return: 'Max Return',
  };

  const body = `
  <h1 style="font-size:1.75rem;font-weight:800;margin-bottom:4px;letter-spacing:-0.03em;">Portfolio Optimization</h1>
  <p style="color:#6b7280;margin-bottom:24px;">Strategy: ${strategyLabel[strategy] ?? strategy}</p>

  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
    ${metricCard('Expected Annual Return', (metrics.expected_annual_return * 100).toFixed(2) + '%', {
      color: '#059669',
      description: 'The anticipated annualized return based on the optimization model\'s inputs and historical data weighting techniques.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Expected_return',
    })}
    ${metricCard('Expected Volatility', (metrics.annual_volatility * 100).toFixed(2) + '%', {
      description: 'The annualized standard deviation of the portfolio, estimating future risk based on historical covariances.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Volatility_(finance)',
    })}
    ${metricCard('Sharpe Ratio', metrics.sharpe_ratio.toFixed(2), {
      color: '#2563eb',
      description: 'The risk-adjusted performance measure. Represents excess reward generated per unit of systemic volatility.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Sharpe_ratio',
    })}
  </div>

  <div style="margin-bottom:24px;">
    <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:12px;">Efficient Frontier</h2>
    ${jsonBlock('ef-traces', frontierTraces)}
    ${jsonBlock('ef-layout', frontierLayout)}
    <div id="ef-chart" style="height:300px;"></div>
    <script>
      (function() {
        var traces = JSON.parse(document.getElementById('ef-traces').textContent);
        var layout = JSON.parse(document.getElementById('ef-layout').textContent);
        Plotly.newPlot('ef-chart', traces, layout, { responsive: true, displayModeBar: false });
      })();
    </script>
  </div>

  <div>
    <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:12px;">Recommended Allocation</h2>
    <table style="width:100%;">
      <thead>
        <tr style="border-bottom:2px solid #e5e7eb;font-size:0.75rem;color:#6b7280;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">
          <th style="text-align:left;padding:8px 0;">Ticker</th>
          <th style="text-align:right;padding:8px;">Target Weight</th>
          <th style="text-align:right;padding:8px;">Current Shares</th>
          <th style="text-align:right;padding:8px;">Target Shares</th>
          <th style="text-align:right;padding:8px;">Delta</th>
          <th style="text-align:right;padding:8px 0;">Capital</th>
        </tr>
      </thead>
      <tbody>${allocRows}</tbody>
      <tfoot>
        <tr style="border-top:2px solid #e5e7eb;">
          <td style="padding:10px 0;color:#6b7280;font-weight:600;" colspan="5">Unallocated Cash</td>
          <td style="padding:10px 0;text-align:right;font-weight:600;">$${leftover.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  ${narrativeSection(result.narrative, 'AI Critic Review', 'opt-narrative')}
  ${backtestHTML}`;

  downloadHTML('optimization_report.html', pageShell('Optimization Report', body));
}

// ---------------------------------------------------------------------------
// Profiler export
// ---------------------------------------------------------------------------

export function exportProfilerHTML(result: any): void {
  const metrics = result.metrics;
  const benchmarks: any[] = result.benchmarks ?? [];
  const weights: any[] = result.weights ?? [];
  const portfolioSeries: Record<string, number> = result.portfolio_series ?? {};

  const portDates = Object.keys(portfolioSeries).sort();
  const portValues = portDates.map(d => portfolioSeries[d]);

  // Normalise to % return from start
  const base = portValues[0] ?? 1;
  const portPct = portValues.map(v => ((v / base) - 1) * 100);

  const benchmarkColors = ['#a3a3a3', '#f59e0b', '#34d399', '#f87171', '#c084fc'];
  const traces: any[] = [
    { x: portDates, y: portPct, type: 'scatter', mode: 'lines', name: 'Portfolio', line: { color: '#3b82f6', width: 2.5 } },
    ...benchmarks.map((bm, i) => {
      const bmDates = Object.keys(bm.series).sort();
      const bmValues = bmDates.map(d => bm.series[d]);
      const bmBase = bmValues[0] ?? 1;
      return {
        x: bmDates, y: bmValues.map(v => ((v / bmBase) - 1) * 100),
        type: 'scatter', mode: 'lines', name: bm.ticker,
        line: { color: benchmarkColors[i % benchmarkColors.length], width: 1.5, dash: 'dot' },
      };
    }),
  ];
  const chartLayout = {
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 10, r: 10, b: 40, l: 55 },
    font: { family: 'inter, sans-serif', color: '#374151' },
    xaxis: { gridcolor: '#e5e7eb', zerolinecolor: '#e5e7eb' },
    yaxis: { title: { text: 'Return %' }, ticksuffix: '%', gridcolor: '#e5e7eb', zerolinecolor: '#e5e7eb' },
    showlegend: true, legend: { orientation: 'h', y: 1.12 },
  };

  const bm0 = benchmarks[0];
  const holdingsRows = weights.map(w => `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 0;font-weight:600;color:#111827;">${w.ticker}</td>
      <td style="padding:10px 8px;text-align:right;color:#6b7280;">$${Number(w.market_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
      <td style="padding:10px 0;text-align:right;">${(w.weight * 100).toFixed(2)}%</td>
    </tr>`).join('');

  const body = `
  <h1 style="font-size:1.75rem;font-weight:800;margin-bottom:24px;letter-spacing:-0.03em;">Portfolio Performance Report</h1>

  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
    ${metricCard('Total Return', (metrics.total_return * 100).toFixed(2) + '%', {
      color: metrics.total_return >= 0 ? '#059669' : '#dc2626',
      description: 'The overall gain or loss of the portfolio over the selected period, expressed as a percentage.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Rate_of_return',
      benchmarks: benchmarks.map((b: any) => ({ ticker: b.ticker, value: (b.total_return * 100).toFixed(2) + '%' })),
    })}
    ${metricCard('Ann. Return', (metrics.annualized_return * 100).toFixed(2) + '%', {
      color: metrics.annualized_return >= 0 ? '#059669' : '#dc2626',
      description: 'Total return scaled to a one-year rate, enabling fair comparison across different time periods.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Compound_annual_growth_rate',
      benchmarks: benchmarks.map((b: any) => ({ ticker: b.ticker, value: (b.annualized_return * 100).toFixed(2) + '%' })),
    })}
    ${metricCard('Volatility', (metrics.volatility * 100).toFixed(2) + '%', {
      description: 'Annualised standard deviation of daily returns — measures how much the portfolio value fluctuates.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Volatility_(finance)',
      benchmarks: benchmarks.map((b: any) => ({ ticker: b.ticker, value: (b.volatility * 100).toFixed(2) + '%' })),
    })}
    ${metricCard('Sharpe Ratio', metrics.sharpe_ratio.toFixed(2), {
      color: '#2563eb',
      description: 'Risk-adjusted return: excess return per unit of volatility. Higher values indicate better risk-adjusted performance.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Sharpe_ratio',
      benchmarks: benchmarks.map((b: any) => ({ ticker: b.ticker, value: b.sharpe_ratio.toFixed(2) })),
    })}
    ${metricCard('Max Drawdown', (metrics.max_drawdown * 100).toFixed(2) + '%', {
      color: '#dc2626',
      description: 'The largest peak-to-trough decline over the period. A measure of downside risk.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Drawdown_(economics)',
      benchmarks: benchmarks.map((b: any) => ({ ticker: b.ticker, value: (b.max_drawdown * 100).toFixed(2) + '%' })),
    })}
    ${bm0 ? metricCard(`Alpha vs ${bm0.ticker}`, (bm0.alpha * 100).toFixed(2) + '%', {
      color: bm0.alpha >= 0 ? '#059669' : '#dc2626',
      description: 'Excess return relative to the benchmark after adjusting for market risk. Positive alpha means outperformance.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Alpha_(finance)',
    }) : ''}
    ${bm0 ? metricCard(`Beta vs ${bm0.ticker}`, bm0.beta.toFixed(2), {
      description: 'Sensitivity of the portfolio to benchmark movements. Beta > 1 means more volatile than the benchmark.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Beta_(finance)',
    }) : ''}
  </div>

  <div style="margin-bottom:24px;">
    <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:12px;">Portfolio vs Benchmarks</h2>
    ${jsonBlock('perf-traces', traces)}
    ${jsonBlock('perf-layout', chartLayout)}
    <div id="perf-chart" style="height:300px;"></div>
    <script>
      (function() {
        var traces = JSON.parse(document.getElementById('perf-traces').textContent);
        var layout = JSON.parse(document.getElementById('perf-layout').textContent);
        Plotly.newPlot('perf-chart', traces, layout, { responsive: true, displayModeBar: false });
      })();
    </script>
  </div>

  <div>
    <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:12px;">Holdings</h2>
    <table style="width:100%;">
      <thead>
        <tr style="border-bottom:2px solid #e5e7eb;font-size:0.75rem;color:#6b7280;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">
          <th style="text-align:left;padding:8px 0;">Ticker</th>
          <th style="text-align:right;padding:8px;">Market Value</th>
          <th style="text-align:right;padding:8px 0;">Weight</th>
        </tr>
      </thead>
      <tbody>${holdingsRows}</tbody>
    </table>
  </div>

  ${narrativeSection(result.narrative, 'AI Analysis', 'prof-narrative')}`;

  downloadHTML('portfolio_report.html', pageShell('Portfolio Report', body));
}

// ---------------------------------------------------------------------------
// Investigator export
// ---------------------------------------------------------------------------

export function exportInvestigatorHTML(
  result: any,
  ticker: string,
  narrative: string | null,
): void {
  const info = result.info;
  const history = result.history;
  const perf = result.performance;
  const fit = result.portfolio_fit;

  const bars: any[] = history?.bars ?? [];
  const dates = bars.map((b: any) => b.date);
  const closes = bars.map((b: any) => b.close);

  const priceTraces = [
    { x: dates, y: closes, type: 'scatter', mode: 'lines', name: ticker, line: { color: '#3b82f6', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(59,130,246,0.06)' },
  ];
  const priceLayout = {
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 10, r: 10, b: 40, l: 65 },
    font: { family: 'inter, sans-serif', color: '#374151' },
    xaxis: { gridcolor: '#e5e7eb', zerolinecolor: '#e5e7eb' },
    yaxis: { title: { text: 'Price' }, gridcolor: '#e5e7eb', zerolinecolor: '#e5e7eb' },
    showlegend: false,
  };

  function formatCap(n: number | null): string {
    if (!n) return 'N/A';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    return '$' + n.toLocaleString('en-US');
  }

  const fitCard = (label: string, value: string, sub: string, desc: string, wiki: string) => `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;flex:1;min-width:160px;">
      <div style="display:flex;align-items:center;font-size:0.8rem;color:#6b7280;margin-bottom:6px;">
        ${label}${infoIcon(desc, wiki)}
      </div>
      <div style="font-size:1.25rem;font-weight:700;color:#111827;">${value}</div>
      <div style="font-size:0.7rem;color:#9ca3af;margin-top:2px;">${sub}</div>
    </div>`;

  const retChange = fit ? fit.simulated_metrics.annualized_return - fit.current_metrics.annualized_return : 0;
  const volChange = fit ? fit.simulated_metrics.volatility - fit.current_metrics.volatility : 0;
  const sharpeChange = fit ? fit.simulated_metrics.sharpe_ratio - fit.current_metrics.sharpe_ratio : 0;

  const portfolioFitHTML = fit ? `
  <div style="margin-top:24px;">
    <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:12px;">Portfolio Fit (5% Allocation Simulation)</h2>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      ${fitCard(
        'Correlation to Portfolio',
        fit.correlation.toFixed(3),
        '1.0 = moves exactly together',
        'A statistical measure of how this asset moves in relation to your existing portfolio. 1.0 means they move perfectly together, 0 means no relationship, and -1.0 means they move in opposite directions.',
        'https://en.wikipedia.org/wiki/Correlation_(statistics)',
      )}
      ${fitCard(
        'Simulated Ann. Return',
        (fit.simulated_metrics.annualized_return * 100).toFixed(2) + '%',
        (retChange >= 0 ? '+' : '') + (retChange * 100).toFixed(2) + '% vs current',
        'The hypothetical annualized return of your portfolio if a 5% allocation was made to this asset, proportionally reducing existing holdings.',
        'https://en.wikipedia.org/wiki/Compound_annual_growth_rate',
      )}
      ${fitCard(
        'Simulated Volatility',
        (fit.simulated_metrics.volatility * 100).toFixed(2) + '%',
        (volChange >= 0 ? '+' : '') + (volChange * 100).toFixed(2) + '% vs current',
        'The hypothetical annualized standard deviation (risk) of your portfolio if a 5% allocation was made to this asset.',
        'https://en.wikipedia.org/wiki/Volatility_(finance)',
      )}
      ${fitCard(
        'Simulated Sharpe',
        fit.simulated_metrics.sharpe_ratio.toFixed(2),
        (sharpeChange >= 0 ? '+' : '') + sharpeChange.toFixed(2) + ' vs current',
        'The hypothetical risk-adjusted return (excess return per unit of volatility) of your portfolio if a 5% allocation was made to this asset.',
        'https://en.wikipedia.org/wiki/Sharpe_ratio',
      )}
    </div>
  </div>` : '';

  const body = `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
    <div>
      <h1 style="font-size:1.75rem;font-weight:800;letter-spacing:-0.03em;">${ticker} <span style="font-size:1.1rem;font-weight:400;color:#9ca3af;">${info.name ?? ''}</span></h1>
      <p style="color:#6b7280;margin-top:4px;">${[info.sector, info.industry].filter(Boolean).join(' · ')}</p>
    </div>
    <div style="text-align:right;">
      <div style="font-size:2rem;font-weight:800;">$${info.current_price?.toFixed(2) ?? 'N/A'}</div>
      <div style="color:#6b7280;font-size:0.875rem;">Current Price</div>
    </div>
  </div>

  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
    ${metricCard('Market Cap', formatCap(info.market_cap), {
      description: 'Total market value of the company\'s outstanding shares.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Market_capitalization',
    })}
    ${metricCard('P/E Ratio', info.pe_ratio?.toFixed(2) ?? 'N/A', {
      description: 'Price-to-earnings ratio: share price divided by earnings per share. A higher ratio may indicate growth expectations.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Price%E2%80%93earnings_ratio',
    })}
    ${metricCard('Div. Yield', info.dividend_yield ? (info.dividend_yield * 100).toFixed(2) + '%' : 'N/A', {
      description: 'Annual dividend payments divided by share price, expressed as a percentage.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Dividend_yield',
    })}
    ${metricCard('52W Range', `$${info.week_52_low?.toFixed(2) ?? '?'} – $${info.week_52_high?.toFixed(2) ?? '?'}`, {
      description: 'The lowest and highest prices at which the stock has traded over the past 52 weeks.',
    })}
  </div>

  <div style="margin-bottom:24px;">
    <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:12px;">Price History</h2>
    ${jsonBlock('price-traces', priceTraces)}
    ${jsonBlock('price-layout', priceLayout)}
    <div id="price-chart" style="height:280px;"></div>
    <script>
      (function() {
        var traces = JSON.parse(document.getElementById('price-traces').textContent);
        var layout = JSON.parse(document.getElementById('price-layout').textContent);
        Plotly.newPlot('price-chart', traces, layout, { responsive: true, displayModeBar: false });
      })();
    </script>
  </div>

  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
    ${metricCard('1Y Return', (perf.total_return * 100).toFixed(2) + '%', {
      color: perf.total_return >= 0 ? '#059669' : '#dc2626',
      description: 'The overall gain or loss of the asset over the 1-year period.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Rate_of_return',
    })}
    ${metricCard('Ann. Return', (perf.annualized_return * 100).toFixed(2) + '%', {
      color: perf.annualized_return >= 0 ? '#059669' : '#dc2626',
      description: 'Total return scaled to a one-year rate.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Compound_annual_growth_rate',
    })}
    ${metricCard('Volatility', (perf.volatility * 100).toFixed(2) + '%', {
      description: 'Annualised standard deviation of daily returns — measures how much the asset price fluctuates.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Volatility_(finance)',
    })}
    ${metricCard('Sharpe Ratio', perf.sharpe_ratio.toFixed(2), {
      color: '#2563eb',
      description: 'Risk-adjusted return: excess return per unit of volatility.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Sharpe_ratio',
    })}
    ${metricCard('Max Drawdown', (perf.max_drawdown * 100).toFixed(2) + '%', {
      color: '#dc2626',
      description: 'The largest peak-to-trough decline over the 1-year period.',
      wikiUrl: 'https://en.wikipedia.org/wiki/Drawdown_(economics)',
    })}
  </div>

  ${portfolioFitHTML}
  ${narrativeSection(narrative, 'AI Investment Critique', 'inv-narrative')}`;

  downloadHTML(`${ticker}_analysis.html`, pageShell(`${ticker} Analysis`, body));
}
