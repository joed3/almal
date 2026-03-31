interface MetricCardProps {
  label: string;
  value: string;
  positive?: boolean | null; // true = green, false = red, null = neutral
}

export default function MetricCard({ label, value, positive = null }: MetricCardProps) {
  const valueColor =
    positive === true
      ? 'text-green-400'
      : positive === false
        ? 'text-red-400'
        : 'text-white';

  return (
    <div className="bg-gray-800 rounded-lg px-4 py-3 flex flex-col gap-1 min-w-[120px]">
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`text-lg font-semibold ${valueColor}`}>{value}</span>
    </div>
  );
}
