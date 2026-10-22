import { formatKr } from '../../shared/format.js';

export function SimValue({ value }: { value: number }) {
  return (
    <span className="sim">
      ≈ {formatKr(value)}
      <span className="sim-badge">SIM</span>
    </span>
  );
}
