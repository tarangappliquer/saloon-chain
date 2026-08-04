import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark, Button, Card, Input } from '@saloon/ui';
import { ApiError } from '../api/client';
import { useAuth } from '../features/auth/AuthContext';

export function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/my-bookings', { replace: true });
    }
  }, [user, navigate]);

  if (user) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
      navigate('/my-bookings');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 shadow-lift border-border bg-card">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark
            label="Saloon"
            subtitle={mode === 'login' ? 'Sign in to manage your appointments' : 'Register to start booking treatments'}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <Input
              required
              label="Full Name"
              placeholder="e.g. Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <Input
            required
            type="email"
            label="Email Address"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            required
            type="password"
            label="Password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" disabled={submitting} size="lg" className="w-full mt-2">
            {submitting ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode(mode === 'login' ? 'register' : 'login');
            }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
          </button>
        </div>
      </Card>
    </main>
  );
}
