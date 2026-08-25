import { createContext, use, useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { authApi, getRefreshToken, setAuthToken, setRefreshToken, setUnauthorizedHandler } from '../../api/client';
import { profileStreamUrl, subscribeToStream } from '../../api/sseClient';
import type { AuthResponse } from '../../api/types';

interface AuthUser {
  customerId: number;
  name: string;
  email: string;
  isEmulated: boolean;
  emulatedByName: string | null;
  // Only meaningful when isEmulated -- the emulating staff member's own scope, used to restrict
  // the saloon/location picker to what they're actually authorized to book at.
  emulatorChainId: number | null;
  emulatorLocationId: number | null;
  photoPath: string | null;
  photoVersion: number;
  isEmailVerified: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  updateName: (name: string) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'saloon_user';

// Tiny external store over localStorage[STORAGE_KEY] for useSyncExternalStore. A plain
// `window.addEventListener('storage', ...)` only fires in *other* tabs -- the tab that calls
// localStorage.setItem never gets its own 'storage' event -- so writes from this tab notify the
// in-memory listener set directly, while readUser() re-checks the raw string on every call so a
// genuine cross-tab 'storage' event (e.g. another tab logging out) is picked up too. This also
// fixes a real bug the previous plain useState-mirrors-localStorage version had: another tab
// logging out never updated this tab (only the SSE 'user-logged-out' listener did).
type StoreListener = () => void;
const storeListeners = new Set<StoreListener>();
let cachedRaw: string | null | undefined;
let cachedSnapshot: AuthUser | null = null;

function readUser(): AuthUser | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSnapshot = raw ? (JSON.parse(raw) as AuthUser) : null;
  }
  return cachedSnapshot;
}

function writeUser(user: AuthUser | null) {
  if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(STORAGE_KEY);
  cachedRaw = localStorage.getItem(STORAGE_KEY);
  cachedSnapshot = user;
  storeListeners.forEach((listener) => listener());
}

function subscribeToUserStore(listener: StoreListener) {
  storeListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    storeListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(subscribeToUserStore, readUser);

  const persist = useCallback((res: AuthResponse) => {
    setAuthToken(res.token);
    setRefreshToken(res.refreshToken || null);
    const authUser: AuthUser = {
      customerId: res.userId,
      name: res.name,
      email: res.email,
      isEmulated: res.isEmulated,
      emulatedByName: res.emulatedByName,
      emulatorChainId: res.emulatorChainId,
      emulatorLocationId: res.emulatorLocationId,
      photoPath: res.photoPath ?? null,
      photoVersion: Date.now(),
      isEmailVerified: res.isEmailVerified,
    };
    writeUser(authUser);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.apiAuthLoginPost({ email, password });
    persist(data as unknown as AuthResponse);
  }, [persist]);

  const register = useCallback(async (name: string, email: string, password: string, phone?: string) => {
    const { data } = await authApi.apiAuthRegisterPost({ name, email, password, phone: phone ?? null });
    persist(data as unknown as AuthResponse);
  }, [persist]);

  const loginWithToken = useCallback(async (token: string) => {
    setAuthToken(token);
    try {
      const { data } = await authApi.apiAuthMeGet();
      persist({ ...(data as unknown as AuthResponse), token });
    } catch (err) {
      setAuthToken(null);
      throw err;
    }
  }, [persist]);

  const logout = useCallback(() => {
    const token = getRefreshToken();
    if (token) authApi.apiAuthLogoutPost({ refreshToken: token }).catch(() => {});

    setAuthToken(null);
    setRefreshToken(null);
    writeUser(null);
  }, []);

  const updateName = useCallback((name: string) => {
    const current = readUser();
    if (!current) return;
    writeUser({ ...current, name });
  }, []);

  // Re-fetches the caller's own record from GET /api/auth/me (rather than trusting client-held
  // state) so the top-nav avatar picks up a just-uploaded photo, and the email-verification gate
  // picks up a just-confirmed email, from the server's source of truth.
  const refreshUser = useCallback(async () => {
    const { data } = await authApi.apiAuthMeGet();
    const res = data as unknown as AuthResponse;
    const current = readUser();
    if (!current) return;
    writeUser({ ...current, photoPath: res.photoPath, photoVersion: Date.now(), isEmailVerified: res.isEmailVerified });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const customerId = user?.customerId;
  useEffect(() => {
    if (!customerId) return;
    return subscribeToStream(profileStreamUrl(customerId), 'user-logged-out', logout);
  }, [customerId, logout]);

  const value = useMemo(
    () => ({ user, login, register, loginWithToken, logout, updateName, refreshUser }),
    [user, login, register, loginWithToken, logout, updateName, refreshUser]
  );

  return (
    <AuthContext value={value}>
      {children}
    </AuthContext>
  );
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
