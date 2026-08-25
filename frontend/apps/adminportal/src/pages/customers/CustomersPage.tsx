import { startTransition, useCallback, useDeferredValue, useEffect, useOptimistic, useRef, useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Input, LoadingFallback, PageHeader, Tooltip } from '@saloon/ui';
import { adminCustomersApi, authApi, ApiError, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import { usePortalConfig } from '../../features/config/PortalConfigContext';
import { routes } from '../../routes';
import { ADMIN_ACCESS } from '../../constants';
import type { AdminCustomer, AdminCustomersPage, AuthResponse, CustomerSummary } from '../../api/types';

const PAGE_SIZE = 50;

function emptyForm() {
  return { name: '', email: '', phone: '', isWalkIn: false };
}

export function CustomersPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { clientPortalUrl } = usePortalConfig();
  // Manager+ get the full manage view (list/edit/deactivate/delete, all AdminAccess-gated on the
  // backend). Receptionist reaches this page too (merged in from the old standalone POS page) but
  // only has StaffAccess/CustomerManagement -- they get a lean search-and-checkout view instead of
  // a table full of buttons the backend would 403 on anyway.
  const canManage = currentUser ? ADMIN_ACCESS.includes(currentUser.role) : false;

  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [optimisticCustomers, setOptimisticCustomers] = useOptimistic(
    customers,
    (state, action: { type: 'toggle' | 'delete'; id: number }) => {
      if (action.type === 'delete') return state.filter((c) => c.id !== action.id);
      if (action.type === 'toggle') return state.map((c) => (c.id === action.id ? { ...c, isActive: !c.isActive } : c));
      return state;
    },
  );
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<{ name: string; id: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emulatingId, setEmulatingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<AdminCustomer | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<AdminCustomer | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  // Lean (Receptionist) search -- StaffAccess-gated /search endpoint, no pagination, no manage actions.
  const [leanResults, setLeanResults] = useState<CustomerSummary[]>([]);
  const [leanSearching, setLeanSearching] = useState(false);
  const [leanSearched, setLeanSearched] = useState(false);

  // First page (or a fresh search) -- resets the cursor and replaces the list, unlike loadMore
  // below which appends. Also what every mutation (create/edit/delete/toggle) re-runs afterward,
  // same "just reload from the top" simplicity the old full-list version had.
  async function load() {
    setLoading(true);
    setError(null);
    cursorRef.current = null;
    try {
      const { data } = await adminCustomersApi.apiAdminCustomersGet(deferredSearch || undefined, PAGE_SIZE);
      const page = data as unknown as AdminCustomersPage;
      setCustomers(page.items);
      setHasMore(page.hasMore);
      cursorRef.current = page.hasMore && page.nextCursorName != null && page.nextCursorId != null
        ? { name: page.nextCursorName, id: page.nextCursorId }
        : null;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const { data } = await adminCustomersApi.apiAdminCustomersGet(
        deferredSearch || undefined, PAGE_SIZE, cursorRef.current.name, cursorRef.current.id,
      );
      const page = data as unknown as AdminCustomersPage;
      setCustomers((prev) => [...prev, ...page.items]);
      setHasMore(page.hasMore);
      cursorRef.current = page.hasMore && page.nextCursorName != null && page.nextCursorId != null
        ? { name: page.nextCursorName, id: page.nextCursorId }
        : null;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load more customers');
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, hasMore, deferredSearch]);

  useEffect(() => {
    if (canManage) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  // Infinite scroll: fetch the next page once the sentinel row at the bottom of the table
  // scrolls into view, instead of a "Load more" click or page-number controls.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  async function leanSearch(e?: SyntheticEvent) {
    e?.preventDefault();
    setLeanSearched(true);
    if (!deferredSearch.trim()) {
      setLeanResults([]);
      return;
    }
    setLeanSearching(true);
    setError(null);
    try {
      const { data } = await adminCustomersApi.apiAdminCustomersSearchGet(deferredSearch.trim());
      setLeanResults(data as unknown as CustomerSummary[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to search customers');
    } finally {
      setLeanSearching(false);
    }
  }

  function handleSearchSubmit(e: SyntheticEvent) {
    e.preventDefault();
    if (canManage) load();
    else leanSearch();
  }

  function handleOpenAdd() {
    setEditingCustomer(null);
    setForm(emptyForm());
    setShowForm(true);
    setSubmitError(null);
  }

  function handleOpenEdit(c: AdminCustomer) {
    setEditingCustomer(c);
    setForm({ name: c.name, email: c.email, phone: c.phone ?? '', isWalkIn: (c as unknown as { isWalkIn?: boolean }).isWalkIn ?? false });
    setShowForm(true);
    setSubmitError(null);
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingCustomer(null);
    setForm(emptyForm());
    setSubmitError(null);
  }

  async function handleSubmit(e: SyntheticEvent) {
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
        const { data } = await adminCustomersApi.apiAdminCustomersPost({
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          isWalkIn: form.isWalkIn,
        });
        if (!canManage) {
          const { id } = data as unknown as { id: number };
          setLeanResults([{ id, name: form.name, email: form.email || 'Walk-in Customer', phone: form.phone || null }]);
          setLeanSearched(true);
        }
      }
      handleCancelForm();
      if (canManage) await load();
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
    startTransition(() => {
      setOptimisticCustomers({ type: 'toggle', id: c.id });
    });
    try {
      await adminCustomersApi.apiAdminCustomersIdPut(c.id, { name: c.name, phone: c.phone, isActive: !c.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update customer');
      await load();
    } finally {
      setSavingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingCustomer) return;
    const targetId = deletingCustomer.id;
    setError(null);
    setSavingId(targetId);
    startTransition(() => {
      setOptimisticCustomers({ type: 'delete', id: targetId });
    });
    try {
      await adminCustomersApi.apiAdminCustomersIdDelete(targetId);
      setDeletingCustomer(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete customer');
      await load();
    } finally {
      setSavingId(null);
    }
  }

  async function emulate(c: { id: number; canEmulate?: boolean }) {
    setError(null);
    setEmulatingId(c.id);
    const win = window.open('about:blank', '_blank');
    try {
      const { data } = await authApi.apiAuthEmulateCustomerIdPost(c.id);
      const res = data as unknown as AuthResponse;
      const targetUrl = `${clientPortalUrl}/emulate?token=${encodeURIComponent(res.token)}`;
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
      <ConfirmDialog
        isOpen={deletingCustomer !== null}
        title="Delete Customer Account"
        description={`Are you sure you want to delete customer "${deletingCustomer?.name}" (${deletingCustomer?.email})? This action cannot be undone.`}
        confirmLabel="Delete Customer"
        cancelLabel="Keep Customer"
        variant="danger"
        loading={savingId === deletingCustomer?.id}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeletingCustomer(null)}
      />

      <PageHeader
        title="Customers"
        description={
          canManage
            ? 'Manage customer accounts and launch client portal emulation sessions.'
            : 'Find or add a customer, then start their booking.'
        }
        action={
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
              {!editingCustomer && (
                <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <input
                    type="checkbox"
                    id="isWalkIn"
                    checked={form.isWalkIn}
                    onChange={(e) => setForm({ ...form, isWalkIn: e.target.checked })}
                    className="h-4 w-4 rounded border-amber-500/40 text-amber-600 focus:ring-amber-500"
                  />
                  <label htmlFor="isWalkIn" className="text-xs font-bold text-foreground cursor-pointer select-none">
                    🚶 Mark as Walk-in Customer (Instant Onboarding)
                  </label>
                </div>
              )}
              <Input
                required
                label="Full Name"
                placeholder="e.g. Jane Doe"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                error={getFieldError(submitError, 'name')}
              />
              <Input
                required={!form.isWalkIn}
                type="email"
                disabled={Boolean(editingCustomer)}
                label={form.isWalkIn ? 'Email Address (Optional for Walk-in)' : 'Email Address'}
                placeholder={form.isWalkIn ? 'Auto-generated if left blank' : 'jane@example.com'}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                error={getFieldError(submitError, 'email')}
                helperText={form.isWalkIn ? 'System will generate a walk-in address if empty.' : (!editingCustomer ? "They'll receive an email to set their own password." : undefined)}
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
          <CardTitle>{canManage ? `Customers (${customers.length}${hasMore ? '+' : ''})` : 'Find a Customer'}</CardTitle>
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
            <Button type="submit" variant="outline" disabled={leanSearching} className="shrink-0 mb-0.5">
              {leanSearching ? 'Searching...' : 'Search'}
            </Button>
          </form>
        </CardContent>

        {canManage ? (
          loading ? (
            <CardContent className="py-8">
              <LoadingFallback />
            </CardContent>
          ) : optimisticCustomers.length === 0 ? (
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
                  {optimisticCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-accent/40 transition">
                      <td className="px-6 py-4 font-semibold text-foreground flex items-center gap-2">
                        <span>{c.name}</span>
                        {(c as unknown as { isWalkIn?: boolean }).isWalkIn && (
                          <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                            🚶 Walk-In
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{c.email}</td>
                      <td className="px-6 py-4 text-muted-foreground">{c.phone ?? '-'}</td>
                      <td className="px-6 py-4">
                        <Badge status={c.isActive ? 'Active' : 'Inactive'} />
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => navigate(routes.customerProfile(c.id))}>
                            View
                          </Button>
                          {(currentUser?.role === 'RootSuperAdmin' || currentUser?.canEmulate) && (
                            // Wrapped in a span, not tooltipped directly on the Button -- a disabled
                            // button doesn't reliably fire hover events, so the span (never disabled
                            // itself) is what actually triggers the tooltip explaining why.
                            <Tooltip content={currentUser?.role !== 'RootSuperAdmin' && c.canEmulate === false ? 'This customer has no bookings in your saloon chain.' : null}>
                              <span className="inline-flex">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={emulatingId === c.id || (currentUser?.role !== 'RootSuperAdmin' && c.canEmulate === false)}
                                  onClick={() => emulate(c)}
                                >
                                  {emulatingId === c.id ? 'Opening...' : '⚡ Emulate & Book'}
                                </Button>
                              </span>
                            </Tooltip>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(c)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" disabled={savingId === c.id} onClick={() => toggleActive(c)}>
                            {c.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button variant="danger" size="sm" disabled={savingId === c.id} onClick={() => setDeletingCustomer(c)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasMore && (
                <div ref={sentinelRef} className="py-4 text-center text-xs text-muted-foreground">
                  {loadingMore ? 'Loading more...' : ''}
                </div>
              )}
            </div>
          )
        ) : leanResults.length > 0 ? (
          <div className="divide-y divide-border/50">
            {leanResults.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(routes.customerProfile(c.id))}>
                    View
                  </Button>
                  {(currentUser?.role === 'RootSuperAdmin' || currentUser?.canEmulate) && (
                    <Tooltip content={currentUser?.role !== 'RootSuperAdmin' && c.canEmulate === false ? 'This customer has no bookings in your saloon chain.' : null}>
                      <span className="inline-flex">
                        <Button
                          size="sm"
                          disabled={emulatingId === c.id || (currentUser?.role !== 'RootSuperAdmin' && c.canEmulate === false)}
                          onClick={() => emulate(c)}
                        >
                          {emulatingId === c.id ? 'Opening...' : 'Start Booking'}
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            {leanSearched ? 'No matches. Add them as a new customer above.' : 'Search for a customer to get started.'}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
