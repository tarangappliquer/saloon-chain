import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, getRefreshToken, setAuthToken, setRefreshToken, setUnauthorizedHandler } from '../../api/client';
import type { AuthResponse } from '../../api/types';

interface AuthUser {
  customerId: number;
  name: string;
  email: string;
  isEmulated: boolean;
  emulatedByName: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  updateName: (name: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'saloon_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  const persist = useCallback((res: AuthResponse) => {
    setAuthToken(res.token);
    setRefreshToken(res.refreshToken || null);
    const authUser: AuthUser = {
      customerId: res.userId,
      name: res.name,
      email: res.email,
      isEmulated: res.isEmulated,
      emulatedByName: res.emulatedByName,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    setUser(authUser);
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

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const value = useMemo(
    () => ({ user, login, register, loginWithToken, logout, updateName }),
    [user, login, register, loginWithToken, logout, updateName]
  );

  return (
    <AuthContext value={value}>
      {children}
    </AuthContext>
  );
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
