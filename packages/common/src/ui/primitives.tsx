import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'night';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark disabled:bg-line-strong disabled:text-muted',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken disabled:text-muted',
  ghost: 'text-ink-2 hover:bg-sunken disabled:text-muted',
  danger: 'bg-crit text-white hover:opacity-90 disabled:bg-line-strong',
  night:
    'bg-night-3 text-night-text border border-night-line hover:bg-night-line disabled:opacity-50',
};
const SIZE = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
  xl: 'h-16 px-8 text-lg',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZE }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    />
  );
}

/* ---------- Badge ---------- */
type Tone = 'neutral' | 'ok' | 'warn' | 'crit' | 'info' | 'brand' | 'night' | 'sim';
const TONE: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2 border-line',
  ok: 'bg-ok-soft text-ok border-ok/20',
  warn: 'bg-warn-soft text-warn border-warn/25',
  crit: 'bg-crit-soft text-crit border-crit/25',
  info: 'bg-info-soft text-info border-info/20',
  brand: 'bg-brand-soft text-brand border-brand/20',
  night: 'bg-night-3 text-night-text border-night-line',
  sim: 'bg-white text-ink-2 border-dashed border-line-strong',
};
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const SEV_BG = ['', 'bg-sev1', 'bg-sev2', 'bg-sev3', 'bg-sev4', 'bg-sev5'];
export const SEV_LABEL = ['', 'Low', 'Minor', 'Moderate', 'High', 'Critical'];
export function SeverityBadge({ n }: { n: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2"
      title={`Severity ${n} of 5: ${SEV_LABEL[n]}`}
    >
      <span className={cx('h-2.5 w-2.5 rounded-full', SEV_BG[n])} aria-hidden />
      {n} · {SEV_LABEL[n]}
    </span>
  );
}

export function StatusDot({ on, tone }: { on?: boolean; tone?: 'ok' | 'warn' | 'crit' | 'off' }) {
  const t = tone ?? (on ? 'ok' : 'off');
  const c = { ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-crit', off: 'bg-line-strong' }[t];
  return <span className={cx('inline-block h-2 w-2 rounded-full', c)} aria-hidden />;
}

/* ---------- Panel / Stat ---------- */
export function Panel({
  title,
  action,
  children,
  className,
  pad = true,
  night = false,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
  night?: boolean;
}) {
  return (
    <section
      className={cx(
        'rounded-lg border shadow-card',
        night ? 'border-night-line bg-night-2 text-night-text' : 'border-line bg-surface',
        className,
      )}
    >
      {(title || action) && (
        <header
          className={cx(
            'flex items-center justify-between gap-3 border-b px-4 py-3',
            night ? 'border-night-line' : 'border-line',
          )}
        >
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  onClick,
  definition,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'crit' | 'warn' | 'ok';
  onClick?: () => void;
  definition?: string;
}) {
  const body = (
    <>
      <p className="flex items-center gap-1 text-xs font-medium text-muted" title={definition}>
        {label}
        {definition && (
          <span className="rounded-full border border-line-strong px-1 text-[10px] leading-4">
            ?
          </span>
        )}
      </p>
      <p
        className={cx(
          'tabular mt-1 text-2xl font-semibold',
          tone === 'crit' && 'text-crit',
          tone === 'warn' && 'text-warn',
          tone === 'ok' && 'text-ok',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </>
  );
  const cls = 'rounded-lg border border-line bg-surface p-4 text-left shadow-card';
  return onClick ? (
    <button
      onClick={onClick}
      className={cx(cls, 'transition-colors hover:border-line-strong hover:bg-sunken')}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ---------- Forms ---------- */
const FIELD =
  'rounded-md border border-line-strong bg-surface px-3 text-ink placeholder:text-muted focus:border-brand';
const widthOf = (c?: string) => (c && /(^|\s)w-\S+/.test(c) ? '' : 'w-full');
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block text-sm font-medium text-ink-2', className)}>
      {label}
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}
export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(FIELD, 'h-10', widthOf(className), className)} />;
}
export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(FIELD, 'h-10', widthOf(className), className)} />;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(FIELD, 'py-2', widthOf(className), className)} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  night = false,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  night?: boolean;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        'inline-flex rounded-md border p-0.5',
        night ? 'border-night-line bg-night' : 'border-line bg-sunken',
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          aria-label={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded px-3 py-1 text-sm font-medium transition-colors',
            value === o.value
              ? night
                ? 'bg-night-3 text-white'
                : 'bg-surface text-ink shadow-card'
              : night
                ? 'text-night-muted hover:text-white'
                : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- States ---------- */
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 p-4 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
      {label}
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-line-strong">{icon}</div>}
      <p className="text-sm font-semibold text-ink-2">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-md border border-crit/30 bg-crit-soft p-3 text-sm text-crit"
    >
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded bg-sunken', className)} />;
}

export function Progress({
  value,
  tone = 'brand',
}: {
  value: number;
  tone?: 'brand' | 'ok' | 'warn';
}) {
  const c = { brand: 'bg-brand', ok: 'bg-ok', warn: 'bg-warn' }[tone];
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-sunken"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx('h-full rounded-full', c)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
