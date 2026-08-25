import { useActionState, useEffect } from 'react';
import { BrandMark, Button, Card } from '@saloon/ui';
import { ApiError, profileApi } from '../api/client';
import { profileStreamUrl, subscribeToStream } from '../api/sseClient';
import { useAuth } from '../features/auth/AuthContext';

// Blocks access to the rest of the portal until the caller's email is verified (login itself is
// still allowed -- this renders in place of the requested route, see RequireAuth in App.tsx).
// Subscribes to /api/profile/stream so confirming the link in another tab unlocks this one live,
// without the user having to come back and reload.
export function VerifyEmailGate() {
  const { user, refreshUser, logout } = useAuth();

  const userId = user?.userId;
  useEffect(() => {
    if (!userId) return;
    return subscribeToStream(profileStreamUrl(userId), 'email-verified', refreshUser);
  }, [userId, refreshUser]);

  const [{ sent, error }, handleSend, sending] = useActionState<{ sent: boolean; error: string | null }>(
    async () => {
      try {
        await profileApi.apiProfileEmailVerifyRequestPost();
        return { sent: true, error: null };
      } catch (err) {
        return { sent: false, error: err instanceof ApiError ? err.message : 'Failed to send verification email' };
      }
    },
    { sent: false, error: null },
  );

  return (
    <main className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-4 p-8 text-center shadow-lift border-border bg-card">
        <div className="flex flex-col items-center">
          <BrandMark label="Saloon Admin" subtitle="Verify your email" />
        </div>
        <p className="text-sm text-muted-foreground">
          Confirm <strong className="text-foreground">{user?.email}</strong> to access the portal.
        </p>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
            {error}
          </div>
        )}

        {sent ? (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Verification link sent. Check your inbox — this page unlocks automatically once confirmed.
          </p>
        ) : (
          <Button onClick={() => handleSend()} disabled={sending} size="lg" className="w-full">
            {sending ? 'Sending...' : 'Send verification email'}
          </Button>
        )}

        <button
          type="button"
          onClick={logout}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground transition"
        >
          Sign out
        </button>
      </Card>
    </main>
  );
}
