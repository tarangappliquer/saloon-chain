import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Chain, Location, StaffUser, Therapist, UserRole } from '../../api/types';

const STAFF_ROLES: UserRole[] = ['SuperAdmin', 'Admin', 'Manager', 'Therapist'];
// Mirrors AuthService.EmulatorEligibleRoles on the backend -- only these roles can ever emulate a
// customer, so the toggle is hidden for Therapist rows rather than allowed-then-ignored.
const EMULATOR_ELIGIBLE_ROLES: UserRole[] = ['SuperAdmin', 'Admin', 'Manager'];

function emptyForm() {
  return { name: '', email: '', password: '', role: 'Manager' as UserRole, chainId: '', locationId: '', therapistId: '' };
}

export function StaffPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadStaff() {
    setLoading(true);
    setStaff(await api.get<StaffUser[]>('/api/admin/staff'));
    setLoading(false);
  }

  useEffect(() => {
    loadStaff();
    api.get<Chain[]>('/api/admin/catalog/chains').then(setChains);
    api.get<Therapist[]>('/api/admin/catalog/therapists').then(setTherapists);
  }, []);

  useEffect(() => {
    if (form.chainId) {
      api.get<Location[]>(`/api/admin/catalog/locations?chainId=${form.chainId}`).then(setLocations);
    } else {
      setLocations([]);
    }
  }, [form.chainId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
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
      setForm(emptyForm());
      await loadStaff();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create staff user');
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
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {form.role !== 'SuperAdmin' && (
          <div className="flex flex-wrap gap-2">
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
            {(form.role === 'Manager' || form.role === 'Therapist') && (
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
        )}
        <button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white">
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
                  {EMULATOR_ELIGIBLE_ROLES.includes(u.role) ? (
                    <button type="button" onClick={() => toggleEmulator(u)} className="text-purple-600 hover:underline">
                      {u.isEmulator ? 'Enabled' : 'Disabled'}
                    </button>
                  ) : (
                    <span className="text-gray-400">n/a</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <button type="button" onClick={() => toggleActive(u)} className="text-purple-600 hover:underline">
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
