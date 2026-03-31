interface BenchmarkComparison {
  ticker: string;
  value: string;
}

interface MetricCardProps {
  label: string;
  value: string;
  positive: boolean | null;
  sublabel?: string;
  benchmarks?: BenchmarkComparison[];
  description: string;
  wikiUrl: string;
}

export default function MetricCard({
  label,
  value,
  positive = null,
  sublabel,
  benchmarks,
  description,
  wikiUrl,
}: MetricCardProps) {
  const valueColor =
    positive === true
      ? 'text-green-600 dark:text-green-400'
      : positive === false
        ? 'text-red-600 dark:text-red-400'
        : 'text-stone-900 dark:text-white';

  return (
    <div className="relative group bg-stone-50 dark:bg-gray-800 rounded-lg px-4 py-3 flex flex-col gap-1 min-w-[120px]">
      {/* Header row: label + info icon */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
        {/* Info icon with tooltip */}
        <span className="relative ml-1 cursor-default">
          <svg
            className="w-3.5 h-3.5 text-stone-400 dark:text-gray-500 group-hover:text-stone-600 dark:group-hover:text-gray-300 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="8" strokeLinecap="round" />
            <line x1="12" y1="12" x2="12" y2="16" strokeLinecap="round" />
          </svg>
          {/* Tooltip */}
          <div
            className={[
              'absolute right-0 bottom-full mb-1 w-56 z-50',
              'bg-white dark:bg-gray-900 border border-stone-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-xl',
              'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto',
              'transition-opacity duration-150',
            ].join(' ')}
          >
            <p className="text-xs text-stone-700 dark:text-slate-300 leading-snug">{description}</p>
            <a
              href={wikiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 dark:text-blue-400 hover:underline mt-1 inline-block"
            >
              Learn more →
            </a>
          </div>
        </span>
      </div>

      {/* Main value */}
      <span className={`text-lg font-semibold ${valueColor}`}>{value}</span>
      {sublabel && (
        <span className="text-xs text-stone-400 dark:text-gray-500 -mt-0.5">{sublabel}</span>
      )}

      {/* Benchmark comparison rows */}
      {benchmarks && benchmarks.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {benchmarks.map((bm) => (
            <div key={bm.ticker} className="flex items-center justify-between gap-2">
              <span className="text-xs text-stone-500 dark:text-gray-500 font-medium">{bm.ticker}</span>
              <span className="text-xs text-stone-600 dark:text-gray-400">{bm.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
