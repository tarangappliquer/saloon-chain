import { useActionState, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark, Button, Card, Input } from '@saloon/ui';
import { authApi, ApiError } from '../api/client';
import { routes } from '../routes';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [{ submitted, error }, handleSubmit, submitting] = useActionState<{ submitted: boolean; error: string | null }>(
    async () => {
      try {
        await authApi.apiAuthForgotPasswordPost({ email });
        // Always shows the same success state, whether or not the email is registered -- matches the
        // API's own behavior (always 200), so this page can't be used to enumerate accounts either.
        return { submitted: true, error: null };
      } catch (err) {
        return { submitted: false, error: err instanceof ApiError ? err.message : 'Something went wrong' };
      }
    },
    { submitted: false, error: null },
  );

  return (
    <main className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 shadow-lift border-border bg-card">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark label="Saloon Admin" subtitle="Reset your password" />
        </div>

        {submitted ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-foreground">
              If an account exists for <strong>{email}</strong>, we've sent a link to reset the password.
            </p>
            <Link to={routes.login} className="inline-block text-xs font-semibold text-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Enter the email address on your account and we'll send you a link to reset your password.
            </p>
            <Input
              required
              type="email"
              label="Email Address"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" disabled={submitting} size="lg" className="w-full mt-2">
              {submitting ? 'Sending...' : 'Send reset link'}
            </Button>

            <div className="text-center">
              <Link to={routes.login} className="text-xs font-semibold text-primary hover:underline">
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </Card>
    </main>
  );
}
