/* eslint-disable @typescript-eslint/no-explicit-any */
import _Plot from 'react-plotly.js';
import { useTheme } from '../context/ThemeContext';

const Plot = (_Plot as any).default || _Plot;

interface BacktestChartProps {
  dates: string[];
  portfolioCumulative: number[];
  benchmarkCumulative: number[];
  benchmark: string;
  rebalanceDates?: string[];
  bahCumulative?: number[];
}

export default function BacktestChart({
  dates,
  portfolioCumulative,
  benchmarkCumulative,
  benchmark,
  rebalanceDates = [],
  bahCumulative,
}: BacktestChartProps) {
  const { isDark } = useTheme();

  const gridcolor = isDark ? '#374151' : '#e5e7eb';
  const axisColor = isDark ? '#9ca3af' : '#6b7280';
  const fontColor = isDark ? '#d1d5db' : '#374151';

  // Convert cumulative values to percentage return (e.g. 1.25 -> 25%)
  const portPct = portfolioCumulative.map((v) => (v - 1) * 100);
  const benchPct = benchmarkCumulative.map((v) => (v - 1) * 100);
  const bahPct = bahCumulative?.map((v) => (v - 1) * 100);

  const shapes = rebalanceDates.map((dateStr) => ({
    type: 'line',
    x0: dateStr,
    x1: dateStr,
    y0: 0,
    y1: 1,
    yref: 'paper',
    line: { color: isDark ? '#4b5563' : '#d1d5db', width: 1, dash: 'dash' },
  }));

  const chartData = [
    {
      x: dates,
      y: portPct,
      type: 'scatter',
      mode: 'lines',
      name: 'Walk-Forward',
      line: { color: '#3b82f6', width: 2 },
      hovertemplate: '%{x}<br>%{y:.2f}%<extra>Walk-Forward</extra>',
    } as any,
    {
      x: dates,
      y: benchPct,
      type: 'scatter',
      mode: 'lines',
      name: benchmark,
      line: { color: '#9ca3af', width: 2, dash: 'dot' },
      hovertemplate: `%{x}<br>%{y:.2f}%<extra>${benchmark}</extra>`,
    } as any,
  ];

  if (bahPct) {
    chartData.push({
      x: dates,
      y: bahPct,
      type: 'scatter',
      mode: 'lines',
      name: 'Buy & Hold',
      line: { color: isDark ? '#fcd34d' : '#f59e0b', width: 1.5, dash: 'dashdot' },
      hovertemplate: '%{x}<br>%{y:.2f}%<extra>Buy & Hold</extra>',
    } as any);
  }

  return (
    <div className="w-full h-72 rounded overflow-hidden">
      <Plot
        className="w-full h-full"
        data={chartData}
        layout={{
          font: { family: 'inter, sans-serif', color: fontColor },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          margin: { t: 10, r: 10, b: 40, l: 50 },
          xaxis: {
            color: axisColor,
            gridcolor,
            zerolinecolor: gridcolor,
          },
          yaxis: {
            title: { text: 'Cumulative Return %' },
            color: axisColor,
            gridcolor,
            zerolinecolor: gridcolor,
            ticksuffix: '%',
          },
          showlegend: true,
          legend: {
            orientation: 'h',
            y: 1.1,
            font: { color: axisColor },
          },
          shapes: shapes as any,
        }}
        config={{ responsive: true, displayModeBar: false }}
      />
    </div>
  );
}
