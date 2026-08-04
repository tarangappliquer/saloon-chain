import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark, Button, Card, Input } from '@saloon/ui';
import { ApiError, getFieldError } from '../api/client';
import { useAuth } from '../features/auth/AuthContext';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
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
    setSubmitError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setSubmitError(err);
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
            error={getFieldError(submitError, 'email')}
          />
          <Input
            required
            type="password"
            label="Password"
            placeholder="••••••••"
            showPasswordIcon={true}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={getFieldError(submitError, 'password')}
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
