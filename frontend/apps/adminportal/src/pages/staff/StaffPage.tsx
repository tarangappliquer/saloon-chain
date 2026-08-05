import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Select, { type SingleValue } from 'react-select';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, adminStaffApi, ApiError, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location, StaffUser, Therapist, UserRole } from '../../api/types';
import { normalizeUserRole } from '../../api/types';
import { type SelectOption, selectClassNames } from '../../components/reactSelectStyles';

// IsEmulator only ever applies to RootSuperAdmin/SuperAdmin/Admin -- Manager/Receptionist/Therapist/
// Other/Customer are always false (see AdminStaffEndpoints' matching clamp), so the checkbox/toggle
// is hidden both for a target role outside this set and for a caller outside this set.
const EMULATOR_ELIGIBLE_ROLES: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin'];

function creatableRoles(callerRole: UserRole | undefined): UserRole[] {
  if (callerRole === 'RootSuperAdmin') return ['SuperAdmin', 'Admin', 'Manager', 'Receptionist', 'Therapist', 'Other', 'Customer'];
  if (callerRole === 'SuperAdmin') return ['Admin', 'Manager', 'Receptionist', 'Therapist', 'Other', 'Customer'];
  if (callerRole === 'Admin') return ['Manager', 'Receptionist', 'Therapist', 'Other', 'Customer'];
  if (callerRole === 'Manager') return ['Receptionist', 'Therapist', 'Other', 'Customer'];
  return [];
}

function emptyForm(defaultRole: UserRole) {
  return {
    name: '',
    email: '',
    phone: '',
    role: defaultRole,
    chainId: '',
    locationId: '',
    therapistId: '',
    isEmulator: false,
  };
}

