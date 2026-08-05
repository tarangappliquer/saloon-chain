import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Select, { type SingleValue } from 'react-select';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, adminStaffApi, ApiError, getFieldError } from '../../api/client';
import type { Chain, StaffUser, UserRole } from '../../api/types';
import { normalizeUserRole } from '../../api/types';
import { type SelectOption, selectClassNames } from '../../components/reactSelectStyles';

const SALOON_USER_ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: 'SuperAdmin', label: 'SuperAdmin', desc: 'Full saloon chain management & configuration' },
  { value: 'Admin', label: 'Admin', desc: 'Saloon chain operational administration' },
];

function emptyForm() {
  return { name: '', email: '', phone: '', role: 'SuperAdmin' as UserRole };
}

export function SaloonUsersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramChainId = searchParams.get('chainId');
  const chainId = paramChainId ? Number(paramChainId) : null;

  const [chain, setChain] = useState<Chain | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!chainId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminStaffApi.apiAdminStaffGet(undefined, chainId);
      const rawUsers = data as unknown as StaffUser[];
      const allUsers = rawUsers.map((u) => ({ ...u, role: normalizeUserRole(u.role) }));
      setStaff(allUsers.filter((u) => u.role === 'SuperAdmin' || u.role === 'Admin'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load saloon users');
    } finally {
      setLoading(false);
    }
  }, [chainId]);

  useEffect(() => {
    if (chainId) {
      adminCatalogApi
        .apiAdminCatalogChainsGet()
        .then(({ data }) => {
          const cs = data as unknown as Chain[];
          const found = cs.find((c) => c.id === chainId);
          if (found) setChain(found);
        })
        .catch(() => { });
      loadUsers();
    }
  }, [chainId, loadUsers]);

  function handleStartEdit(u: StaffUser) {
    setEditingUser(u);
    setForm({
      name: u.name,
      email: u.email,
      phone: u.phone ?? '',
      role: u.role,
    });
    setError(null);
  }

  function handleCancelEdit() {
    setEditingUser(null);
    setForm(emptyForm());
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!chainId) return;
    setError(null);
    setSubmitError(null);
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
          role: form.role,
          chainId,
          locationId: null,
          therapistId: null,
        });
      }
      handleCancelEdit();
      await loadUsers();
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : `Failed to ${editingUser ? 'update' : 'create'} saloon user`);
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
        role: u.role,
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
        title={`Saloon User Management ${chain ? `— ${chain.name}` : ''}`}
        description="Create and manage saloon chain administrators (SuperAdmin, Admin)."
        action={
          <Button variant="outline" size="sm" onClick={() => navigate('/catalog/saloons')}>
            ← Back to Saloons
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {/* Add / Edit Saloon User Form */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>
            {editingUser
              ? `Edit Administrator: ${editingUser.name}`
              : `Add Saloon Administrator ${chain ? `for ${chain.name}` : ''}`}
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
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>{chain?.name ?? (chainId ? `Chain #${chainId}` : 'Selected Chain')}</span>
                  <Badge status="Active" className="text-[10px] py-0 px-1.5" />
                </div>
              </div>

              <Input
                required
                label="Full Name"
                placeholder="e.g. John Admin"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                error={getFieldError(submitError, 'name')}
              />

              <Input
                required
                type="email"
                disabled={Boolean(editingUser)}
                label="Email Address"
                placeholder="admin@saloon.com"
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
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Role
              </label>
              <Select
                value={SALOON_USER_ROLES.map((r) => ({ value: r.value, label: `${r.label} — ${r.desc}` })).find((o) => o.value === form.role) ?? null}
                onChange={(picked: SingleValue<SelectOption>) => setForm({ ...form, role: (picked?.value ?? form.role) as UserRole })}
                options={SALOON_USER_ROLES.map((r) => ({ value: r.value, label: `${r.label} — ${r.desc}` }))}
                unstyled
                classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground max-w-md')}
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting} className="font-semibold">
                {submitting ? 'Saving...' : editingUser ? 'Update Administrator' : `Create ${form.role} User`}
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

      {/* Saloon Users Table */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Saloon Administrators ({staff.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : staff.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No administrators created for this saloon chain yet.
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
