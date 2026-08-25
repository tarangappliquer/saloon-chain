import { useActionState, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandMark, Button, Card, Input } from '@saloon/ui';
import { ApiError, getFieldError } from '../api/client';
import { useAuth } from '../features/auth/AuthContext';
import { routes } from '../routes';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (user) {
      navigate(routes.root, { replace: true });
    }
  }, [user, navigate]);

  const [submitState, handleSubmit, submitting] = useActionState<{ error: string | null; submitError: unknown }>(
    async () => {
      try {
        await login(email, password);
        navigate(routes.root);
        return { error: null, submitError: null };
      } catch (err) {
        return { error: err instanceof ApiError ? err.message : 'Something went wrong', submitError: err };
      }
    },
    { error: null, submitError: null },
  );
  const { error, submitError } = submitState;

  if (user) return null;

  return (
    <main className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 shadow-lift border-border bg-card">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark label="Saloon Admin" subtitle="Management Portal Sign In" />
        </div>

        <form action={handleSubmit} className="space-y-4">
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

        <div className="mt-6 text-center">
          <Link to={routes.forgotPassword} className="text-xs font-semibold text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
      </Card>
    </main>
  );
}
