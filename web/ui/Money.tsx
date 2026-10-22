import { formatKr, formatPercent, formatPrice, formatTime } from '../../shared/format.js';

const signClass = (value: number): string =>
  value > 0 ? 'money pos' : value < 0 ? 'money neg' : 'money';

export function Money({ value }: { value: number }) {
  return <span className={signClass(value)}>{formatKr(value)}</span>;
}

export function Percent({ value }: { value: number }) {
  return <span className={signClass(value)}>{formatPercent(value)}</span>;
}

export function Price({ value }: { value: number }) {
  return <span className="price">{formatPrice(value)}</span>;
}

export function Time({ iso, seconds }: { iso: string; seconds?: boolean }) {
  return <time dateTime={iso}>{formatTime(iso, seconds)}</time>;
}
