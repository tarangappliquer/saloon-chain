import { createContext, useContext, useState, type ReactNode } from 'react';
import { api, setAuthToken } from '../../api/client';
import type { AuthResponse } from '../../api/types';

interface AuthUser {
  customerId: number;
  name: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string) => Promise<void>;
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
    const authUser = { customerId: res.customerId, name: res.name, email: res.email };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    setUser(authUser);
  }

  async function login(email: string, password: string) {
    persist(await api.post<AuthResponse>('/api/auth/login', { email, password }));
  }

  async function register(name: string, email: string, password: string, phone?: string) {
    persist(await api.post<AuthResponse>('/api/auth/register', { name, email, password, phone }));
  }

  function logout() {
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
