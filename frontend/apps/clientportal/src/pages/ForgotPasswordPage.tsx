import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark, Button, Card, Input } from '@saloon/ui';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { authApi, ApiError } from '../api/client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.apiAuthForgotPasswordPost({ email });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-md p-6 sm:p-8 shadow-lift border-border bg-card/95 backdrop-blur-md rounded-3xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark label="Shoppey Saloon" subtitle="Reset your password" />
        </div>

        {submitted ? (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MailCheck className="h-6 w-6" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              If an account exists for <strong className="text-foreground">{email}</strong>, we've sent a link to reset your password.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline pt-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-muted-foreground text-center">
              Enter the email address on your account and we'll send you a link to reset your password.
            </p>
            <Input
              required
              type="email"
              label="Email Address"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" disabled={submitting} size="lg" className="w-full mt-2">
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending...
                </span>
              ) : (
                'Send reset link'
              )}
            </Button>

            <div className="text-center pt-2">
              <Link to="/login" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </Link>
            </div>
          </form>
        )}
      </Card>
    </main>
  );
}
