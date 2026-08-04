import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCustomersApi, authApi, ApiError, CLIENT_PORTAL_URL, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { AdminCustomer, AuthResponse } from '../../api/types';

function emptyForm() {
  return { name: '', email: '', phone: '' };
}

export function CustomersPage() {
  const { user: currentUser } = useAuth();
  const canCreate = currentUser?.role === 'RootSuperAdmin' || currentUser?.role === 'SuperAdmin' || currentUser?.role === 'Admin';

  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emulatingId, setEmulatingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<AdminCustomer | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminCustomersApi.apiAdminCustomersGet(search || undefined);
      setCustomers(data as unknown as AdminCustomer[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    load();
  }

  function handleOpenAdd() {
    setEditingCustomer(null);
    setForm(emptyForm());
    setShowForm(true);
    setSubmitError(null);
  }

  function handleOpenEdit(c: AdminCustomer) {
    setEditingCustomer(c);
    setForm({ name: c.name, email: c.email, phone: c.phone ?? '' });
    setShowForm(true);
    setSubmitError(null);
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingCustomer(null);
    setForm(emptyForm());
    setSubmitError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (editingCustomer) {
        await adminCustomersApi.apiAdminCustomersIdPut(editingCustomer.id, {
          name: form.name,
          phone: form.phone || null,
          isActive: editingCustomer.isActive,
        });
      } else {
        await adminCustomersApi.apiAdminCustomersPost({
          name: form.name,
          email: form.email,
          phone: form.phone || null,
        });
      }
      handleCancelForm();
      await load();
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : `Failed to ${editingCustomer ? 'update' : 'create'} customer`);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(c: AdminCustomer) {
    setError(null);
    setSavingId(c.id);
    try {
      await adminCustomersApi.apiAdminCustomersIdPut(c.id, { name: c.name, phone: c.phone, isActive: !c.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update customer');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(c: AdminCustomer) {
    if (!window.confirm(`Delete customer "${c.name}"? This cannot be undone.`)) return;
    setError(null);
    setSavingId(c.id);
    try {
      await adminCustomersApi.apiAdminCustomersIdDelete(c.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete customer');
      setSavingId(null);
    }
  }

  async function emulate(c: AdminCustomer) {
    setError(null);
    setEmulatingId(c.id);
    const win = window.open('about:blank', '_blank');
    try {
      const { data } = await authApi.apiAuthEmulateCustomerIdPost(c.id);
      const res = data as unknown as AuthResponse;
      const targetUrl = `${CLIENT_PORTAL_URL}/emulate?token=${encodeURIComponent(res.token)}`;
      if (win) {
        win.location.href = targetUrl;
      } else {
        window.location.href = targetUrl;
      }
    } catch (err) {
      if (win) win.close();
      setError(err instanceof ApiError ? err.message : 'Failed to start emulation session');
    } finally {
      setEmulatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Directory"
        description="Manage customer accounts and launch client portal emulation sessions."
        action={
          canCreate &&
          !showForm && (
            <Button onClick={handleOpenAdd} className="font-semibold">
              + Add Customer
            </Button>
          )
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {showForm && (
        <Card className="border-primary/30 shadow-lift">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle>{editingCustomer ? `Edit Customer: ${editingCustomer.name}` : 'Add New Customer'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
              <Input
                required
                label="Full Name"
                placeholder="e.g. Jane Doe"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                error={getFieldError(submitError, 'name')}
              />
              <Input
                required
                type="email"
                disabled={Boolean(editingCustomer)}
                label="Email Address"
                placeholder="jane@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                error={getFieldError(submitError, 'email')}
              />
              <Input
                label="Phone"
                placeholder="+1 555-0199"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                error={getFieldError(submitError, 'phone')}
                helperText={!editingCustomer ? "They'll receive an email to set their own password." : undefined}
              />
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={submitting} className="font-semibold">
                  {submitting ? 'Saving...' : editingCustomer ? 'Update Customer' : 'Create Customer'}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancelForm} disabled={submitting}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Customers ({customers.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3 items-end max-w-lg">
            <Input
              label="Search by Name or Email"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
            <Button type="submit" variant="outline" className="shrink-0 mb-0.5">
              Search
            </Button>
          </form>
        </CardContent>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : customers.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">No customers found.</CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Email</th>
                  <th className="px-6 py-3.5">Phone</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-accent/40 transition">
                    <td className="px-6 py-4 font-semibold text-foreground">{c.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{c.email}</td>
                    <td className="px-6 py-4 text-muted-foreground">{c.phone ?? '-'}</td>
                    <td className="px-6 py-4">
                      <Badge status={c.isActive ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(currentUser?.role === 'RootSuperAdmin' || currentUser?.canEmulate) && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={emulatingId === c.id || (currentUser?.role !== 'RootSuperAdmin' && c.canEmulate === false)}
                            onClick={() => emulate(c)}
                            title={currentUser?.role !== 'RootSuperAdmin' && c.canEmulate === false ? 'This customer has no bookings in your saloon chain.' : undefined}
                          >
                            {emulatingId === c.id ? 'Opening...' : 'Emulate'}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(c)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" disabled={savingId === c.id} onClick={() => toggleActive(c)}>
                          {c.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button variant="danger" size="sm" disabled={savingId === c.id} onClick={() => handleDelete(c)}>
                          Delete
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
