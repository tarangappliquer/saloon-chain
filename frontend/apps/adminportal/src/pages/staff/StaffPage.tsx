import { useEffect, useRef, useState, useCallback, useActionState, useOptimistic, startTransition } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Select, { type SingleValue } from 'react-select';
import { Search } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, adminStaffApi, ApiError, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location, StaffUser, Therapist, UserRole } from '../../api/types';
import { normalizeUserRole } from '../../api/types';
import { type SelectOption, selectClassNames } from '../../components/reactSelectStyles';
import { DateInput } from '../../components/DateInput';
import { routes } from '../../routes';

// IsEmulator applies to any POS_ACCESS role -- Therapist/Other/Customer are always false (see
// AdminStaffEndpoints' matching clamp). Widened to include Manager/Receptionist because POS
// checkout now runs entirely through emulation.
const EMULATOR_ELIGIBLE_ROLES: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager', 'Receptionist'];
// Separate from the above: granting/changing the flag itself stays RootSuperAdmin/SuperAdmin/
// Admin's call (matches AdminStaffEndpoints' caller-role gate) even though Manager/Receptionist
// are now eligible targets -- otherwise a Manager creating their own Receptionist could hand out
// emulation rights with zero oversight.
const CAN_GRANT_EMULATOR_ROLES: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin'];

