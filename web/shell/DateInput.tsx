import { useEffect, useState } from 'react';
import { isValidDate } from '../../shared/day.js';
import { navigate } from '../router.js';
import { hrefFor, type PageDef } from '../registry.js';

/** The date to go to for a typed value, or null when it is invalid, unchanged or after today. */
export function commitDate(draft: string, date: string, today: string): string | null {
  return isValidDate(draft) && draft !== date && draft <= today ? draft : null;
}

/** Native date input that navigates only on blur or Enter, never on intermediate typed values. */
export function DateInput({ page, date, today }: { page: PageDef; date: string; today: string }) {
  const [draft, setDraft] = useState(date);
  useEffect(() => setDraft(date), [date]);
  const commit = () => {
    const next = commitDate(draft, date, today);
    if (next) navigate(hrefFor(page, next));
    else setDraft(date);
  };
  return (
    <input
      type="date"
      value={draft}
      max={today}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}
