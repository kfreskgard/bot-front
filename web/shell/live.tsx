import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface LiveStatus { polling: boolean; failing: boolean; updatedAt: number | null }

interface LiveContextValue { status: LiveStatus | null; set: (s: LiveStatus | null) => void }

const LiveContext = createContext<LiveContextValue>({ status: null, set: () => {} });

const same = (a: LiveStatus | null, b: LiveStatus | null): boolean =>
  a === b || (a !== null && b !== null && a.polling === b.polling && a.failing === b.failing && a.updatedAt === b.updatedAt);

export function LiveProvider({ children, initial }: { children: ReactNode; initial?: LiveStatus | null }) {
  const [status, setStatus] = useState<LiveStatus | null>(initial ?? null);
  const set = (s: LiveStatus | null) => setStatus((prev) => (same(prev, s) ? prev : s));
  return <LiveContext value={{ status, set }}>{children}</LiveContext>;
}

export function useLiveStatus(): LiveStatus | null {
  return useContext(LiveContext).status;
}

export function useReportLive(s: LiveStatus | null): void {
  const { set } = useContext(LiveContext);
  const present = s !== null;
  const polling = s?.polling ?? false;
  const failing = s?.failing ?? false;
  const updatedAt = s?.updatedAt ?? null;
  useEffect(() => {
    set(present ? { polling, failing, updatedAt } : null);
  }, [present, polling, failing, updatedAt]);
  useEffect(() => () => set(null), []);
}
