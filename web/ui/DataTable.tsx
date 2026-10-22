import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  mobileLabel?: string;
  hideOnPhone?: boolean;
  role?: 'title' | 'aside';
  className?: (row: T) => string | undefined;
}

function classes(...parts: Array<string | false | undefined>): string | undefined {
  const joined = parts.filter(Boolean).join(' ');
  return joined === '' ? undefined : joined;
}

export function DataTable<T>(p: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  rowClass?: (r: T) => string | undefined;
  empty?: ReactNode;
}) {
  if (p.rows.length === 0) return <>{p.empty}</>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          {p.columns.map((c) => (
            <th key={c.key} className={classes(c.align === 'right' && 'num', c.hideOnPhone && 'phone-hidden')}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {p.rows.map((r) => (
          <tr key={p.rowKey(r)} className={p.rowClass?.(r)}>
            {p.columns.map((c) => (
              <td
                key={c.key}
                data-label={c.mobileLabel ?? c.header}
                className={classes(
                  c.align === 'right' && 'num',
                  c.hideOnPhone && 'phone-hidden',
                  c.role === 'title' && 'cell-title',
                  c.role === 'aside' && 'cell-aside',
                  c.className?.(r),
                )}
              >
                {c.cell(r)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
