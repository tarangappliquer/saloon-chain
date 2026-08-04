import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark, Button, Card, Input } from '@saloon/ui';
import { ApiError } from '../api/client';
import { useAuth } from '../features/auth/AuthContext';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  if (user) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
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
          <BrandMark label="Saloon Admin" subtitle="Management Portal Sign In" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            required
            type="email"
            label="Email Address"
            placeholder="admin@example.com"
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
            {submitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
