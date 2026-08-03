import { useEffect, useState, type FormEvent } from 'react';
import { adminCatalogApi, adminStaffApi, ApiError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location, StaffUser, Therapist, UserRole } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

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
      const { data } = await adminStaffApi.apiAdminStaffGet();
      setStaff(data as unknown as StaffUser[]);
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
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data as unknown as Chain[];
        setChains(cs);
        if (currentUser?.role !== 'SuperAdmin' && cs.length > 0) setForm((f) => ({ ...f, chainId: String(cs[0].id) }));
      })
      .catch(() => {});
    adminCatalogApi
      .apiAdminCatalogTherapistsGet()
      .then(({ data }) => setTherapists(data as unknown as Therapist[]))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (form.chainId) {
      adminCatalogApi
        .apiAdminCatalogLocationsGet(Number(form.chainId))
        .then(({ data }) => setLocations(data as unknown as Location[]))
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
      await adminStaffApi.apiAdminStaffPost({
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
      await adminStaffApi.apiAdminStaffIdPut(u.id, {
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
          <SearchableSelect
            value={form.role}
            onChange={(v) => setForm({ ...form, role: v as UserRole })}
            options={roleOptions.map((r) => ({ value: r, label: r }))}
            className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Only SuperAdmin picks a chain -- Admin/Manager are clamped to their own chain/location
              server-side (AdminStaffEndpoints.MapPost), so there's nothing for them to choose. */}
          {currentUser?.role === 'SuperAdmin' && (
            <SearchableSelect
              value={form.chainId}
              onChange={(v) => setForm({ ...form, chainId: v, locationId: '' })}
              placeholder="Chain (scope)"
              options={chains.map((c) => ({ value: String(c.id), label: c.name }))}
              className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
            />
          )}
          {(form.role === 'Manager' || form.role === 'Therapist') && currentUser?.role !== 'Manager' && (
            <SearchableSelect
              value={form.locationId}
              onChange={(v) => setForm({ ...form, locationId: v })}
              placeholder="Location (scope)"
              options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
              className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
            />
          )}
          {form.role === 'Therapist' && (
            <SearchableSelect
              value={form.therapistId}
              onChange={(v) => setForm({ ...form, therapistId: v })}
              placeholder="Linked therapist record"
              options={therapists.map((t) => ({ value: String(t.id), label: t.name }))}
              className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
            />
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
