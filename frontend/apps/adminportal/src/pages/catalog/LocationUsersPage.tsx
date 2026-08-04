import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, adminStaffApi, ApiError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location, StaffUser, UserRole } from '../../api/types';
import { normalizeUserRole } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

function getLocationRolesForCaller(callerRole: UserRole | undefined): { value: UserRole; label: string; desc: string }[] {
  const allRoles: { value: UserRole; label: string; desc: string }[] = [
    { value: 'Manager', label: 'Manager', desc: 'Location Operations Manager' },
    { value: 'Receptionist', label: 'Receptionist', desc: 'Front-Desk & Booking Management' },
    { value: 'Therapist', label: 'Therapist', desc: 'Service Provider / Therapist' },
    { value: 'Other', label: 'Other', desc: 'General Location Staff' },
  ];
  if (callerRole === 'Manager') {
    return allRoles.filter((r) => r.value !== 'Manager');
  }
  return allRoles;
}

function emptyForm(defaultRole: UserRole = 'Manager') {
  return { name: '', email: '', password: '', phone: '', role: defaultRole };
}

export function LocationUsersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramChainId = searchParams.get('chainId');
  const paramLocationId = searchParams.get('locationId');
  const chainId = paramChainId ? Number(paramChainId) : null;
  const locationId = paramLocationId ? Number(paramLocationId) : null;

  const { user: currentUser } = useAuth();
  const availableRoles = getLocationRolesForCaller(currentUser?.role);

  const [chain, setChain] = useState<Chain | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [form, setForm] = useState(emptyForm(availableRoles[0]?.value ?? 'Receptionist'));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminStaffApi.apiAdminStaffGet(undefined, undefined, locationId);
      const rawUsers = data as unknown as StaffUser[];
      setStaff(rawUsers.map((u) => ({ ...u, role: normalizeUserRole(u.role) })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load location users');
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    if (chainId) {
      adminCatalogApi
        .apiAdminCatalogChainsGet()
        .then(({ data }) => {
          const cs = data as unknown as Chain[];
          const found = cs.find((c) => c.id === chainId);
          if (found) setChain(found);
        })
        .catch(() => {});
    }

    if (chainId && locationId) {
      adminCatalogApi
        .apiAdminCatalogLocationsGet(chainId)
        .then(({ data }) => {
          const locs = data as unknown as Location[];
          const found = locs.find((l) => l.id === locationId);
          if (found) setLocation(found);
        })
        .catch(() => {});
    }

    loadUsers();
  }, [chainId, locationId, loadUsers]);

  function handleStartEdit(u: StaffUser) {
    setEditingUser(u);
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      phone: u.phone ?? '',
      role: u.role,
    });
    setError(null);
  }

  function handleCancelEdit() {
    setEditingUser(null);
    setForm(emptyForm(availableRoles[0]?.value ?? 'Receptionist'));
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!chainId || !locationId) return;
    setError(null);
    setSubmitting(true);
    try {
      if (editingUser) {
        await adminStaffApi.apiAdminStaffIdPut(editingUser.id, {
          name: form.name,
          phone: form.phone || null,
          role: form.role,
          chainId: editingUser.chainId,
          locationId: editingUser.locationId,
          therapistId: editingUser.therapistId,
          isEmulator: editingUser.isEmulator,
          isActive: editingUser.isActive,
        });
      } else {
        await adminStaffApi.apiAdminStaffPost({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          chainId,
          locationId,
          therapistId: null,
        });
      }
      handleCancelEdit();
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${editingUser ? 'update' : 'create'} location user`);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(u: StaffUser) {
    setError(null);
    try {
      await adminStaffApi.apiAdminStaffIdPut(u.id, {
        name: u.name,
        phone: u.phone,
        chainId: u.chainId,
        locationId: u.locationId,
        therapistId: u.therapistId,
        isEmulator: u.isEmulator,
        isActive: !u.isActive,
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update user status');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Location User Management ${location ? `— ${location.name}` : ''}`}
        description="Create and manage location staff (Manager, Receptionist, Therapist, Other)."
        action={
          <Button variant="outline" size="sm" onClick={() => navigate(chainId ? `/catalog/locations?chainId=${chainId}` : '/catalog/saloons')}>
            ← Back to Locations
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {/* Add / Edit Location User Form */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>
            {editingUser
              ? `Edit Location Staff: ${editingUser.name}`
              : `Add Location Staff ${location ? `for ${location.name}` : ''}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Readonly Saloon Chain Label */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Saloon Chain
                </label>
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground">
                  {chain?.name ?? (chainId ? `Chain #${chainId}` : 'Selected Chain')}
                </div>
              </div>

              {/* Readonly Location Label */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Location Scope
                </label>
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>{location?.name ?? (locationId ? `Location #${locationId}` : 'Selected Location')}</span>
                  <Badge status="Active" className="text-[10px] py-0 px-1.5" />
                </div>
              </div>

              <Input
                required
                label="Full Name"
                placeholder="e.g. Michael Therapist"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />

              <Input
                required
                type="email"
                disabled={Boolean(editingUser)}
                label="Email Address"
                placeholder="staff@saloon.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {!editingUser ? (
                <Input
                  required
                  type="password"
                  label="Password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              ) : (
                <Input
                  label="Phone"
                  placeholder="+1 555-0199"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Location Role
                </label>
                <SearchableSelect
                  value={form.role}
                  onChange={(v) => setForm({ ...form, role: v as UserRole })}
                  options={availableRoles.map((r) => ({ value: r.value, label: `${r.label} — ${r.desc}` }))}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting} className="font-semibold">
                {submitting ? 'Saving...' : editingUser ? 'Update Location Staff' : `Create ${form.role} User`}
              </Button>
              {editingUser && (
                <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={submitting}>
                  Cancel Edit
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Location Users Table */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Location Staff {location ? `at ${location.name}` : ''} ({staff.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : staff.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No staff users created for this location yet.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Email</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Status</th>
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
                    <td className="px-6 py-4">
                      <Badge status={u.isActive ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleStartEdit(u)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(u)}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
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
