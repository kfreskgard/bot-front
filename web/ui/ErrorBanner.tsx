import type { ReactNode } from 'react';

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <p className="banner" role="alert">
      {children}
    </p>
  );
}
