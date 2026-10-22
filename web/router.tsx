import { useSyncExternalStore, type AnchorHTMLAttributes, type JSX, type MouseEvent } from 'react';

export interface RouterLocation { path: string; query: URLSearchParams }

const NAVIGATE_EVENT = 'bf:navigate';
const SERVER_SNAPSHOT: RouterLocation = { path: '/', query: new URLSearchParams() };

let cachedHref: string | null = null;
let cachedLocation: RouterLocation = SERVER_SNAPSHOT;

function getSnapshot(): RouterLocation {
  if (location.href !== cachedHref) {
    cachedHref = location.href;
    cachedLocation = { path: location.pathname, query: new URLSearchParams(location.search) };
  }
  return cachedLocation;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

export function useLocation(): RouterLocation {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

export function navigate(href: string, opts: { replace?: boolean } = {}): void {
  const same = href === location.pathname + location.search;
  if (opts.replace || same) history.replaceState(null, '', href);
  else history.pushState(null, '', href);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function shouldIntercept(
  e: { button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean },
  link: { target: string; origin: string },
  pageOrigin: string,
): boolean {
  if (e.defaultPrevented || e.button !== 0) return false;
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false;
  if (link.target !== '' && link.target !== '_self') return false;
  return link.origin === pageOrigin;
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }): JSX.Element {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    const a = e.currentTarget;
    if (shouldIntercept(e, { target: a.target, origin: a.origin }, location.origin)) {
      e.preventDefault();
      navigate(href);
    }
  };
  return <a {...rest} href={href} onClick={handle} />;
}
