import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Badge, Button, Card, Input, LoadingFallback, PageHeader, TusUploadControl, useTusResumableUpload } from '@saloon/ui';
import { API_BASE, ApiError, getAuthToken, getFieldError, profileApi } from '../api/client';
import { useAuth } from '../features/auth/AuthContext';
import type { Profile } from '../api/types';

export function ProfilePage() {
  const { updateName } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cacheBuster, setCacheBuster] = useState(Date.now());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await profileApi.apiProfileGet();
      const p = data as unknown as Profile;
      setProfile(p);
      setName(p.name);
      setPhone(p.phone ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const { data } = await profileApi.apiProfilePut({ name, phone: phone || null });
      const updated = data as unknown as Profile;
      setProfile(updated);
      updateName(updated.name);
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const tusUpload = useTusResumableUpload({
    endpoint: `${API_BASE}/api/files/tus`,
    category: 'profile-photos',
    token: getAuthToken() || undefined,
    onSuccess: async () => {
      const { data: res } = await profileApi.apiProfileGet();
      const updated = res as unknown as Profile;
      setProfile(updated);
      setCacheBuster(Date.now());
      setSuccess('Profile photo updated.');
      setSelectedFile(null);
    },
    onError: (err) => {
      setError(err.message || 'Failed to upload photo');
    },
  });

  async function handlePhotoSelected() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);
    setSelectedFile(file);
    tusUpload.startUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (loading) return <LoadingFallback />;
  if (!profile) return null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="My Profile"
        subtitle="Manage your personal account settings and profile details."
        action={<Badge status={profile.role} />}
      />

      <Card className="p-6">
        <div className="mb-6 flex items-center gap-6">
          <div className="h-20 w-20 overflow-hidden rounded-2xl border border-border bg-muted shadow-2xs">
            {profile.photoPath ? (
              <img src={`${API_BASE}${profile.photoPath}?v=${cacheBuster}`} alt="Profile" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-2xl font-bold text-muted-foreground">
                {profile.name.substring(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoSelected}
              disabled={tusUpload.isUploading}
              className="text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
            />
            <p className="text-xs text-muted-foreground">JPG, PNG, or WEBP (Max 5 MB)</p>
          </div>
        </div>

        <TusUploadControl
          fileName={selectedFile?.name}
          isUploading={tusUpload.isUploading}
          isPaused={tusUpload.isPaused}
          isSuccess={tusUpload.isSuccess}
          error={tusUpload.error}
          progress={tusUpload.progress}
          bytesUploaded={tusUpload.bytesUploaded}
          bytesTotal={tusUpload.bytesTotal}
          onPause={tusUpload.pauseUpload}
          onResume={tusUpload.resumeUpload}
          onCancel={tusUpload.cancelUpload}
        />

        <form onSubmit={handleSave} className="space-y-4">
          <Input required label="Name" value={name} onChange={(e) => setName(e.target.value)} error={getFieldError(submitError, 'name')} />
          <Input disabled label="Email Address" value={profile.email} helperText="Email cannot be changed." />
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
      </Card>
    </div>
  );
}
