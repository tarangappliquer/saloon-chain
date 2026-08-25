import { useActionState, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark, Button, Card, Input } from '@saloon/ui';
import { authApi, ApiError, getFieldError } from '../api/client';
import { routes } from '../routes';

interface ResetPasswordState {
  error: string | null;
  submitError: unknown;
  done: boolean;
}

const INITIAL_RESET_STATE: ResetPasswordState = { error: null, submitError: null, done: false };

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [{ error, submitError, done }, handleSubmit, submitting] = useActionState<ResetPasswordState>(async () => {
    if (!token) return INITIAL_RESET_STATE;

    if (password !== confirmPassword) {
      return { error: 'Passwords do not match.', submitError: null, done: false };
    }

    try {
      await authApi.apiAuthResetPasswordPost({ token, newPassword: password });
      return { error: null, submitError: null, done: true };
    } catch (err) {
      return { error: err instanceof ApiError ? err.message : 'Something went wrong', submitError: err, done: false };
    }
  }, INITIAL_RESET_STATE);

  return (
    <main className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 shadow-lift border-border bg-card">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark label="Saloon Admin" subtitle="Choose a new password" />
        </div>

        {!token ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-destructive">This reset link is missing its token.</p>
            <Link to={routes.forgotPassword} className="inline-block text-xs font-semibold text-primary hover:underline">
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-foreground">Your password has been reset.</p>
            <Button onClick={() => navigate(routes.login)} size="lg" className="w-full">
              Sign in
            </Button>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <Input
              required
              type="password"
              label="New Password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={getFieldError(submitError, 'newPassword')}
            />
            <Input
              required
              type="password"
              label="Confirm Password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" disabled={submitting} size="lg" className="w-full mt-2">
              {submitting ? 'Saving...' : 'Reset password'}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
