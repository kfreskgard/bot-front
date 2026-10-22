import type { ApiErrorBody, ApiErrorKind } from '../shared/types.js';

export type ClientErrorKind = ApiErrorKind | 'network';

export class ApiError extends Error {
  constructor(
    public status: number,
    public kind: ClientErrorKind,
    message: string,
    public since: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const KINDS: readonly string[] = ['badRequest', 'unauthorized', 'unreachable', 'error'];

function validSince(since: unknown): string | null {
  return typeof since === 'string' && !Number.isNaN(Date.parse(since)) ? since : null;
}

function isErrorBody(v: unknown): v is ApiErrorBody {
  if (typeof v !== 'object' || v === null) return false;
  const e = (v as { error?: unknown }).error;
  if (typeof e !== 'object' || e === null) return false;
  const { kind, message } = e as Record<string, unknown>;
  return (
    typeof kind === 'string' &&
    KINDS.includes(kind) &&
    typeof message === 'string'
  );
}

export async function fetchJson<T>(
  path: string,
  deps: { fetch?: typeof fetch; onUnauthorized?: () => void } = {},
): Promise<T> {
  const doFetch = deps.fetch ?? fetch;
  const onUnauthorized = deps.onUnauthorized ?? (() => location.assign('/login'));

  let res: Response;
  try {
    res = await doFetch(path, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  } catch {
    throw new ApiError(0, 'network', "Can't reach bot-front");
  }

  if (res.status === 401) {
    onUnauthorized();
    throw new ApiError(401, 'unauthorized', 'Not logged in');
  }

  let body: unknown;
  let parsed = true;
  try {
    body = JSON.parse(await res.text());
  } catch {
    parsed = false;
  }

  if (!res.ok) {
    if (parsed && isErrorBody(body)) {
      throw new ApiError(res.status, body.error.kind, body.error.message, validSince(body.error.since));
    }
    throw new ApiError(res.status, 'error', `HTTP ${res.status}`);
  }
  if (!parsed) throw new ApiError(res.status, 'error', 'Unexpected response from bot-front');
  return body as T;
}
