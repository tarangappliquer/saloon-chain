import { useActionState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark, Button, Card } from '@saloon/ui';
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { authApi, ApiError } from '../api/client';
import { routes } from '../routes';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [{ error, done }, handleConfirm, submitting] = useActionState<{ error: string | null; done: boolean }>(
    async () => {
      if (!token) return { error: null, done: false };
      try {
        await authApi.apiAuthEmailConfirmPost({ token });
        return { error: null, done: true };
      } catch (err) {
        return { error: err instanceof ApiError ? err.message : 'Something went wrong', done: false };
      }
    },
    { error: null, done: false },
  );

  return (
    <main className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-md p-6 sm:p-8 shadow-lift border-border bg-card/95 backdrop-blur-md rounded-3xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark label="Shoppey Saloon" subtitle="Confirm your email" />
        </div>

        {!token ? (
          <div className="space-y-4 text-center py-2">
            <p className="text-xs font-semibold text-destructive">This confirmation link is missing its token or has expired.</p>
            <Link to={routes.profile} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Back to profile
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-xs text-foreground font-semibold">Your email address has been confirmed.</p>
            <Button onClick={() => navigate(routes.profile)} size="lg" className="w-full">
              Go to profile
            </Button>
          </div>
        ) : (
          <form action={handleConfirm} className="space-y-4 text-center">
            <p className="text-xs text-muted-foreground">Click below to confirm this email address for your account.</p>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" disabled={submitting} size="lg" className="w-full mt-2">
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Confirming...
                </span>
              ) : (
                'Confirm email'
              )}
            </Button>

            <div className="text-center pt-2">
              <Link to={routes.profile} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to profile
              </Link>
            </div>
          </form>
        )}
      </Card>
    </main>
  );
}
