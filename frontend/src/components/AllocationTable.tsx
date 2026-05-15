interface AllocationRequirement {
  ticker: string;
  weight: number;
  current_shares: number;
  target_shares: number;
  shares_delta: number;
  target_dollars: number;
  est_tax_impact?: number | null;
  holding_days?: number | null;
}

interface AllocationTableProps {
  allocations: AllocationRequirement[];
  leftoverCash: number;
  sectorMap?: Record<string, string | null>;
  nameMap?: Record<string, string | null>;
}

function fmtDays(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function DeltaCell({ delta }: { delta: number }) {
  const cls =
    delta > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : delta < 0
        ? 'text-orange-600 dark:text-orange-400'
        : 'text-stone-400 dark:text-gray-500';
  return (
    <td className={`p-3 text-right font-semibold ${cls}`}>
      {delta > 0 ? '+' : ''}
      {delta.toLocaleString()}
    </td>
  );
}

export default function AllocationTable({
  allocations,
  leftoverCash,
  sectorMap,
  nameMap,
}: AllocationTableProps) {
  const showTax = allocations.some((a) => a.est_tax_impact != null);
  const showHeld = allocations.some((a) => a.holding_days != null);
  const groupBySector = sectorMap != null && Object.keys(sectorMap).length > 0;

  const colSpanFull = 4 + (showHeld ? 1 : 0) + (showTax ? 1 : 0) + 1;

  function renderRow(alloc: AllocationRequirement) {
    const name = nameMap?.[alloc.ticker];
    return (
      <tr
        key={alloc.ticker}
        className="border-b border-stone-200/50 dark:border-gray-700/50 hover:bg-stone-50 dark:hover:bg-gray-700/20"
      >
        <td className={`p-3 ${groupBySector ? 'pl-8' : 'pl-0'} font-medium text-stone-900 dark:text-white`}>
          {alloc.ticker}
          {name && (
            <span className="ml-2 text-xs font-normal text-stone-400 dark:text-gray-500">{name}</span>
          )}
        </td>
        <td className="p-3 text-right text-blue-600 dark:text-blue-400">
          {(alloc.weight * 100).toFixed(2)}%
        </td>
        <td className="p-3 text-right text-stone-500 dark:text-gray-400">
          {alloc.current_shares.toLocaleString()}
        </td>
        <td className="p-3 text-right text-stone-700 dark:text-gray-200 font-medium">
          {alloc.target_shares.toLocaleString()}
        </td>
        <DeltaCell delta={alloc.shares_delta} />
        {showHeld && (
          <td className="p-3 text-right text-stone-500 dark:text-gray-400 text-xs">
            {alloc.holding_days != null ? fmtDays(alloc.holding_days) : '—'}
          </td>
        )}
        {showTax && (
          <td className="p-3 text-right text-xs">
            {alloc.est_tax_impact != null ? (
              <span className="text-orange-600 dark:text-orange-400 font-medium">
                ${alloc.est_tax_impact.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            ) : (
              <span className="text-stone-400 dark:text-gray-500">—</span>
            )}
          </td>
        )}
        <td className="p-3 pr-0 text-right text-stone-600 dark:text-gray-300">
          ${alloc.target_dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    );
  }

  function renderGrouped() {
    const groups: Record<string, AllocationRequirement[]> = {};
    for (const alloc of allocations) {
      const sector = sectorMap![alloc.ticker] ?? 'ETF / Fund';
      if (!groups[sector]) groups[sector] = [];
      groups[sector].push(alloc);
    }
    const sortedSectors = Object.entries(groups).sort(
      ([, a], [, b]) =>
        b.reduce((s, x) => s + x.weight, 0) - a.reduce((s, x) => s + x.weight, 0),
    );
    return sortedSectors.flatMap(([sector, rows]) => {
      const sectorWeight = rows.reduce((s, x) => s + x.weight, 0);
      const sectorDollars = rows.reduce((s, x) => s + x.target_dollars, 0);
      return [
        <tr
          key={`sector-${sector}`}
          className="bg-stone-50 dark:bg-gray-800/60 border-b border-stone-200 dark:border-gray-700"
        >
          <td className="p-3 pl-0 font-semibold text-stone-700 dark:text-gray-200 text-xs uppercase tracking-wide">
            {sector}
          </td>
          <td className="p-3 text-right text-xs font-semibold text-blue-600 dark:text-blue-400">
            {(sectorWeight * 100).toFixed(2)}%
          </td>
          <td className="p-3 text-right text-stone-400 dark:text-gray-500 text-xs">—</td>
          <td className="p-3 text-right text-stone-400 dark:text-gray-500 text-xs">—</td>
          <td className="p-3 text-right text-stone-400 dark:text-gray-500 text-xs">—</td>
          {showHeld && <td className="p-3 text-right text-stone-400 dark:text-gray-500 text-xs">—</td>}
          {showTax && <td className="p-3 text-right text-stone-400 dark:text-gray-500 text-xs">—</td>}
          <td className="p-3 pr-0 text-right text-xs font-semibold text-stone-600 dark:text-gray-300">
            ${sectorDollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </td>
        </tr>,
        ...rows.sort((a, b) => b.weight - a.weight).map(renderRow),
      ];
    });
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 border border-stone-200 dark:border-gray-700">
      <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-4">Recommended Allocation</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-stone-200 dark:border-gray-700 text-sm tracking-wider text-stone-500 dark:text-gray-400">
              <th className="font-semibold p-3 pl-0">Ticker</th>
              <th className="font-semibold p-3 text-right">Target Weight</th>
              <th className="font-semibold p-3 text-right">Current Shares</th>
              <th className="font-semibold p-3 text-right">Target Shares</th>
              <th className="font-semibold p-3 text-right">Action (Delta)</th>
              {showHeld && <th className="font-semibold p-3 text-right">Held</th>}
              {showTax && (
                <th className="font-semibold p-3 text-right text-orange-600 dark:text-orange-400">
                  Est. Tax
                </th>
              )}
              <th className="font-semibold p-3 pr-0 text-right">Capital Allocated</th>
            </tr>
          </thead>
          <tbody>
            {groupBySector ? renderGrouped() : allocations.map(renderRow)}
            <tr className="border-t-2 border-stone-200 dark:border-gray-700">
              <td className="p-3 pl-0 font-semibold text-stone-500 dark:text-gray-400">Unallocated Cash</td>
              <td className="p-3 text-right text-stone-400 dark:text-gray-400">-</td>
              <td className="p-3 text-right text-stone-400 dark:text-gray-400">-</td>
              <td className="p-3 text-right text-stone-400 dark:text-gray-400">-</td>
              <td className="p-3 text-right text-stone-400 dark:text-gray-400">-</td>
              {showHeld && <td className="p-3 text-right text-stone-400 dark:text-gray-400">-</td>}
              {showTax && <td className="p-3 text-right text-stone-400 dark:text-gray-400">-</td>}
              <td className="p-3 pr-0 text-right font-medium text-stone-900 dark:text-white">
                ${leftoverCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
