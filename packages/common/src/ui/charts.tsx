import { cx } from './primitives';

/** Small dependency-free SVG charts. Every mark that stands for a filter is a button, so charts drill down. */

export interface Datum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

export function BarList({
  data,
  onPick,
  color = 'bg-ink-2',
  empty = 'No data in this period.',
}: {
  data: Datum[];
  onPick?: (d: Datum) => void;
  color?: string;
  empty?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="py-4 text-sm text-muted">{empty}</p>;
  return (
    <ul className="grid gap-1.5">
      {data.map((d) => {
        const row = (
          <>
            <span className="truncate text-sm text-ink-2">{d.label}</span>
            <span className="h-2 rounded-full bg-sunken">
              <span
                className={cx('block h-2 rounded-full', d.color ?? color)}
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </span>
            <span className="tabular text-right text-sm font-semibold">{d.value}</span>
          </>
        );
        const cls =
          'grid grid-cols-[minmax(7rem,11rem)_1fr_2rem] items-center gap-3 rounded px-1 py-0.5 text-left';
        return (
          <li key={d.key}>
            {onPick ? (
              <button
                className={cx(cls, 'w-full hover:bg-sunken')}
                onClick={() => onPick(d)}
                title={`Show ${d.label}`}
              >
                {row}
              </button>
            ) : (
              <div className={cls}>{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Donut({
  data,
  onPick,
  size = 150,
}: {
  data: Datum[];
  onPick?: (d: Datum) => void;
  size?: number;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let off = 0;
  if (!total) return <p className="py-4 text-sm text-muted">No data in this period.</p>;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label="Distribution">
        <g transform="rotate(-90 70 70)">
          {data.map((d) => {
            const len = (d.value / total) * c;
            const el = (
              <circle
                key={d.key}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={d.color ?? '#44403c'}
                strokeWidth="22"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-off}
                className={onPick ? 'cursor-pointer' : ''}
                onClick={() => onPick?.(d)}
              >
                <title>{`${d.label}: ${d.value}`}</title>
              </circle>
            );
            off += len;
            return el;
          })}
        </g>
        <text x="70" y="68" textAnchor="middle" className="fill-ink text-[22px] font-semibold">
          {total}
        </text>
        <text x="70" y="86" textAnchor="middle" className="fill-muted text-[9px]">
          incidents
        </text>
      </svg>
      <ul className="grid gap-1 text-sm">
        {data.map((d) => (
          <li key={d.key}>
            <button
              className="flex items-center gap-2 rounded px-1 hover:bg-sunken"
              onClick={() => onPick?.(d)}
              disabled={!onPick}
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: d.color ?? '#44403c' }}
              />
              <span className="text-ink-2">{d.label}</span>
              <span className="tabular font-semibold">{d.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stacked daily columns; each column is clickable (opens that day). */
export function Columns({
  days,
  series,
  onPick,
  height = 150,
}: {
  days: string[];
  series: { key: string; label: string; color: string; values: number[] }[];
  onPick?: (day: string) => void;
  height?: number;
}) {
  const totals = days.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  if (!days.length) return <p className="py-4 text-sm text-muted">No data in this period.</p>;
  return (
    <div>
      <div
        className="flex items-end gap-1"
        style={{ height }}
        role="img"
        aria-label="Incidents per day"
      >
        {days.map((d, i) => (
          <button
            key={d}
            onClick={() => onPick?.(d)}
            title={`${d}: ${totals[i]} incidents`}
            className="flex h-full flex-1 flex-col-reverse overflow-hidden rounded-t hover:opacity-80"
          >
            {series.map((s) => (
              <span
                key={s.key}
                style={{ height: `${((s.values[i] ?? 0) / max) * 100}%`, background: s.color }}
              />
            ))}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{days[0]}</span>
        <span>{days[days.length - 1]}</span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-3 text-xs text-ink-2">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sparkline({ values, color = '#44403c' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - (v / max) * 26}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-24" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
