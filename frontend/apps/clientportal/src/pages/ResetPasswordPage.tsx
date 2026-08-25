import { useActionState, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark, Button, Card, Input } from '@saloon/ui';
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
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
    <main className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-md p-6 sm:p-8 shadow-lift border-border bg-card/95 backdrop-blur-md rounded-3xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark label="Shoppey Saloon" subtitle="Choose a new password" />
        </div>

        {!token ? (
          <div className="space-y-4 text-center py-2">
            <p className="text-xs font-semibold text-destructive">This reset link is missing its token or has expired.</p>
            <Link to={routes.forgotPassword} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-xs text-foreground font-semibold">Your password has been successfully reset.</p>
            <Button onClick={() => navigate(routes.login)} size="lg" className="w-full">
              Sign in now
            </Button>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <Input
              required
              type="password"
              label="New Password"
              placeholder="••••••••"
              showPasswordIcon={true}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={getFieldError(submitError, 'newPassword')}
            />
            <Input
              required
              type="password"
              label="Confirm Password"
              placeholder="••••••••"
              showPasswordIcon={true}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" disabled={submitting} size="lg" className="w-full mt-2">
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </span>
              ) : (
                'Reset password'
              )}
            </Button>

            <div className="text-center pt-2">
              <Link to={routes.login} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </Link>
            </div>
          </form>
        )}
      </Card>
    </main>
  );
}
