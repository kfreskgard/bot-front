import type { ReactNode } from 'react';

export function Kpi({
  label,
  children,
  sub,
  variant,
}: {
  label: string;
  children: ReactNode;
  sub?: ReactNode;
  variant?: 'sim';
}) {
  return (
    <div className={variant === 'sim' ? 'kpi kpi--sim' : 'kpi'}>
      <div className="kpi-label">
        {label}
        {variant === 'sim' && <span className="sim-badge">SIM</span>}
      </div>
      <div className="kpi-value">{children}</div>
      {sub !== undefined && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function KpiStrip({ children }: { children: ReactNode }) {
  return <div className="kpis">{children}</div>;
}
