import type { ReactNode } from 'react';

export function Stale({ children }: { children: ReactNode }) {
  return <div className="stale">{children}</div>;
}
