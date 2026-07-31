import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location, StaffUser, Therapist, UserRole } from '../../api/types';

// Mirrors AuthService.EmulatorEligibleRoles on the backend -- only these roles can ever emulate a
// customer, so the toggle is hidden for Therapist rows rather than allowed-then-ignored.
const EMULATOR_ELIGIBLE_ROLES: UserRole[] = ['SuperAdmin', 'Admin', 'Manager'];

// Mirrors AdminStaffEndpoints.MapPost's hierarchy: SuperAdmin -> Admin/Manager/Therapist (any
// chain/location); Admin -> Manager/Therapist (own chain, clamped server-side); Manager ->
// Therapist only (own location, clamped server-side).
function creatableRoles(callerRole: UserRole | undefined): UserRole[] {
  if (callerRole === 'SuperAdmin') return ['Admin', 'Manager', 'Therapist'];
  if (callerRole === 'Admin') return ['Manager', 'Therapist'];
  return ['Therapist'];
}

function emptyForm(defaultRole: UserRole) {
  return { name: '', email: '', password: '', role: defaultRole, chainId: '', locationId: '', therapistId: '' };
}

export function StaffPage() {
  const { user: currentUser } = useAuth();
  const roleOptions = creatableRoles(currentUser?.role);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [form, setForm] = useState(emptyForm(roleOptions[0]));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Row currently mid-PUT -- both toggle buttons for that row are disabled while set, so a second
  // click can't build its payload from a pre-update `u` snapshot and clobber the first click's
  // change (e.g. deactivating while an emulator-toggle click is still in flight would otherwise
  // silently resurrect isActive:true from the stale closure).
  const [savingId, setSavingId] = useState<number | null>(null);

  async function loadStaff() {
    setLoading(true);
    setError(null);
    try {
      setStaff(await api.get<StaffUser[]>('/api/admin/staff'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStaff();
    // Admin's list is always exactly one chain (server-scoped) -- auto-select it since the picker
    // is hidden for anyone but SuperAdmin (their own chain is clamped server-side regardless).
    api
      .get<Chain[]>('/api/admin/catalog/chains')
      .then((cs) => {
        setChains(cs);
        if (currentUser?.role !== 'SuperAdmin' && cs.length > 0) setForm((f) => ({ ...f, chainId: String(cs[0].id) }));
      })
      .catch(() => {});
    api.get<Therapist[]>('/api/admin/catalog/therapists').then(setTherapists).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (form.chainId) {
      api
        .get<Location[]>(`/api/admin/catalog/locations?chainId=${form.chainId}`)
        .then(setLocations)
        .catch(() => setLocations([]));
    } else {
      setLocations([]);
    }
  }, [form.chainId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/admin/staff', {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        chainId: form.chainId ? Number(form.chainId) : null,
        locationId: form.locationId ? Number(form.locationId) : null,
        therapistId: form.therapistId ? Number(form.therapistId) : null,
      });
      setForm({ ...emptyForm(roleOptions[0]), chainId: currentUser?.role === 'SuperAdmin' ? '' : form.chainId });
      await loadStaff();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create staff user');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(u: StaffUser) {
    await updateStaff(u, { isActive: !u.isActive });
  }

  async function toggleEmulator(u: StaffUser) {
    await updateStaff(u, { isEmulator: !u.isEmulator });
  }

  async function updateStaff(u: StaffUser, changes: Partial<Pick<StaffUser, 'isActive' | 'isEmulator'>>) {
    setError(null);
    setSavingId(u.id);
    try {
      await api.put(`/api/admin/staff/${u.id}`, {
        name: u.name,
        phone: u.phone,
        chainId: u.chainId,
        locationId: u.locationId,
        therapistId: u.therapistId,
        isEmulator: u.isEmulator,
        isActive: u.isActive,
        ...changes,
      });
      await loadStaff();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update staff user');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Staff</h1>

      <form onSubmit={handleCreate} className="mb-6 space-y-2 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex flex-wrap gap-2">
          <input
            required
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <input
            required
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Only SuperAdmin picks a chain -- Admin/Manager are clamped to their own chain/location
              server-side (AdminStaffEndpoints.MapPost), so there's nothing for them to choose. */}
          {currentUser?.role === 'SuperAdmin' && (
            <select
              value={form.chainId}
              onChange={(e) => setForm({ ...form, chainId: e.target.value, locationId: '' })}
              className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">Chain (scope)</option>
              {chains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {(form.role === 'Manager' || form.role === 'Therapist') && currentUser?.role !== 'Manager' && (
            <select
              value={form.locationId}
              onChange={(e) => setForm({ ...form, locationId: e.target.value })}
              className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">Location (scope)</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          {form.role === 'Therapist' && (
              <select
                value={form.therapistId}
                onChange={(e) => setForm({ ...form, therapistId: e.target.value })}
                className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="">Linked therapist record</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          Create staff login
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role</th>
              <th className="py-2">Scope</th>
              <th className="py-2">Status</th>
              <th className="py-2">Emulator</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 dark:border-gray-900">
                <td className="py-2">{u.name}</td>
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.role}</td>
                <td className="py-2">
                  {u.chainId ? `Chain #${u.chainId}` : ''} {u.locationId ? `Location #${u.locationId}` : ''}
                </td>
                <td className="py-2">{u.isActive ? 'Active' : 'Inactive'}</td>
                <td className="py-2">
                  {!EMULATOR_ELIGIBLE_ROLES.includes(u.role) ? (
                    <span className="text-gray-400">n/a</span>
                  ) : currentUser?.role === 'SuperAdmin' ? (
                    // "Can mark admin as Emulator" is Super Admin's alone (AdminStaffEndpoints'
                    // PUT handler rejects anyone else's attempt to change it) -- Admin/Manager see
                    // the flag but can't click it.
                    <button
                      type="button"
                      disabled={savingId === u.id}
                      onClick={() => toggleEmulator(u)}
                      className="text-purple-600 hover:underline disabled:opacity-40"
                    >
                      {u.isEmulator ? 'Enabled' : 'Disabled'}
                    </button>
                  ) : (
                    <span className="text-gray-500">{u.isEmulator ? 'Enabled' : 'Disabled'}</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    disabled={savingId === u.id}
                    onClick={() => toggleActive(u)}
                    className="text-purple-600 hover:underline disabled:opacity-40"
                  >
                    {u.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
