import { useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark, Button, Card } from '@saloon/ui';
import { authApi, ApiError } from '../api/client';
import { routes } from '../routes';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleConfirm(e: SyntheticEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await authApi.apiAuthEmailConfirmPost({ token });
      setDone(true);
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
          <BrandMark label="Saloon Admin" subtitle="Confirm your email" />
        </div>

        {!token ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-destructive">This confirmation link is missing its token.</p>
            <Link to={routes.profile} className="inline-block text-xs font-semibold text-primary hover:underline">
              Back to profile
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-foreground">Your email address has been confirmed.</p>
            <Button onClick={() => navigate(routes.profile)} size="lg" className="w-full">
              Go to profile
            </Button>
          </div>
        ) : (
          <form onSubmit={handleConfirm} className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">Click below to confirm this email address for your account.</p>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" disabled={submitting} size="lg" className="w-full mt-2">
              {submitting ? 'Confirming...' : 'Confirm email'}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
