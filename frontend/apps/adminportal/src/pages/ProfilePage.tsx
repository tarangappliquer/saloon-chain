import { useActionState, useEffect, useState } from 'react';
import { Badge, Button, Card, Input, LoadingFallback, PageHeader, UppyPhotoUploadModal } from '@saloon/ui';
import { API_BASE, ApiError, authApi, getAuthToken, getFieldError, profileApi } from '../api/client';
import { profileStreamUrl, subscribeToStream } from '../api/sseClient';
import { useAuth } from '../features/auth/AuthContext';
import { Camera } from 'lucide-react';
import type { Profile } from '../api/types';

export function ProfilePage() {
  const { user, updateName, refreshUser } = useAuth();
  const isEmulated = Boolean((user as any)?.isEmulated);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // Written by both the mount-effect `load()` (via the SSE callback too) and the save action below,
  // so it stays a plain useState -- useActionState has no external setter (see CLAUDE.md recipe rule 3).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [cacheBuster, setCacheBuster] = useState(Date.now());
  const [uppyOpen, setUppyOpen] = useState(false);

  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  const refreshProfilePhoto = async () => {
    const { data: res } = await profileApi.apiProfileGet();
    const updated = res as unknown as Profile;
    setProfile(updated);
    setCacheBuster(Date.now());
    await refreshUser();
    setSuccess('Profile photo updated.');
  };

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await profileApi.apiProfileGet();
      const p = data as unknown as Profile;
      setProfile(p);
      setName(p.name);
      setPhone(p.phone ?? '');
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Live-updates the Verified badge if the confirmation link gets clicked in another tab/device
  // while this page is open, instead of leaving it stuck on "Unverified" until a manual reload.
  // Depends on the primitive fields (not `profile` itself) so a name/phone save -- which produces
  // a new profile object with the same id/verified state -- doesn't tear down and reopen the SSE
  // connection for no reason.
  const profileUserId = profile?.userId;
  const profileIsEmailVerified = profile?.isEmailVerified;
  useEffect(() => {
    if (!profileUserId || profileIsEmailVerified) return;
    return subscribeToStream(profileStreamUrl(profileUserId), 'email-verified', () => {
      load();
      setSuccess('Email address verified.');
    });
  }, [profileUserId, profileIsEmailVerified]);

  const [{ error, submitError }, handleSave, saving] = useActionState<{ error: string | null; submitError: unknown }>(
    async () => {
      setSuccess(null);
      try {
        const { data } = await profileApi.apiProfilePut({ name, phone: phone || null });
        const updated = data as unknown as Profile;
        setProfile(updated);
        updateName(updated.name);
        setSuccess('Profile updated successfully.');
        return { error: null, submitError: null };
      } catch (err) {
        return { error: err instanceof ApiError ? err.message : 'Failed to update profile', submitError: err };
      }
    },
    { error: null, submitError: null },
  );

  const [
    { error: emailError, submitError: emailSubmitError, sentTo: emailChangeSent },
    handleChangeEmailRequest,
    emailSubmitting,
  ] = useActionState<{ error: string | null; submitError: unknown; sentTo: string | null }>(
    async () => {
      try {
        await profileApi.apiProfileEmailChangeRequestPost({ newEmail });
        setChangingEmail(false);
        setNewEmail('');
        return { error: null, submitError: null, sentTo: newEmail };
      } catch (err) {
        return { error: err instanceof ApiError ? err.message : 'Failed to request email change', submitError: err, sentTo: null };
      }
    },
    { error: null, submitError: null, sentTo: null },
  );

  const [{ error: passwordResetError, sent: passwordResetSent }, handlePasswordResetRequest, passwordResetSubmitting] =
    useActionState<{ error: string | null; sent: boolean }>(
      async () => {
        if (isEmulated || !profile) return { error: null, sent: false };
        try {
          await authApi.apiAuthForgotPasswordPost({ email: profile.email });
          return { error: null, sent: true };
        } catch (err) {
          return { error: err instanceof ApiError ? err.message : 'Failed to send password reset link', sent: false };
        }
      },
      { error: null, sent: false },
    );

  if (loading) return <LoadingFallback />;
  if (!profile) return null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="My Profile"
        subtitle="Manage your personal account settings and profile details."
        action={<Badge status={profile.role} />}
      />

      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {loadError}
        </div>
      )}

      <Card className="p-6">
        <div className="mb-6 flex items-center gap-6">
          <div
            onClick={() => setUppyOpen(true)}
            className="group relative h-20 w-20 cursor-pointer overflow-hidden rounded-2xl border border-border bg-muted shadow-2xs transition-all hover:ring-2 hover:ring-primary/50"
            title="Click to edit profile photo"
          >
            {profile.photoPath ? (
              <img
                src={`${API_BASE}${profile.photoPath}?v=${cacheBuster}`}
                alt="Profile"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-2xl font-bold text-muted-foreground">
                {profile.name.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-5 w-5 text-white" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={() => setUppyOpen(true)}
                className="text-xs flex items-center gap-1.5"
              >
                <Camera className="h-3.5 w-3.5" />
                Upload & Crop Photo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Crop, rotate, and zoom with Uppy (Max 5 MB)</p>
          </div>
        </div>

        <UppyPhotoUploadModal
          open={uppyOpen}
          onClose={() => setUppyOpen(false)}
          apiBase={API_BASE}
          token={getAuthToken() || undefined}
          category="profile-photos"
          onSuccess={refreshProfilePhoto}
        />

        <form onSubmit={handleSave} className="space-y-4">
          <Input required label="Name" value={name} onChange={(e) => setName(e.target.value)} error={getFieldError(submitError, 'name')} />
          <Input
            label="Phone Number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 (555) 000-0000"
            error={getFieldError(submitError, 'phone')}
          />

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {success}
            </div>
          )}

          <div className="pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>

        <div className="mt-6 space-y-2 border-t border-border pt-6">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Address</label>
          <div className="flex items-center gap-2">
            <Input disabled value={profile.email} className="flex-1" />
            <Badge variant={profile.isEmailVerified ? 'success' : 'warning'}>
              {profile.isEmailVerified ? 'Verified' : 'Unverified'}
            </Badge>
            {!changingEmail && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setChangingEmail(true)}>
                Change
              </Button>
            )}
          </div>

          {changingEmail && (
            <form onSubmit={handleChangeEmailRequest} className="flex items-start gap-2 pt-1">
              <Input
                required
                type="email"
                placeholder="new@email.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                error={getFieldError(emailSubmitError, 'newEmail')}
                className="flex-1"
              />
              <Button type="submit" size="sm" disabled={emailSubmitting}>
                {emailSubmitting ? 'Sending...' : 'Send link'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setChangingEmail(false);
                  setNewEmail('');
                }}
              >
                Cancel
              </Button>
            </form>
          )}

          {emailError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {emailError}
            </div>
          )}
          {emailChangeSent && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Confirmation link sent to {emailChangeSent}. Check your inbox to finish the change.
            </div>
          )}
        </div>

        <div className="mt-6 space-y-3 border-t border-border pt-6">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Security & Password</label>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border p-4 bg-muted/30">
            <div>
              <p className="text-xs font-medium">Password Reset</p>
              <p className="text-xs text-muted-foreground">Send a password reset link to your email address ({profile.email}).</p>
            </div>
            {!isEmulated && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={passwordResetSubmitting}
                onClick={handlePasswordResetRequest}
                className="shrink-0"
              >
                {passwordResetSubmitting ? 'Sending...' : 'Change Password'}
              </Button>
            )}
          </div>

          {passwordResetError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {passwordResetError}
            </div>
          )}
          {passwordResetSent && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Password reset link sent to {profile.email}. Check your inbox to reset your password.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
