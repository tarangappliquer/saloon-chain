export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5127';
// Where the "Exit emulation" banner sends the browser back to -- separate Vite app/port
// (frontend/adminportal), not reachable through API_BASE.
export const ADMIN_PORTAL_URL: string = import.meta.env.VITE_ADMIN_PORTAL_URL ?? 'http://localhost:58562';

const TOKEN_KEY = 'saloon_token';
let authToken: string | null = localStorage.getItem(TOKEN_KEY);

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// A stale/expired token otherwise leaves the page stuck (the rejected fetch has nowhere to go) --
// AuthProvider registers logout() here once, so a 401 from any request drops the user back to
// /login instead of silently hanging.
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
    // Backend error bodies are RFC7807 ProblemDetails (AppExceptionHandler) or a FluentValidation
    // ValidationProblem -- both carry `title`, never `message`. Falling back to `message` first
    // meant every real error (hold expired, slot taken, validation failure) surfaced as the bare
    // HTTP status text instead of the server's actual reason.
    throw new ApiError(res.status, body?.title ?? body?.message ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
