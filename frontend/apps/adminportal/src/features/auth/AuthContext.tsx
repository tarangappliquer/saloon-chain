import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, authApi, getRefreshToken, setAuthToken, setRefreshToken, setUnauthorizedHandler } from '../../api/client';
import type { AuthResponse, UserRole } from '../../api/types';

interface AuthUser {
  userId: number;
  name: string;
  email: string;
  role: UserRole;
  canEmulate: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateName: (name: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'saloon_admin_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  async function login(email: string, password: string) {
    const { data } = await authApi.apiAuthLoginPost({ email, password });
    const res = data as unknown as AuthResponse;
    if (res.role === 'Customer') {
      throw new ApiError(403, 'This account is not authorized for the admin portal.');
    }

    setAuthToken(res.token);
    setRefreshToken(res.refreshToken);
    const authUser: AuthUser = {
      userId: res.userId,
      name: res.name,
      email: res.email,
      role: res.role,
      canEmulate: res.canEmulate,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    setUser(authUser);
  }

  function logout() {
    // Best-effort, fire-and-forget: revokes the refresh token server-side so a copy left behind
    // (e.g. in browser storage on a shared machine) can't still redeem /api/auth/refresh after
    // sign-out. Local state clears immediately either way -- this must never block logout.
    const token = getRefreshToken();
    if (token) authApi.apiAuthLogoutPost({ refreshToken: token }).catch(() => {});

    setAuthToken(null);
    setRefreshToken(null);
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  // Called after a successful ProfilePage save so the "name · role" in the nav bar reflects the
  // edit immediately, without waiting for the next login.
  function updateName(name: string) {
    setUser((u) => {
      if (!u) return u;
      const updated = { ...u, name };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AuthContext.Provider value={{ user, login, logout, updateName }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
