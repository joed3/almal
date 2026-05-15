import _Plot from 'react-plotly.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = (_Plot as any).default ?? _Plot;

// ---------------------------------------------------------------------------
// Sector colours (used by other components too)
// ---------------------------------------------------------------------------

export const SECTOR_ORDER = [
  'Information Technology',
  'Health Care',
  'Communication Services',
  'Consumer Discretionary',
  'Consumer Staples',
  'Financials',
  'Industrials',
  'Energy',
  'Materials',
  'Real Estate',
  'Utilities',
  'Fixed Income',
  'Commodities',
  'International',
  'ETF / Fund',
];

export const SECTOR_COLORS: Record<string, string> = {
  'Information Technology': '#3b82f6',
  'Health Care': '#10b981',
  'Communication Services': '#06b6d4',
  'Consumer Discretionary': '#f97316',
  'Consumer Staples': '#84cc16',
  'Financials': '#f59e0b',
  'Industrials': '#6366f1',
  'Energy': '#ef4444',
  'Materials': '#14b8a6',
  'Real Estate': '#ec4899',
  'Utilities': '#8b5cf6',
  'Fixed Income': '#a78bfa',
  'Commodities': '#fbbf24',
  'International': '#64748b',
  'ETF / Fund': '#94a3b8',
};

// ---------------------------------------------------------------------------
// Clustering helpers
// ---------------------------------------------------------------------------

/** Orders tickers within a group using greedy nearest-neighbour on correlation. */
function greedyOrder(
  tickers: string[],
  matrix: Record<string, Record<string, number>>,
): string[] {
  if (tickers.length <= 1) return [...tickers];

  // Start with the ticker with the highest avg correlation to the rest of the group.
  let best = tickers[0];
  let bestAvg = -Infinity;
  for (const t of tickers) {
    const others = tickers.filter((o) => o !== t);
    const avg = others.reduce((s, o) => s + (matrix[t]?.[o] ?? 0), 0) / others.length;
    if (avg > bestAvg) { bestAvg = avg; best = t; }
  }

  const ordered = [best];
  const remaining = new Set(tickers.filter((t) => t !== best));

  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1];
    let nextT = '';
    let maxC = -Infinity;
    for (const t of remaining) {
      const c = matrix[last]?.[t] ?? 0;
      if (c > maxC) { maxC = c; nextT = t; }
    }
    if (!nextT) { nextT = [...remaining][0]; }
    ordered.push(nextT);
    remaining.delete(nextT);
  }

  return ordered;
}