export function StaffPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramChainId = searchParams.get('chainId');
  const paramLocationId = searchParams.get('locationId');

  const { user: currentUser } = useAuth();
  const roleOptions = creatableRoles(currentUser?.role);
  const [chains, setChains] = useState<Chain[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);

  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [form, setForm] = useState(emptyForm(roleOptions[0] ?? ('Admin' as UserRole)));

  const effectiveRoleOptions: UserRole[] = paramLocationId
    ? roleOptions.filter((r) => r !== 'SuperAdmin' && r !== 'Admin')
    : paramChainId
    ? roleOptions.filter((r) => r === 'SuperAdmin' || r === 'Admin' || r === 'Manager' || r === 'Receptionist')
    : form.locationId
    ? roleOptions.filter((r) => r !== 'SuperAdmin' && r !== 'Admin')
    : roleOptions;

  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    if (effectiveRoleOptions.length > 0 && !effectiveRoleOptions.includes(form.role)) {
      setForm((f) => ({ ...f, role: effectiveRoleOptions[0] }));
    }
  }, [effectiveRoleOptions, form.role]);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cId = paramChainId ? Number(paramChainId) : form.chainId ? Number(form.chainId) : undefined;
      const lId = paramLocationId ? Number(paramLocationId) : form.locationId ? Number(form.locationId) : undefined;
      const { data } = await adminStaffApi.apiAdminStaffGet(undefined, cId, lId);
      const rawUsers = data as unknown as StaffUser[];
      setStaff(rawUsers.map((u) => ({ ...u, role: normalizeUserRole(u.role) })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [paramChainId, paramLocationId, form.chainId, form.locationId]);

  useEffect(() => {
    loadStaff();
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data as unknown as Chain[];
        setChains(cs);
        if (paramChainId) {
          setForm((f) => ({ ...f, chainId: paramChainId, locationId: paramLocationId ?? '' }));
        } else if (cs.length > 0) {
          setForm((f) => ({ ...f, chainId: String(cs[0].id) }));
        }
      })
      .catch(() => {});
    adminCatalogApi
      .apiAdminCatalogTherapistsGet()
      .then(({ data }) => setTherapists(data as unknown as Therapist[]))
      .catch(() => {});
  }, [loadStaff, paramChainId, paramLocationId]);

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

  function handleStartEdit(u: StaffUser) {
    setEditingUser(u);
    setForm({
      name: u.name,
      email: u.email,
      phone: u.phone ?? '',
      role: u.role,
      chainId: u.chainId ? String(u.chainId) : '',
      locationId: u.locationId ? String(u.locationId) : '',
      therapistId: u.therapistId ? String(u.therapistId) : '',
      isEmulator: u.isEmulator,
    });
    setError(null);
  }

  function handleCancelEdit() {
    setEditingUser(null);
    setForm({ ...emptyForm(effectiveRoleOptions[0] ?? 'Admin'), chainId: form.chainId, locationId: form.locationId });
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const isEmulator = EMULATOR_ELIGIBLE_ROLES.includes(form.role) ? form.isEmulator : false;
      if (editingUser) {
        await adminStaffApi.apiAdminStaffIdPut(editingUser.id, {
          name: form.name,
          phone: form.phone || null,
          role: form.role,
          chainId: form.chainId ? Number(form.chainId) : editingUser.chainId,
          locationId: form.locationId ? Number(form.locationId) : editingUser.locationId,
          therapistId: form.therapistId ? Number(form.therapistId) : editingUser.therapistId,
          isEmulator,
          isActive: editingUser.isActive,
        });
      } else {
        const cId = paramChainId ? Number(paramChainId) : form.chainId ? Number(form.chainId) : null;
        const lId = paramLocationId ? Number(paramLocationId) : form.locationId ? Number(form.locationId) : null;
        await adminStaffApi.apiAdminStaffPost({
          name: form.name,
          email: form.email,
          role: form.role,
          chainId: cId,
          locationId: lId,
          therapistId: form.therapistId ? Number(form.therapistId) : null,
          isEmulator,
        });
      }
      handleCancelEdit();
      await loadStaff();
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : `Failed to ${editingUser ? 'update' : 'create'} staff user`);
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
      const isEmulator = EMULATOR_ELIGIBLE_ROLES.includes(u.role)
        ? (changes.isEmulator ?? u.isEmulator)
        : false;
      await adminStaffApi.apiAdminStaffIdPut(u.id, {
        name: u.name,
        phone: u.phone,
        role: u.role,
        chainId: u.chainId,
        locationId: u.locationId,
        therapistId: u.therapistId,
        isEmulator,
        isActive: changes.isActive ?? u.isActive,
      });
      await loadStaff();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update staff user');
    } finally {
      setSavingId(null);
    }
  }

  const selectedChain = chains.find((c) => String(c.id) === (paramChainId ?? form.chainId));
  const selectedLocation = locations.find((l) => String(l.id) === (paramLocationId ?? form.locationId));

  const isLocationMode = Boolean(paramLocationId);
  const isSaloonMode = Boolean(paramChainId && !paramLocationId);

  const pageTitle = isLocationMode
    ? `Location User Management — ${selectedLocation?.name ?? 'Location #' + paramLocationId}`
    : isSaloonMode
    ? `Saloon User Management — ${selectedChain?.name ?? 'Saloon Chain #' + paramChainId}`
    : 'Staff & User Accounts';

  const pageDesc = isLocationMode
    ? `Create and manage location staff (Manager, Receptionist, Therapist, Other) for ${selectedLocation?.name ?? 'this location'}.`
    : isSaloonMode
    ? `Create and manage saloon chain administrators (SuperAdmin, Admin) for ${selectedChain?.name ?? 'this saloon chain'}.`
    : 'Manage staff accounts, user roles, location scoping, and access permissions.';

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle}
        description={pageDesc}
        action={
          (paramLocationId || paramChainId) ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                paramLocationId
                  ? navigate(`/catalog/locations?chainId=${paramChainId}`)
                  : navigate('/catalog/saloons')
              }
            >
              ← Back to {paramLocationId ? 'Locations' : 'Saloons'}
            </Button>
          ) : undefined
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {effectiveRoleOptions.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle>
              {editingUser
                ? `Edit User: ${editingUser.name}`
                : isLocationMode
                ? `Add User for ${selectedLocation?.name ?? 'Location #' + paramLocationId}`
                : isSaloonMode
                ? `Add User for ${selectedChain?.name ?? 'Saloon Chain #' + paramChainId}`
                : 'Create User Account'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Saloon Chain Scope / Read-only Label */}
                {paramChainId && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Saloon Chain
                    </label>
                    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground">
                      {selectedChain?.name ?? `Chain #${paramChainId}`}
                    </div>
                  </div>
                )}

                {/* Location Scope / Read-only Label */}
                {paramLocationId && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Location Scope
                    </label>
                    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>{selectedLocation?.name ?? `Location #${paramLocationId}`}</span>
                      <Badge status="Active" className="text-[10px] py-0 px-1.5" />
                    </div>
                  </div>
                )}

                <Input
                  required
                  label="Name"
                  placeholder="Staff Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  error={getFieldError(submitError, 'name')}
                />
                <Input
                  required
                  type="email"
                  disabled={Boolean(editingUser)}
                  label="Email"
                  placeholder="staff@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  error={getFieldError(submitError, 'email')}
                />
                <Input
                  label="Phone"
                  placeholder="+1 555-0199"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  helperText={!editingUser ? "They'll receive an email to set their own password." : undefined}
                />
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Role
                  </label>
                  <Select
                    value={effectiveRoleOptions.map((r) => ({ value: r, label: r })).find((o) => o.value === form.role) ?? null}
                    onChange={(picked: SingleValue<SelectOption>) => {
                      const role = (picked?.value ?? form.role) as UserRole;
                      setForm({ ...form, role, isEmulator: form.isEmulator && EMULATOR_ELIGIBLE_ROLES.includes(role) });
                    }}
                    options={effectiveRoleOptions.map((r) => ({ value: r, label: r }))}
                    unstyled
                    classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground')}
                  />
                </div>
              </div>

              {!paramLocationId &&
                (form.role === 'Manager' || form.role === 'Receptionist' || form.role === 'Therapist' || form.role === 'Other') &&
                currentUser?.role !== 'Manager' &&
                currentUser?.role !== 'Receptionist' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Location Scope
                      </label>
                      <Select
                        isClearable
                        value={locations.map((l) => ({ value: String(l.id), label: l.name })).find((o) => o.value === form.locationId) ?? null}
                        onChange={(picked: SingleValue<SelectOption>) => setForm({ ...form, locationId: picked?.value ?? '' })}
                        placeholder="Select location..."
                        options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                        unstyled
                        classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground')}
                      />
                    </div>
                  </div>
                )}

              {form.role === 'Therapist' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Linked Therapist Record
                    </label>
                    <Select
                      isClearable
                      value={therapists.map((t) => ({ value: String(t.id), label: t.name })).find((o) => o.value === form.therapistId) ?? null}
                      onChange={(picked: SingleValue<SelectOption>) => setForm({ ...form, therapistId: picked?.value ?? '' })}
                      placeholder="Select therapist..."
                      options={therapists.map((t) => ({ value: String(t.id), label: t.name }))}
                      unstyled
                      classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground')}
                    />
                  </div>
                </div>
              )}

              {Boolean(currentUser && EMULATOR_ELIGIBLE_ROLES.includes(currentUser.role)) && EMULATOR_ELIGIBLE_ROLES.includes(form.role) && (
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="isEmulator"
                    checked={form.isEmulator}
                    onChange={(e) => setForm({ ...form, isEmulator: e.target.checked })}
                    className="h-4 w-4 rounded-sm border-input text-primary focus:ring-primary"
                  />
                  <label htmlFor="isEmulator" className="text-xs font-semibold text-foreground cursor-pointer">
                    Can Emulate (act as a customer on behalf of)
                  </label>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={submitting} className="font-semibold">
                  {submitting ? 'Saving...' : editingUser ? 'Update User' : `Create ${form.role} User`}
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
      )}

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>
            {isLocationMode
              ? `Users for ${selectedLocation?.name ?? 'Location #' + paramLocationId}`
              : isSaloonMode
              ? `Users for ${selectedChain?.name ?? 'Saloon Chain #' + paramChainId}`
              : 'User Members'}{' '}
            ({staff.length})
          </CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : staff.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No users found for this scope. Create your first user above.
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
                      ) : Boolean(currentUser && EMULATOR_ELIGIBLE_ROLES.includes(currentUser.role)) ? (
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
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(u)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={savingId === u.id}
                          onClick={() => toggleActive(u)}
                        >
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
