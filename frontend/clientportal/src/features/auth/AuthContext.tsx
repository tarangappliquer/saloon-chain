import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setAuthToken, setUnauthorizedHandler } from '../../api/client';
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
    persist(await api.post<AuthResponse>('/api/auth/login', { email, password }));
  }

  async function register(name: string, email: string, password: string, phone?: string) {
    persist(await api.post<AuthResponse>('/api/auth/register', { name, email, password, phone }));
  }

  // Entry point for a staff-initiated emulation session: the adminportal already exchanged its
  // session for this customer token and redirected here with it. GET /api/auth/me (using that
  // token) is what fills in the profile and impersonation banner -- nothing PII-bearing travels
  // through the URL itself.
  async function loginWithToken(token: string) {
    setAuthToken(token);
    try {
      persist({ ...(await api.get<AuthResponse>('/api/auth/me')), token });
    } catch (err) {
      // Don't leave a bad token behind -- it would otherwise get sent as Authorization on every
      // subsequent request from this browser (e.g. a later legitimate login) until overwritten.
      setAuthToken(null);
      throw err;
    }
  }

  function logout() {
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, loginWithToken, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
