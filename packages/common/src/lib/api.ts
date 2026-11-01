/** Thin client for the central FastAPI backend. Same host as the page, port 8000, unless VITE_API_URL is set. */
const env = import.meta.env as Record<string, string | undefined>;
export const API_BASE: string =
  env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8000/api`;

const TOKEN_KEY = 'sw.token';
export const auth = {
  token: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const d = (body as { detail?: unknown } | null)?.detail;
    throw new ApiError(res.status, typeof d === 'string' ? d : `Request failed (${res.status})`);
  }
  return body;
}

export async function api<T>(
  path: string,
  opts: { method?: string; json?: unknown; form?: FormData; authed?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const t = auth.token();
  if (t && opts.authed !== false) headers.Authorization = `Bearer ${t}`;
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? (body ? 'POST' : 'GET'),
    headers,
    body,
  });
  if (res.status === 401 && t) auth.clear();
  return (await parse(res)) as T;
}

/** Evidence/preview URLs from the API are relative to the server root ("/api/..."). */
export function absUrl(p: string): string {
  const origin = new URL(API_BASE, window.location.href).origin;
  return p.startsWith('http') ? p : `${origin}${p}`;
}

export function wsUrl(): string {
  const u = new URL(API_BASE, window.location.href);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${u.origin}/api/ws?token=${encodeURIComponent(auth.token() ?? '')}`;
}

export interface User {
  id: number;
  username: string;
  role: 'worker' | 'responder' | 'manager' | 'admin';
  department: string | null;
  name?: string | null;
}

export async function login(username: string, password: string): Promise<User> {
  const r = await api<{ token: string; user: User }>('/auth/login', {
    json: { username, password },
    authed: false,
  });
  auth.set(r.token);
  localStorage.setItem('sw.user', JSON.stringify(r.user));
  return r.user;
}

export function currentUser(): User | null {
  if (!auth.token()) return null;
  try {
    return JSON.parse(localStorage.getItem('sw.user') ?? 'null') as User | null;
  } catch {
    return null;
  }
}

export function logout(): void {
  auth.clear();
  localStorage.removeItem('sw.user');
}
