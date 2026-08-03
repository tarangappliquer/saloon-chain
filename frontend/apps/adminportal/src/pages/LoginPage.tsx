import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input } from '@saloon/ui';
import { ApiError } from '../api/client';
import { useAuth } from '../features/auth/AuthContext';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  if (user) return null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600 text-xl font-bold text-white shadow-lg shadow-purple-600/30">
            A
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Sign In</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            SuperAdmin, Admin, Manager, and Therapist access portal.
          </p>
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
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <Button type="submit" disabled={submitting} size="lg" className="w-full">
            Sign in
          </Button>
        </form>
      </Card>
    </main>
  );
}
