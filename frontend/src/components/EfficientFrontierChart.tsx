/* eslint-disable @typescript-eslint/no-explicit-any */
import _Plot from 'react-plotly.js';

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
  // Sort curve by volatility to ensure a smooth line
  const sortedCurve = [...curve].sort((a, b) => a.volatility - b.volatility);

  const curveVols = sortedCurve.map((p) => p.volatility * 100);
  const curveRets = sortedCurve.map((p) => (p.return ?? p.return_ ?? 0) * 100);

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h2 className="text-xl font-bold text-white mb-4">Efficient Frontier</h2>
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
              line: { color: '#3b82f6', width: 3 }, // blue-500
              hoverinfo: 'x+y',
            } as any,
            {
              x: [optimalMetrics.annual_volatility * 100],
              y: [optimalMetrics.expected_annual_return * 100],
              type: 'scatter',
              mode: 'markers',
              name: 'Optimal Portfolio',
              marker: { color: '#10b981', size: 12, symbol: 'star' }, // emerald-500
              hoverinfo: 'x+y+name',
            } as any,
          ]}
          layout={{
            font: { family: 'inter, sans-serif' },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            margin: { t: 10, r: 10, b: 40, l: 40 },
            xaxis: {
              title: { text: 'Volatility (Risk) %' },
              color: '#9ca3af',
              gridcolor: '#374151',
              zerolinecolor: '#374151',
            },
            yaxis: {
              title: { text: 'Expected Return %' },
              color: '#9ca3af',
              gridcolor: '#374151',
              zerolinecolor: '#374151',
            },
            showlegend: true,
            legend: {
              orientation: 'h',
              y: 1.1,
              font: { color: '#9ca3af' },
            },
          }}
          config={{ responsive: true, displayModeBar: false }}
        />
      </div>
    </div>
  );
}
