import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, getRefreshToken, setAuthToken, setRefreshToken, setUnauthorizedHandler } from '../../api/client';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const logout = useCallback(() => {
    const token = getRefreshToken();
    if (token) authApi.apiAuthLogoutPost({ refreshToken: token }).catch(() => {});

    setAuthToken(null);
    setRefreshToken(null);
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const updateName = useCallback((name: string) => {
    setUser((u) => {
      if (!u) return u;
      const updated = { ...u, name };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Re-fetches the caller's own record from GET /api/auth/me (rather than trusting client-held
  // state) so the top-nav avatar picks up a just-uploaded photo, and the email-verification gate
  // picks up a just-confirmed email, from the server's source of truth.
  const refreshUser = useCallback(async () => {
    const { data } = await authApi.apiAuthMeGet();
    const res = data as unknown as AuthResponse;
    setUser((u) => {
      if (!u) return u;
      const updated = { ...u, photoPath: res.photoPath, photoVersion: Date.now(), isEmailVerified: res.isEmailVerified };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const value = useMemo(
    () => ({ user, login, logout, updateName, refreshUser }),
    [user, login, logout, updateName, refreshUser]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