// Customer is deliberately excluded here -- customers are created via signup/walk-in flows
// elsewhere, not this staff-account form.
function creatableRoles(callerRole: UserRole | undefined): UserRole[] {
  if (callerRole === 'RootSuperAdmin') return ['SuperAdmin', 'Admin', 'Manager', 'Receptionist', 'Therapist', 'Other'];
  if (callerRole === 'SuperAdmin') return ['Admin', 'Manager', 'Receptionist', 'Therapist', 'Other'];
  if (callerRole === 'Admin') return ['Manager', 'Receptionist', 'Therapist', 'Other'];
  if (callerRole === 'Manager') return ['Receptionist', 'Therapist', 'Other'];
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
    joiningDate: new Date().toISOString().slice(0, 10),
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
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [optimisticStaff, applyOptimisticStaffUpdate] = useOptimistic(
    staff,
    (current, updated: StaffUser) => current.map((s) => (s.id === updated.id ? updated : s)),
  );

  const [roleFilter, setRoleFilter] = useState<'All' | UserRole>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [searchKey, setSearchKey] = useState('');
  const roleFilterOptions: ('All' | UserRole)[] = ['All', ...Array.from(new Set(optimisticStaff.map((u) => u.role)))];
  const filteredStaff = optimisticStaff.filter((u) => {
    if (roleFilter !== 'All' && u.role !== roleFilter) return false;
    if (statusFilter === 'Active' && !u.isActive) return false;
    if (statusFilter === 'Inactive' && u.isActive) return false;
    const q = searchKey.trim().toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  // Load-on-scroll over the already-fetched list, same sentinel/IntersectionObserver pattern
  // CustomersPage uses for its server-paginated feed -- staff lists are small enough (tens, not
  // thousands) that a real backend keyset page isn't worth it, this just windows the render.
  const PAGE_SIZE = 25;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [roleFilter, statusFilter, searchKey, staff]);
  const visibleStaff = filteredStaff.slice(0, visibleCount);
  const hasMoreStaff = visibleCount < filteredStaff.length;

  const staffSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = staffSentinelRef.current;
    if (!el || !hasMoreStaff) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisibleCount((c) => Math.min(c + PAGE_SIZE, filteredStaff.length));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreStaff, filteredStaff.length]);

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
      const rawUsers = data;
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
        const cs = data;
        setChains(cs);
        if (paramChainId) {
          setForm((f) => ({ ...f, chainId: paramChainId, locationId: paramLocationId ?? '' }));
        } else if (cs.length > 0) {
          setForm((f) => ({ ...f, chainId: String(cs[0].id) }));
        }
      })
      .catch(() => { });
    adminCatalogApi
      .apiAdminCatalogTherapistsGet()
      .then(({ data }) => setTherapists(data))
      .catch(() => { });
  }, [loadStaff, paramChainId, paramLocationId]);

  useEffect(() => {
    if (form.chainId) {
      adminCatalogApi
        .apiAdminCatalogLocationsGet(Number(form.chainId))
        .then(({ data }) => setLocations(data))
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
      joiningDate: u.joiningDate ?? new Date().toISOString().slice(0, 10),
    });
    setError(null);
  }

  function handleCancelEdit() {
    setEditingUser(null);
    setForm({ ...emptyForm(effectiveRoleOptions[0] ?? 'Admin'), chainId: form.chainId, locationId: form.locationId });
    setError(null);
  }

  const [{ error: formError, submitError }, handleSubmit, submitting] = useActionState<{
    error: string | null;
    submitError: unknown;
  }>(
    async () => {
      try {
        const isEmulator = EMULATOR_ELIGIBLE_ROLES.includes(form.role) ? form.isEmulator : false;
        if (editingUser) {
          await adminStaffApi.apiAdminStaffIdPut(editingUser.id, {
            name: form.name,
            phone: form.phone || '',
            role: form.role,
            chainId: form.chainId ? Number(form.chainId) : editingUser.chainId,
            locationId: form.locationId ? Number(form.locationId) : editingUser.locationId,
            therapistId: form.therapistId ? Number(form.therapistId) : (editingUser.therapistId ?? 0),
            isEmulator,
            joiningDate: form.joiningDate,
            isActive: editingUser.isActive,
          });
        } else {
          const cId = paramChainId ? Number(paramChainId) : form.chainId ? Number(form.chainId) : 0;
          const lId = paramLocationId ? Number(paramLocationId) : form.locationId ? Number(form.locationId) : 0;
          await adminStaffApi.apiAdminStaffPost({
            name: form.name,
            email: form.email,
            role: form.role,
            chainId: cId,
            locationId: lId,
            therapistId: form.therapistId ? Number(form.therapistId) : 0,
            isEmulator,
            joiningDate: form.joiningDate,
          });
        }
        handleCancelEdit();
        await loadStaff();
        return { error: null, submitError: null };
      } catch (err) {
        return {
          error: err instanceof ApiError ? err.message : `Failed to ${editingUser ? 'update' : 'create'} staff user`,
          submitError: err,
        };
      }
    },
    { error: null, submitError: null },
  );

  function toggleActive(u: StaffUser) {
    updateStaff(u, { isActive: !u.isActive });
  }

  function toggleEmulator(u: StaffUser) {
    updateStaff(u, { isEmulator: !u.isEmulator });
  }

  function updateStaff(u: StaffUser, changes: Partial<Pick<StaffUser, 'isActive' | 'isEmulator'>>) {
    setError(null);
    setSavingId(u.id);
    const isEmulator = EMULATOR_ELIGIBLE_ROLES.includes(u.role) ? (changes.isEmulator ?? u.isEmulator) : false;
    const updated: StaffUser = { ...u, isActive: changes.isActive ?? u.isActive, isEmulator };
    startTransition(async () => {
      applyOptimisticStaffUpdate(updated);
      try {
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
    });
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
          paramLocationId || paramChainId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                paramLocationId
                  ? navigate(routes.catalog.locations(paramChainId))
                  : navigate(routes.catalog.saloons)
              }
            >
              ← Back to {paramLocationId ? 'Locations' : 'Saloons'}
            </Button>
          ) : currentUser?.role === 'RootSuperAdmin' ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Saloon Chain
                </label>
                <Select
                  value={chains.map((c) => ({ value: String(c.id), label: c.name })).find((o) => o.value === form.chainId) ?? null}
                  onChange={(picked: SingleValue<SelectOption>) => setForm({ ...form, chainId: picked?.value ?? '', locationId: '' })}
                  placeholder="Chain..."
                  options={chains.map((c) => ({ value: String(c.id), label: c.name }))}
                  unstyled
                  classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground')}
                />
              </div>
              <div className="w-44">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Location
                </label>
                <Select
                  isClearable
                  value={locations.map((l) => ({ value: String(l.id), label: l.name })).find((o) => o.value === form.locationId) ?? null}
                  onChange={(picked: SingleValue<SelectOption>) => setForm({ ...form, locationId: picked?.value ?? '' })}
                  placeholder="All locations"
                  options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                  unstyled
                  classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground')}
                />
              </div>
            </div>
          ) : currentUser?.role === 'SuperAdmin' || currentUser?.role === 'Admin' ? (
            <div className="w-44">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Location
              </label>
              <Select
                isClearable
                value={locations.map((l) => ({ value: String(l.id), label: l.name })).find((o) => o.value === form.locationId) ?? null}
                onChange={(picked: SingleValue<SelectOption>) => setForm({ ...form, locationId: picked?.value ?? '' })}
                placeholder="All locations"
                options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                unstyled
                classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground')}
              />
            </div>
          ) : undefined
        }
      />

      {(error || formError) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error || formError}
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
            <form action={handleSubmit} className="space-y-4">
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
                <DateInput
                  label="Joining Date"
                  value={form.joiningDate}
                  onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                  maxDate={new Date()}
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

              {/* Saloon Chain / Location Scope pickers moved to the page header (see PageHeader action
                  below) -- they act as the page's scope selector, driving both which staff this form's
                  list is scoped to and which chain/location a new location-scoped user is created in,
                  so one control up top beats separate pickers repeated in this form. */}
              {(currentUser?.role === 'RootSuperAdmin' || currentUser?.role === 'SuperAdmin' || currentUser?.role === 'Admin') &&
                !paramLocationId &&
                (form.role === 'Manager' || form.role === 'Receptionist' || form.role === 'Therapist' || form.role === 'Other') &&
                !form.locationId && (
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Pick a location from the scope selector above before creating a {form.role}.
                  </p>
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

              {Boolean(currentUser && CAN_GRANT_EMULATOR_ROLES.includes(currentUser.role)) && EMULATOR_ELIGIBLE_ROLES.includes(form.role) && (
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
        <CardHeader className="border-b border-border/50 pb-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle>
              {isLocationMode
                ? `Users for ${selectedLocation?.name ?? 'Location #' + paramLocationId}`
                : isSaloonMode
                  ? `Users for ${selectedChain?.name ?? 'Saloon Chain #' + paramChainId}`
                  : 'User Members'}{' '}
              <span className="text-muted-foreground font-normal">
                ({filteredStaff.length}{filteredStaff.length !== optimisticStaff.length ? ` of ${optimisticStaff.length}` : ''})
              </span>
            </CardTitle>
            {(roleFilter !== 'All' || statusFilter !== 'All' || searchKey) && (
              <button
                type="button"
                onClick={() => {
                  setRoleFilter('All');
                  setStatusFilter('All');
                  setSearchKey('');
                }}
                className="text-xs font-semibold text-primary hover:underline self-start sm:self-auto"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Role</label>
              <Select
                value={{ value: roleFilter, label: roleFilter === 'All' ? 'All Roles' : roleFilter }}
                onChange={(picked: SingleValue<SelectOption>) => setRoleFilter((picked?.value as 'All' | UserRole) ?? 'All')}
                options={roleFilterOptions.map((r) => ({ value: r, label: r === 'All' ? 'All Roles' : r }))}
                unstyled
                classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground')}
              />
            </div>
            <div className="w-40">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Status</label>
              <Select
                value={{ value: statusFilter, label: statusFilter === 'All' ? 'All Status' : statusFilter }}
                onChange={(picked: SingleValue<SelectOption>) => setStatusFilter((picked?.value as 'All' | 'Active' | 'Inactive') ?? 'All')}
                options={[
                  { value: 'All', label: 'All Status' },
                  { value: 'Active', label: 'Active' },
                  { value: 'Inactive', label: 'Inactive' },
                ]}
                unstyled
                classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground')}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="staff-search" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="staff-search"
                  placeholder="Name or email..."
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                  className="w-64 pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : optimisticStaff.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No users found for this scope. Create your first user above.
          </CardContent>
        ) : filteredStaff.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No users match this filter/search.
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
                  <th className="px-6 py-3.5">Joining Date</th>
                  <th className="px-6 py-3.5">Emulator Flag</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {visibleStaff.map((u) => (
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
                    <td className="px-6 py-4 text-muted-foreground">{u.joiningDate ?? '—'}</td>
                    <td className="px-6 py-4">
                      {!EMULATOR_ELIGIBLE_ROLES.includes(u.role) ? (
                        <span className="text-muted-foreground">n/a</span>
                      ) : currentUser && CAN_GRANT_EMULATOR_ROLES.includes(currentUser.role) ? (
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
            {hasMoreStaff && (
              <div ref={staffSentinelRef} className="py-4 text-center text-xs text-muted-foreground">
                Loading more...
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
