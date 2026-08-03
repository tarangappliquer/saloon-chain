import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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

  function persist(res: AuthResponse) {
    setAuthToken(res.token);
    // Emulation sessions (via loginWithToken/GET /me) carry no refresh token by design -- the
    // backend returns "" there, which clears any leftover token rather than storing a bogus one.
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
  }

  async function login(email: string, password: string) {
    const { data } = await authApi.apiAuthLoginPost({ email, password });
    persist(data as unknown as AuthResponse);
  }

  async function register(name: string, email: string, password: string, phone?: string) {
    const { data } = await authApi.apiAuthRegisterPost({ name, email, password, phone: phone ?? null });
    persist(data as unknown as AuthResponse);
  }

  // Entry point for a staff-initiated emulation session: the adminportal already exchanged its
  // session for this customer token and redirected here with it. GET /api/auth/me (using that
  // token) is what fills in the profile and impersonation banner -- nothing PII-bearing travels
  // through the URL itself.
  async function loginWithToken(token: string) {
    setAuthToken(token);
    try {
      const { data } = await authApi.apiAuthMeGet();
      persist({ ...(data as unknown as AuthResponse), token });
    } catch (err) {
      // Don't leave a bad token behind -- it would otherwise get sent as Authorization on every
      // subsequent request from this browser (e.g. a later legitimate login) until overwritten.
      setAuthToken(null);
      throw err;
    }
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

  // Called after a successful ProfilePage save so the nav bar (and anywhere else that reads
  // user.name) reflects the edit immediately, without waiting for the next login.
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

  return (
    <AuthContext.Provider value={{ user, login, register, loginWithToken, logout, updateName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
