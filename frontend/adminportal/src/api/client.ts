export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5127';
// Where /customers redirects the browser to hand off an emulation token -- separate Vite app/port
// (frontend/clientportal), not reachable through API_BASE.
export const CLIENT_PORTAL_URL: string = import.meta.env.VITE_CLIENT_PORTAL_URL ?? 'http://localhost:58569';

const TOKEN_KEY = 'saloon_admin_token';
let authToken: string | null = localStorage.getItem(TOKEN_KEY);

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// A stale/expired token otherwise leaves every page stuck on "Loading..." forever (the rejected
// fetch has nowhere to go) -- AuthProvider registers logout() here once, so a 401 from any request
// anywhere drops the user back to /login instead of silently hanging.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.title ?? body?.message ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
