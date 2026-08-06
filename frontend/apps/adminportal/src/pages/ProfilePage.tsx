import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, Input, LoadingFallback, PageHeader, TusUploadControl, UppyPhotoUploadModal, useTusResumableUpload } from '@saloon/ui';
import { API_BASE, ApiError, getAuthToken, getFieldError, profileApi } from '../api/client';
import { useAuth } from '../features/auth/AuthContext';
import { Camera } from 'lucide-react';
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

  const [cacheBuster, setCacheBuster] = useState(Date.now());
  const [uppyOpen, setUppyOpen] = useState(false);

  const refreshProfilePhoto = async () => {
    const { data: res } = await profileApi.apiProfileGet();
    const updated = res as unknown as Profile;
    setProfile(updated);
    setCacheBuster(Date.now());
    setSuccess('Profile photo updated.');
  };

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
