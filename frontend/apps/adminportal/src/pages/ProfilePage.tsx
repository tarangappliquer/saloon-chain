import { useEffect, useRef, useState, type FormEvent } from 'react';
import { API_BASE, ApiError, profileApi } from '../api/client';
import { useAuth } from '../features/auth/AuthContext';
import type { Profile } from '../api/types';

export function ProfilePage() {
  const { updateName } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setSuccess(null);
    setSaving(true);
    try {
      const { data } = await profileApi.apiProfilePut({ name, phone: phone || null });
      const updated = data as unknown as Profile;
      setProfile(updated);
      updateName(updated.name);
      setSuccess('Profile updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoSelected() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);
    setUploading(true);
    try {
      const { data: res } = await profileApi.apiProfilePhotoPost(file);
      setProfile((p) => (p ? { ...p, photoPath: res.photoPath } : p));
      setSuccess('Photo updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload photo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!profile) return null;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">My Profile</h1>

      <div className="mb-6 flex items-center gap-4">
        <div className="h-20 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          {profile.photoPath && (
            <img src={`${API_BASE}${profile.photoPath}`} alt="Profile" className="h-full w-full object-cover" />
          )}
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoSelected}
            disabled={uploading}
            className="text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">JPG, PNG, or WEBP, up to 5 MB.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm text-gray-500">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-500">Email</label>
          <input
            disabled
            value={profile.email}
            className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-500 dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-500">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          Save
        </button>
      </form>
    </div>
  );
}
