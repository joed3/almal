/* eslint-disable @typescript-eslint/no-explicit-any */
import _Plot from 'react-plotly.js';
import { useTheme } from '../context/ThemeContext';

// react-plotly.js is CJS; in Vite dev the namespace object is returned instead
const Plot = (_Plot as any).default || _Plot;

interface FrontierPoint {
  volatility: number;
  return?: number;
  return_?: number;
  weights: Record<string, number>;
}

interface OptimizationMetrics {
  expected_annual_return: number;
  annual_volatility: number;
  sharpe_ratio: number;
}

interface EfficientFrontierChartProps {
  curve: FrontierPoint[];
  optimalMetrics: OptimizationMetrics;
}

export default function EfficientFrontierChart({
  curve,
  optimalMetrics,
}: EfficientFrontierChartProps) {
  const { isDark } = useTheme();

  const gridcolor = isDark ? '#374151' : '#e5e7eb';
  const axisColor = isDark ? '#9ca3af' : '#6b7280';
  const fontColor = isDark ? '#d1d5db' : '#374151';

  // Sort curve by volatility to ensure a smooth line
  const sortedCurve = [...curve].sort((a, b) => a.volatility - b.volatility);

  const curveVols = sortedCurve.map((p) => p.volatility * 100);
  const curveRets = sortedCurve.map((p) => (p.return ?? p.return_ ?? 0) * 100);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 border border-stone-200 dark:border-gray-700">
      <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-4">Efficient Frontier</h2>
      <div className="w-full h-80 rounded overflow-hidden">
        <Plot
          className="w-full h-full"
          data={[
            {
              x: curveVols,
              y: curveRets,
              type: 'scatter',
              mode: 'lines',
              name: 'Efficient Frontier',
              line: { color: '#3b82f6', width: 3 },
              hoverinfo: 'x+y',
            } as any,
            {
              x: [optimalMetrics.annual_volatility * 100],
              y: [optimalMetrics.expected_annual_return * 100],
              type: 'scatter',
              mode: 'markers',
              name: 'Optimal Portfolio',
              marker: { color: '#10b981', size: 12, symbol: 'star' },
              hoverinfo: 'x+y+name',
            } as any,
          ]}
          layout={{
            font: { family: 'inter, sans-serif', color: fontColor },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            margin: { t: 10, r: 10, b: 40, l: 40 },
            xaxis: {
              title: { text: 'Volatility (Risk) %' },
              color: axisColor,
              gridcolor,
              zerolinecolor: gridcolor,
            },
            yaxis: {
              title: { text: 'Expected Return %' },
              color: axisColor,
              gridcolor,
              zerolinecolor: gridcolor,
            },
            showlegend: true,
            legend: {
              orientation: 'h',
              y: 1.1,
              font: { color: axisColor },
            },
          }}
          config={{ responsive: true, displayModeBar: false }}
        />
      </div>
    </div>
  );
}