/** Orders sectors using greedy nearest-neighbour on average inter-sector correlation. */
function clusterSectors(
  sectorGroups: Record<string, string[]>,
  matrix: Record<string, Record<string, number>>,
): string[] {
  const sectors = Object.keys(sectorGroups);
  if (sectors.length <= 1) return sectors;

  const interCorr = (s1: string, s2: string): number => {
    const t1s = sectorGroups[s1];
    const t2s = sectorGroups[s2];
    let sum = 0, cnt = 0;
    for (const a of t1s) {
      for (const b of t2s) { sum += matrix[a]?.[b] ?? 0; cnt++; }
    }
    return cnt > 0 ? sum / cnt : 0;
  };

  // Start with the sector with the highest avg correlation to all other sectors.
  let bestS = sectors[0];
  let bestAvg = -Infinity;
  for (const s of sectors) {
    const others = sectors.filter((o) => o !== s);
    const avg = others.length > 0
      ? others.reduce((sum, o) => sum + interCorr(s, o), 0) / others.length
      : 0;
    if (avg > bestAvg) { bestAvg = avg; bestS = s; }
  }

  const ordered = [bestS];
  const remaining = new Set(sectors.filter((s) => s !== bestS));

  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1];
    let nextS = '';
    let maxC = -Infinity;
    for (const s of remaining) {
      const c = interCorr(last, s);
      if (c > maxC) { maxC = c; nextS = s; }
    }
    if (!nextS) { nextS = [...remaining][0]; }
    ordered.push(nextS);
    remaining.delete(nextS);
  }

  return ordered;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CorrelationHeatmapProps {
  matrix: Record<string, Record<string, number>>;
  /** All tickers to attempt to display (those missing from matrix are dropped). */
  tickers: string[];
  sectorMap?: Record<string, string | null>;
  /** When provided, tickers NOT in this set get correlation-coloured labels. */
  portfolioTickers?: string[];
  /** Correlation-to-portfolio score per candidate ticker (0–1). Used to colour labels. */
  correlationScores?: Record<string, number>;
  isDark?: boolean;
  title?: string;
  height?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function candidateLabelColor(corr: number): string {
  if (corr < 0.5) return '#ef4444';  // red-500 — low correlation
  if (corr < 0.72) return '#f59e0b'; // amber-500 — moderate
  return '#3b82f6';                   // blue-500 — high correlation
}

export default function CorrelationHeatmap({
  matrix,
  tickers,
  sectorMap,
  portfolioTickers,
  correlationScores,
  isDark = false,
  title = 'Correlation Matrix',
  height = 480,
}: CorrelationHeatmapProps) {
  const portfolioSet = new Set(portfolioTickers ?? []);
  // Colour-label mode: portfolioTickers supplied and non-empty → distinguish candidates.
  const hasPortfolioContext = portfolioTickers != null && portfolioTickers.length > 0;

  function getSector(ticker: string): string {
    return sectorMap?.[ticker] ?? 'ETF / Fund';
  }

  const valid = tickers.filter((t) => matrix[t] != null);

  // --- Cluster by sector then within sector ---
  const sectorToTickers: Record<string, string[]> = {};
  for (const t of valid) {
    const s = getSector(t);
    if (!sectorToTickers[s]) sectorToTickers[s] = [];
    sectorToTickers[s].push(t);
  }
  for (const s of Object.keys(sectorToTickers)) {
    sectorToTickers[s] = greedyOrder(sectorToTickers[s], matrix);
  }
  const sectorOrderList = clusterSectors(sectorToTickers, matrix);
  const sorted = sectorOrderList.flatMap((s) => sectorToTickers[s]);

  const n = sorted.length;
  if (n < 2) return null;

  // Reversed for y-axis: sorted[0] appears at the top of the heatmap.
  const sortedRev = [...sorted].reverse();

  // z[i][j] = corr(sortedRev[i], sorted[j])
  const z: number[][] = sortedRev.map((row) =>
    sorted.map((col) => matrix[row]?.[col] ?? 0),
  );

  const hoverText: string[][] = sortedRev.map((row) =>
    sorted.map((col) => {
      const r = matrix[row]?.[col] ?? 0;
      return [
        `<b>${row} × ${col}</b>`,
        `r = ${r.toFixed(3)}`,
        `${row}: ${getSector(row)}`,
        `${col}: ${getSector(col)}`,
      ].join('<br>');
    }),
  );

  // ---------------------------------------------------------------------------
  // Paper-coordinate helpers
  // For a categorical axis with n ticks: paper = (data_index + 0.5) / n
  // sorted[j]    → x paper = (j + 0.5) / n
  // sortedRev[i] → y paper = (i + 0.5) / n  (Plotly y=0 is bottom)
  // ---------------------------------------------------------------------------

  const xDiv = (a: number) => (a + 1) / n;
  const yDiv = (a: number) => (n - a - 1) / n;
  const yMidPaper = (midIdx: number) => (n - 0.5 - midIdx) / n;

  // Sector groups (contiguous runs in sorted order)
  type Group = { sector: string; start: number; end: number };
  const groups: Group[] = [];
  if (n > 0) {
    let gs = 0;
    let gSector = getSector(sorted[0]);
    for (let i = 1; i <= n; i++) {
      const sector = i < n ? getSector(sorted[i]) : null;
      if (sector !== gSector) {
        groups.push({ sector: gSector, start: gs, end: i - 1 });
        gSector = sector!;
        gs = i;
      }
    }
  }

  const shapes: object[] = [];
  const annotations: object[] = [];

  // Sector dividers + right-side sector labels (pushed past the colorbar)
  groups.forEach((group) => {
    if (group.start > 0) {
      const lc = isDark ? '#374151' : '#e5e7eb';
      const xd = xDiv(group.start - 1);
      const yd = yDiv(group.start - 1);
      shapes.push(
        { type: 'line', x0: xd, x1: xd, y0: 0, y1: 1, xref: 'paper', yref: 'paper', line: { color: lc, width: 1, dash: 'dot' } },
        { type: 'line', x0: 0, x1: 1, y0: yd, y1: yd, xref: 'paper', yref: 'paper', line: { color: lc, width: 1, dash: 'dot' } },
      );
    }

    const midIdx = (group.start + group.end) / 2;
    const color = SECTOR_COLORS[group.sector] ?? (isDark ? '#9ca3af' : '#6b7280');
    annotations.push({
      x: 1.18,
      y: yMidPaper(midIdx),
      xref: 'paper', yref: 'paper',
      text: group.sector,
      showarrow: false,
      font: { size: 9, color },
      xanchor: 'left',
      yanchor: 'middle',
    });
  });

  // Custom tick labels — y-axis (left) and x-axis (bottom, rotated)
  const tickSize = n > 25 ? 8 : 9;
  const defaultTickColor = isDark ? '#6b7280' : '#9ca3af';

  const getCandidateColor = (ticker: string): string => {
    const score = correlationScores?.[ticker];
    return score != null ? candidateLabelColor(score) : '#ef4444';
  };

  sortedRev.forEach((ticker, i) => {
    const isPort = portfolioSet.has(ticker);
    const isCandidate = hasPortfolioContext && !isPort;
    const color = isCandidate ? getCandidateColor(ticker) : defaultTickColor;
    const label = isPort ? `${ticker} ◆` : ticker;
    annotations.push({
      x: -0.01,
      y: (i + 0.5) / n,
      xref: 'paper', yref: 'paper',
      text: label,
      showarrow: false,
      font: { size: tickSize, color },
      xanchor: 'right',
      yanchor: 'middle',
    });
  });

  sorted.forEach((ticker, j) => {
    const isPort = portfolioSet.has(ticker);
    const isCandidate = hasPortfolioContext && !isPort;
    const color = isCandidate ? getCandidateColor(ticker) : defaultTickColor;
    const label = isPort ? `${ticker} ◆` : ticker;
    annotations.push({
      x: (j + 0.5) / n,
      y: -0.01,
      xref: 'paper', yref: 'paper',
      text: label,
      showarrow: false,
      font: { size: tickSize, color },
      xanchor: 'right',
      yanchor: 'top',
      textangle: -40,
    });
  });

  if (hasPortfolioContext) {
    annotations.push({
      x: 1.18, y: -0.05,
      xref: 'paper', yref: 'paper',
      text: '◆ current  ·  red = low corr  ·  blue = high corr',
      showarrow: false,
      font: { size: 8, color: isDark ? '#6b7280' : '#9ca3af' },
      xanchor: 'left', yanchor: 'top',
    });
  }

  const fontColor = isDark ? '#d1d5db' : '#374151';

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-stone-200 dark:border-gray-800">
      <h2 className="text-sm font-medium text-stone-600 dark:text-gray-300 mb-3 uppercase tracking-wide">
        {title}
      </h2>
      <Plot
        data={[
          {
            type: 'heatmap',
            z,
            x: sorted,
            y: sortedRev,
            text: hoverText,
            hovertemplate: '%{text}<extra></extra>',
            colorscale: 'RdBu',
            reversescale: true,
            zmin: -1,
            zmax: 1,
            showscale: true,
            colorbar: {
              x: 1.04,
              thickness: 12,
              len: 0.75,
              tickfont: { size: 9, color: fontColor },
              title: { text: 'r', font: { size: 10, color: fontColor } },
            },
          },
        ]}
        layout={{
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          margin: { t: 10, r: 230, b: 90, l: 80 },
          xaxis: {
            side: 'bottom',
            showticklabels: false,
            linecolor: isDark ? '#374151' : '#e5e7eb',
          },
          yaxis: {
            showticklabels: false,
            linecolor: isDark ? '#374151' : '#e5e7eb',
          },
          shapes: shapes as Plotly.Shape[],
          annotations: annotations as Plotly.Annotations[],
          font: { color: fontColor },
          autosize: true,
        }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%', height }}
        useResizeHandler
      />
    </div>
  );
}
