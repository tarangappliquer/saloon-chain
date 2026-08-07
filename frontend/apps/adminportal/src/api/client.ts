import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  AdminBookingsApi,
  AdminCatalogApi,
  AdminCustomersApi,
  AdminDashboardApi,
  AdminStaffApi,
  AuthApi,
  CatalogApi,
  ConfigApi,
  Configuration,
  PaymentApi,
  ProfileApi,
  SchedulingApi,
} from '@saloon/api-client';
import { appConfig } from '../config';

export const API_BASE: string = appConfig.apiBaseUrl;

const TOKEN_KEY = 'saloon_admin_token';
const REFRESH_KEY = 'saloon_admin_refresh_token';
let authToken: string | null = localStorage.getItem(TOKEN_KEY);
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);

export function getAuthToken(): string | null {
  return authToken;
}

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

// A stale/expired token otherwise leaves every page stuck on "Loading..." forever (the rejected
// request has nowhere to go) -- AuthProvider registers logout() here once, so a 401 from any request
// anywhere drops the user back to /login instead of silently hanging.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  status: number;
  // Populated only for a FluentValidation 400 (ASP.NET's ValidationProblemDetails `errors` dict,
  // keyed by the C# request property name e.g. "Email", "Password") -- undefined for every other
  // error shape (plain ProblemDetails, network failure, etc).
  fieldErrors?: Record<string, string[]>;
  constructor(status: number, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

// Case-insensitive lookup into ApiError.fieldErrors -- ASP.NET keys errors by the C# property name
// (PascalCase, e.g. "Email"), which rarely matches a form's own field-name casing exactly. Returns
// the first message for that field, or undefined if the error wasn't a validation error / didn't
// name this field.
export function getFieldError(err: unknown, field: string): string | undefined {
  if (!(err instanceof ApiError) || !err.fieldErrors) return undefined;
  const key = Object.keys(err.fieldErrors).find((k) => k.toLowerCase() === field.toLowerCase());
  return key ? err.fieldErrors[key][0] : undefined;
}

// Paths that must never trigger a refresh-and-retry: a 401 from /login is a real credential
// rejection, and a 401 from /refresh itself means the refresh token is dead -- retrying either
// would just loop.
const NO_REFRESH_PATHS = ['/api/auth/login', '/api/auth/refresh'];

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

// Not exported -- every request must go through the generated api-client classes below (adminBookingsApi,
// adminCatalogApi, etc), never a raw axiosInstance.get/post/put/delete call from page code. This instance
// exists only to wire the shared auth/refresh-token interceptors into those classes' constructors.
const axiosInstance = axios.create({ baseURL: API_BASE });

// Public, no-auth endpoints -- attaching a Bearer token here would still work (the backend ignores
// it), but it turns a same-origin-safe GET into one needing a CORS preflight (Authorization is a
// non-simple header) and makes the server validate a token nobody asked for, on every single call.
const NO_AUTH_HEADER_PATHS = ['/api/config/adminportal', '/api/config/clientportal', '/health'];

axiosInstance.interceptors.request.use((config) => {
  const isPublicPath = NO_AUTH_HEADER_PATHS.some((p) => config.url?.endsWith(p));
  if (authToken && !isPublicPath) config.headers.set('Authorization', `Bearer ${authToken}`);
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
    const body = error.response?.data as { title?: string; detail?: string, message?: string; errors?: Record<string, string[]> } | undefined;
    throw new ApiError(error.response?.status ?? 0, body?.detail ?? body?.title ?? body?.message ?? error.message, body?.errors);
  },
);

const configuration = new Configuration();

export const adminBookingsApi = new AdminBookingsApi(configuration, API_BASE, axiosInstance);
export const adminCatalogApi = new AdminCatalogApi(configuration, API_BASE, axiosInstance);
export const catalogApi = new CatalogApi(configuration, API_BASE, axiosInstance);
export const adminCustomersApi = new AdminCustomersApi(configuration, API_BASE, axiosInstance);
export const adminDashboardApi = new AdminDashboardApi(configuration, API_BASE, axiosInstance);
export const adminStaffApi = new AdminStaffApi(configuration, API_BASE, axiosInstance);
export const authApi = new AuthApi(configuration, API_BASE, axiosInstance);
export const configApi = new ConfigApi(configuration, API_BASE, axiosInstance);
export const paymentApi = new PaymentApi(configuration, API_BASE, axiosInstance);
export const profileApi = new ProfileApi(configuration, API_BASE, axiosInstance);
export const schedulingApi = new SchedulingApi(configuration, API_BASE, axiosInstance);

