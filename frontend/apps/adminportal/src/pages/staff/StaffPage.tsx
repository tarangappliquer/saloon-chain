import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, adminStaffApi, ApiError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Location, StaffUser, Therapist, UserRole } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

const EMULATOR_ELIGIBLE_ROLES: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager', 'Receptionist', 'Therapist', 'Other'];

function creatableRoles(callerRole: UserRole | undefined): UserRole[] {
  if (callerRole === 'RootSuperAdmin') return ['SuperAdmin', 'Admin', 'Manager', 'Receptionist', 'Therapist', 'Other', 'Customer'];
  if (callerRole === 'SuperAdmin') return ['Admin', 'Manager', 'Receptionist', 'Therapist', 'Other', 'Customer'];
  if (callerRole === 'Admin') return ['Manager', 'Receptionist', 'Therapist', 'Other', 'Customer'];
  if (callerRole === 'Manager') return ['Receptionist', 'Therapist', 'Other', 'Customer'];
  return [];
}

function emptyForm(defaultRole: UserRole) {
  return { name: '', email: '', password: '', role: defaultRole, chainId: '', locationId: '', therapistId: '' };
}

export function StaffPage() {
  const { user: currentUser } = useAuth();
  const roleOptions = creatableRoles(currentUser?.role);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [form, setForm] = useState(emptyForm(roleOptions[0]));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data as unknown as { id: number }[];
        if (cs.length > 0) setForm((f) => ({ ...f, chainId: String(cs[0].id) }));
      })
      .catch(() => {});
    adminCatalogApi
      .apiAdminCatalogTherapistsGet()
      .then(({ data }) => setTherapists(data as unknown as Therapist[]))
      .catch(() => {});
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
      setForm({ ...emptyForm(roleOptions[0]), chainId: form.chainId });
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
    <div className="space-y-6">
      <PageHeader title="Staff Accounts" description="Manage staff accounts, roles, access permissions, and customer emulation flags." />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {roleOptions.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle>Create Staff Account</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  required
                  label="Name"
                  placeholder="Staff Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <Input
                  required
                  type="email"
                  label="Email"
                  placeholder="staff@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <Input
                  required
                  type="password"
                  label="Password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Role
                  </label>
                  <SearchableSelect
                    value={form.role}
                    onChange={(v) => setForm({ ...form, role: v as UserRole })}
                    options={roleOptions.map((r) => ({ value: r, label: r }))}
                    className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {(form.role === 'Manager' || form.role === 'Receptionist' || form.role === 'Therapist' || form.role === 'Other') &&
                  currentUser?.role !== 'Manager' &&
                  currentUser?.role !== 'Receptionist' && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Location Scope
                      </label>
                      <SearchableSelect
                        value={form.locationId}
                        onChange={(v) => setForm({ ...form, locationId: v })}
                        placeholder="Select location..."
                        options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                        className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground"
                      />
                    </div>
                  )}
                {form.role === 'Therapist' && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Linked Therapist Record
                    </label>
                    <SearchableSelect
                      value={form.therapistId}
                      onChange={(v) => setForm({ ...form, therapistId: v })}
                      placeholder="Select therapist..."
                      options={therapists.map((t) => ({ value: String(t.id), label: t.name }))}
                      className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Staff Login'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Staff Members ({staff.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : staff.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No staff users found.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Email</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Scope</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Emulator Flag</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {staff.map((u) => (
                  <tr key={u.id} className="hover:bg-accent/40 transition">
                    <td className="px-6 py-4 font-semibold text-foreground">{u.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{u.email}</td>
                    <td className="px-6 py-4">
                      <Badge status={u.role} />
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {u.chainId ? `Chain #${u.chainId}` : ''} {u.locationId ? `Location #${u.locationId}` : 'All Locations'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge status={u.isActive ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="px-6 py-4">
                      {!EMULATOR_ELIGIBLE_ROLES.includes(u.role) ? (
                        <span className="text-muted-foreground">n/a</span>
                      ) : currentUser?.role === 'RootSuperAdmin' || currentUser?.role === 'SuperAdmin' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={savingId === u.id}
                          onClick={() => toggleEmulator(u)}
                        >
                          {u.isEmulator ? 'Enabled' : 'Disabled'}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">{u.isEmulator ? 'Enabled' : 'Disabled'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={savingId === u.id}
                        onClick={() => toggleActive(u)}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
