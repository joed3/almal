import { useState } from 'react';
import _Plot from 'react-plotly.js';
import { SECTOR_COLORS, SECTOR_ORDER } from './CorrelationHeatmap';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = (_Plot as any).default ?? _Plot;

type YMetric = 'return' | 'sharpe';

export interface ScatterPoint {
  ticker: string;
  volatility: number;        // fraction, e.g. 0.20 = 20%
  annualized_return: number; // fraction
  sharpe_ratio: number;
  sector: string | null;
  weight?: number;           // fraction 0–1; used for marker size in portfolio trace
  isPortfolio?: boolean;     // true (default) = filled circle; false = open circle candidate
  correlationScore?: number; // 0–1; when set on candidates, overrides outline colour
}

function corrColor(corr: number): string {
  if (corr < 0.5) return '#ef4444';  // red-500 — low correlation
  if (corr < 0.72) return '#f59e0b'; // amber-500 — moderate
  return '#3b82f6';                   // blue-500 — high correlation
}

interface RiskReturnScatterProps {
  points: ScatterPoint[];
  isDark?: boolean;
  title?: string;
  height?: number | string;
}

export default function RiskReturnScatter({
  points,
  isDark = false,
  title = 'Risk / Return',
  height = 380,
}: RiskReturnScatterProps) {
  const [yMetric, setYMetric] = useState<YMetric>('return');

  const fontColor = isDark ? '#d1d5db' : '#374151';
  const gridcolor = isDark ? '#374151' : '#e5e7eb';
  const axisColor = isDark ? '#9ca3af' : '#6b7280';

  const portTotal = points.filter((p) => p.isPortfolio !== false).length;
  const showTextLabels = portTotal <= 25;

  const getY = (p: ScatterPoint) =>
    yMetric === 'return' ? p.annualized_return * 100 : p.sharpe_ratio;

  const getSize = (p: ScatterPoint) => {
    if (p.isPortfolio === false) return 7;
    return p.weight != null ? Math.max(8, Math.min(22, Math.sqrt(p.weight) * 80)) : 10;
  };

  // Build pre-formatted hover text so it adapts to the current yMetric toggle.
  const makeHover = (p: ScatterPoint): string => {
    const lines = [
      `<b>${p.ticker}</b>`,
      `Sector: ${p.sector ?? 'N/A'}`,
      `Volatility: ${(p.volatility * 100).toFixed(1)}%`,
      yMetric === 'return'
        ? `Ann. Return: ${(p.annualized_return * 100).toFixed(1)}%`
        : `Sharpe: ${p.sharpe_ratio.toFixed(2)}`,
    ];
    if (p.isPortfolio !== false && p.weight != null) {
      lines.push(`Weight: ${(p.weight * 100).toFixed(1)}%`);
    }
    return lines.join('<br>');
  };

  // One Plotly trace per sector — clicking the legend entry toggles that sector.
  const sectors = [
    ...new Set(points.map((p) => p.sector ?? 'Unknown')),
  ].sort((a, b) => {
    const ai = SECTOR_ORDER.indexOf(a);
    const bi = SECTOR_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const traces = sectors.map((sector) => {
    const sp = points.filter((p) => (p.sector ?? 'Unknown') === sector);
    const sectorColor = SECTOR_COLORS[sector] ?? (isDark ? '#6b7280' : '#64748b');
    const pointColor = (p: ScatterPoint) =>
      p.isPortfolio === false && p.correlationScore != null
        ? corrColor(p.correlationScore)
        : sectorColor;
    return {
      type: 'scatter',
      mode: 'markers+text',
      name: sector,
      legendgroup: sector,
      x: sp.map((p) => p.volatility * 100),
      y: sp.map(getY),
      // Text shown only for portfolio holdings when count is manageable
      text: sp.map((p) => showTextLabels && p.isPortfolio !== false ? p.ticker : ''),
      textposition: 'top center',
      textfont: { size: 9, color: fontColor },
      marker: {
        color: sp.map(pointColor),
        size: sp.map(getSize),
        // Within one trace, portfolio=filled circle, candidates=open circle
        symbol: sp.map((p) => p.isPortfolio !== false ? 'circle' : 'circle-open'),
        line: { width: 1.5, color: sp.map(pointColor) },
        opacity: sp.map((p) => (p.isPortfolio !== false ? 0.9 : 0.65)),
      },
      customdata: sp.map(makeHover),
      hovertemplate: '%{customdata}<extra></extra>',
    };
  });

  const yLabel = yMetric === 'return' ? 'Ann. Return (%)' : 'Sharpe Ratio';
  const yTickSuffix = yMetric === 'return' ? '%' : '';
  const hasCandidates = points.some((p) => p.isPortfolio === false);

  const fill = typeof height === 'string';

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-lg p-4 border border-stone-200 dark:border-gray-800${fill ? ' h-full flex flex-col' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-sm font-medium text-stone-600 dark:text-gray-300 uppercase tracking-wide">
            {title}
          </h2>
          {hasCandidates && (
            <p className="text-xs text-stone-400 dark:text-gray-500 mt-0.5">
              ● filled = holding &nbsp;·&nbsp; ○ open = candidate
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {(['return', 'sharpe'] as YMetric[]).map((m) => (
            <button
              key={m}
              onClick={() => setYMetric(m)}
              className={[
                'text-xs px-2.5 py-1 rounded transition-colors',
                yMetric === m
                  ? 'bg-blue-600 text-white'
                  : 'text-stone-500 dark:text-gray-400 hover:bg-stone-100 dark:hover:bg-gray-800',
              ].join(' ')}
            >
              {m === 'return' ? 'Ann. Return' : 'Sharpe'}
            </button>
          ))}
        </div>
      </div>
      <Plot
        data={traces as Plotly.Data[]}
        layout={{
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          margin: { t: 10, r: 180, b: 50, l: 60 },
          xaxis: {
            color: axisColor,
            gridcolor,
            title: { text: 'Volatility (%)', font: { size: 11, color: axisColor } },
            ticksuffix: '%',
          },
          yaxis: {
            color: axisColor,
            gridcolor,
            title: { text: yLabel, font: { size: 11, color: axisColor } },
            ticksuffix: yTickSuffix,
          },
          showlegend: true,
          legend: {
            orientation: 'v',
            yanchor: 'top',
            y: 1,
            xanchor: 'left',
            x: 1.01,
            font: { size: 10, color: fontColor },
            bgcolor: isDark ? '#1f2937' : '#f9fafb',
            bordercolor: isDark ? '#374151' : '#e5e7eb',
            borderwidth: 1,
            tracegroupgap: 2,
          },
          font: { color: fontColor },
          autosize: true,
          shapes: [
            {
              type: 'line',
              x0: 0, x1: 1, y0: 0, y1: 0,
              xref: 'paper', yref: 'y',
              line: { color: isDark ? '#4b5563' : '#d1d5db', width: 1, dash: 'dot' },
            },
          ],
        }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%', height: fill ? '100%' : height }}
        className={fill ? 'flex-1 min-h-0' : ''}
        useResizeHandler
      />
    </div>
  );
}
