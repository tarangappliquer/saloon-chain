import { createContext, use, useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { authApi, getRefreshToken, setAuthToken, setRefreshToken, setUnauthorizedHandler } from '../../api/client';
import { profileStreamUrl, subscribeToStream } from '../../api/sseClient';
import type { AuthResponse, UserRole } from '../../api/types';

interface AuthUser {
  userId: number;
  name: string;
  email: string;
  role: UserRole;
  canEmulate: boolean;
  photoPath: string | null;
  photoVersion: number;
  isEmailVerified: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateName: (name: string) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'saloon_admin_user';

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

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.apiAuthLoginPost({ email, password, portal: 'Admin' });
    const res = data as unknown as AuthResponse;

    setAuthToken(res.token);
    setRefreshToken(res.refreshToken);
    const authUser: AuthUser = {
      userId: res.userId,
      name: res.name,
      email: res.email,
      role: res.role,
      canEmulate: res.canEmulate,
      photoPath: res.photoPath ?? null,
      photoVersion: Date.now(),
      isEmailVerified: res.isEmailVerified,
    };
    writeUser(authUser);
  }, []);

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

  const userId = user?.userId;
  useEffect(() => {
    if (!userId) return;
    return subscribeToStream(profileStreamUrl(userId), 'user-logged-out', logout);
  }, [userId, logout]);

  const value = useMemo(
    () => ({ user, login, logout, updateName, refreshUser }),
    [user, login, logout, updateName, refreshUser]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
