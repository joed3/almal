interface AllocationRequirement {
  ticker: string;
  weight: number;
  current_shares: number;
  target_shares: number;
  shares_delta: number;
  target_dollars: number;
}

interface AllocationTableProps {
  allocations: AllocationRequirement[];
  leftoverCash: number;
}

export default function AllocationTable({
  allocations,
  leftoverCash,
}: AllocationTableProps) {
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
              <th className="font-semibold p-3 pr-0 text-right">Capital Allocated</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((alloc) => (
              <tr key={alloc.ticker} className="border-b border-stone-200/50 dark:border-gray-700/50 hover:bg-stone-50 dark:hover:bg-gray-700/20">
                <td className="p-3 pl-0 font-medium text-stone-900 dark:text-white">{alloc.ticker}</td>
                <td className="p-3 text-right text-blue-600 dark:text-blue-400">
                  {(alloc.weight * 100).toFixed(2)}%
                </td>
                <td className="p-3 text-right text-stone-500 dark:text-gray-400">
                  {alloc.current_shares.toLocaleString()}
                </td>
                <td className="p-3 text-right text-stone-700 dark:text-gray-200 font-medium">
                  {alloc.target_shares.toLocaleString()}
                </td>
                <td className={`p-3 text-right font-semibold ${alloc.shares_delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : alloc.shares_delta < 0 ? 'text-orange-600 dark:text-orange-400' : 'text-stone-400 dark:text-gray-500'}`}>
                  {alloc.shares_delta > 0 ? '+' : ''}{alloc.shares_delta.toLocaleString()}
                </td>
                <td className="p-3 pr-0 text-right text-stone-600 dark:text-gray-300">
                  ${alloc.target_dollars.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-stone-200 dark:border-gray-700">
              <td className="p-3 pl-0 font-semibold text-stone-500 dark:text-gray-400">Unallocated Cash</td>
              <td className="p-3 text-right text-stone-400 dark:text-gray-400">-</td>
              <td className="p-3 text-right text-stone-400 dark:text-gray-400">-</td>
              <td className="p-3 text-right text-stone-400 dark:text-gray-400">-</td>
              <td className="p-3 text-right text-stone-400 dark:text-gray-400">-</td>
              <td className="p-3 pr-0 text-right font-medium text-stone-900 dark:text-white">
                ${leftoverCash.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
