import { cn } from '@/lib/cn';

type UsageRow = {
  metric: string;
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  percentUsed: number | null;
};

function formatValue(metric: string, value: number): string {
  if (metric !== 'storage_bytes') return value.toLocaleString();
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Usage against plan limits, with the bar coloured by how close it is. */
export function UsageMeters({ usage }: { usage: UsageRow[] }) {
  return (
    <ul className="space-y-4">
      {usage.map((row) => {
        const percent = row.percentUsed ?? 0;
        const tone =
          row.limit === 0
            ? 'bg-ink-300'
            : percent >= 100
              ? 'bg-red-500'
              : percent >= 80
                ? 'bg-amber-500'
                : 'bg-brand-600';

        return (
          <li key={row.metric}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-ink-800">{row.label}</span>
              <span className="text-sm tabular-nums text-ink-600">
                {formatValue(row.metric, row.used)}
                {row.limit === null ? (
                  <span className="text-ink-400"> / unlimited</span>
                ) : (
                  <span className="text-ink-400"> / {formatValue(row.metric, row.limit)}</span>
                )}
              </span>
            </div>

            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100"
              role="meter"
              aria-valuenow={row.used}
              aria-valuemin={0}
              {...(row.limit !== null ? { 'aria-valuemax': row.limit } : {})}
              aria-label={row.label}
            >
              <div
                className={cn('h-full rounded-full transition-all', tone)}
                style={{ width: row.limit === null ? '8%' : `${Math.min(percent, 100)}%` }}
              />
            </div>

            {row.limit === 0 ? (
              <p className="mt-1 text-xs text-ink-500">Not included on your plan.</p>
            ) : percent >= 80 && row.limit !== null ? (
              <p className="mt-1 text-xs font-medium text-amber-700">
                {row.remaining === 0 ? 'Limit reached for this month.' : `${row.remaining} left this month.`}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
