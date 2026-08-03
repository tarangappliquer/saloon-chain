import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { AuthApi, BookingApi, CatalogApi, Configuration, ProfileApi } from '@saloon/api-client';

export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5127';
// Where the "Exit emulation" banner sends the browser back to -- separate Vite app/port
// (frontend/apps/adminportal), not reachable through API_BASE.
export const ADMIN_PORTAL_URL: string = import.meta.env.VITE_ADMIN_PORTAL_URL ?? 'http://localhost:58562';

const TOKEN_KEY = 'saloon_token';
const REFRESH_KEY = 'saloon_refresh_token';
let authToken: string | null = localStorage.getItem(TOKEN_KEY);
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function setRefreshToken(token: string | null) {
  refreshToken = token;
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

// A stale/expired token otherwise leaves the page stuck (the rejected request has nowhere to go) --
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

// Paths that must never trigger a refresh-and-retry: a 401 from /login or /register is a real
// credential rejection, and a 401 from /refresh itself means the refresh token is dead -- retrying
// either would just loop.
const NO_REFRESH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

// Concurrent requests that all 401 at once must share one refresh attempt, not each fire their own
// (which would race to redeem the same one-time-use refresh token and revoke each other's).
let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { token: string; refreshToken: string };
      setAuthToken(body.token);
      setRefreshToken(body.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

const axiosInstance = axios.create({ baseURL: API_BASE });

axiosInstance.interceptors.request.use((config) => {
  if (authToken) config.headers.set('Authorization', `Bearer ${authToken}`);
  return config;
});

axiosInstance.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isNoRefreshPath = NO_REFRESH_PATHS.some((p) => config?.url?.endsWith(p));

    if (error.response?.status === 401 && config && !config._retried && !isNoRefreshPath) {
      if (await tryRefresh()) {
        config._retried = true;
        return axiosInstance(config);
      }
    }

    if (error.response?.status === 401) onUnauthorized?.();
    // Backend error bodies are RFC7807 ProblemDetails (AppExceptionHandler) or a FluentValidation
    // ValidationProblem -- both carry `title`, never `message`. Falling back to `message` first
    // meant every real error (hold expired, slot taken, validation failure) surfaced as the bare
    // HTTP status text instead of the server's actual reason.
    const body = error.response?.data as { title?: string; message?: string } | undefined;
    throw new ApiError(error.response?.status ?? 0, body?.title ?? body?.message ?? error.message);
  },
);

const configuration = new Configuration();

export const authApi = new AuthApi(configuration, API_BASE, axiosInstance);
export const bookingApi = new BookingApi(configuration, API_BASE, axiosInstance);
export const catalogApi = new CatalogApi(configuration, API_BASE, axiosInstance);
export const profileApi = new ProfileApi(configuration, API_BASE, axiosInstance);
