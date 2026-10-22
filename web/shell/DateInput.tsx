import { useEffect, useRef, useState } from 'react';
import { isValidDate } from '../../shared/day.js';
import { navigate } from '../router.js';
import { hrefFor, type PageDef } from '../registry.js';

/** The date to go to for a typed value, or null when it is invalid, unchanged or after today. */
export function commitDate(draft: string, date: string, today: string): string | null {
  return isValidDate(draft) && draft !== date && draft <= today ? draft : null;
}

/**
 * The date to go to on a change event. A change without a preceding key press comes from the
 * picker and is committed at once; typed values wait for blur or Enter.
 */
export function changeCommit(value: string, date: string, today: string, typed: boolean): string | null {
  return typed ? null : commitDate(value, date, today);
}

/** Native date input: picker selections navigate at once, typed values on blur or Enter. */
export function DateInput({ page, date, today }: { page: PageDef; date: string; today: string }) {
  const [draft, setDraft] = useState(date);
  const typed = useRef(false);
  useEffect(() => setDraft(date), [date]);
  const go = (next: string) => {
    typed.current = false;
    navigate(hrefFor(page, next));
  };
  const commit = () => {
    typed.current = false;
    const next = commitDate(draft, date, today);
    if (next) go(next);
    else setDraft(date);
  };
  return (
    <input
      type="date"
      value={draft}
      max={today}
      onChange={(e) => {
        setDraft(e.target.value);
        const next = changeCommit(e.target.value, date, today, typed.current);
        if (next) go(next);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        else if (e.key !== 'Tab') typed.current = true;
      }}
    />
  );
}
