import { useState, type FormEvent } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader } from '@saloon/ui';
import { ArrowRight, UserPlus, X } from 'lucide-react';
import { adminCustomersApi, ApiError, authApi, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import { usePortalConfig } from '../../features/config/PortalConfigContext';
import type { AuthResponse, CustomerSummary } from '../../api/types';

export function PosPage() {
  const { user: currentUser } = useAuth();
  const { clientPortalUrl } = usePortalConfig();
  const canEmulate = currentUser?.role === 'RootSuperAdmin' || currentUser?.canEmulate;

  // --- Customer ---
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [customerSearched, setCustomerSearched] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', email: '', phone: '' });
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerError, setCustomerError] = useState<unknown>(null);
  const [emulating, setEmulating] = useState(false);

  async function searchCustomers(e?: FormEvent) {
    e?.preventDefault();
    setCustomerSearched(true);
    if (!customerQuery.trim()) {
      setCustomerResults([]);
      return;
    }
    setSearchingCustomer(true);
    try {
      const { data } = await adminCustomersApi.apiAdminCustomersSearchGet(customerQuery.trim());
      setCustomerResults(data as unknown as CustomerSummary[]);
    } catch {
      setCustomerResults([]);
    } finally {
      setSearchingCustomer(false);
    }
  }

  async function createCustomer(e: FormEvent) {
    e.preventDefault();
    setCustomerError(null);
    setCreatingCustomer(true);
    try {
      const { data } = await adminCustomersApi.apiAdminCustomersPost({
        name: newCustomerForm.name,
        email: newCustomerForm.email,
        phone: newCustomerForm.phone || null,
      });
      const { id } = data as unknown as { id: number };
      setCustomer({ id, name: newCustomerForm.name, email: newCustomerForm.email, phone: newCustomerForm.phone || null });
      setShowNewCustomerForm(false);
      setNewCustomerForm({ name: '', email: '', phone: '' });
    } catch (err) {
      setCustomerError(err);
    } finally {
      setCreatingCustomer(false);
    }
  }

  // Hands off to the customer's own booking wizard (services, scheduling, and payment all happen
  // there) rather than reimplementing that flow here -- see FRESHA_PARITY_ROADMAP.md Phase 1 notes.
  async function startBooking() {
    if (!customer) return;
    setEmulating(true);
    const win = window.open('about:blank', '_blank');
    try {
      const { data } = await authApi.apiAuthEmulateCustomerIdPost(customer.id);
      const res = data as unknown as AuthResponse;
      const targetUrl = `${clientPortalUrl}/emulate?token=${encodeURIComponent(res.token)}`;
      if (win) win.location.href = targetUrl;
      else window.location.href = targetUrl;
    } catch (err) {
      if (win) win.close();
      setCustomerError(err instanceof ApiError ? err.message : 'Failed to start booking session');
    } finally {
      setEmulating(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <PageHeader title="Point of Sale" description="Find or add a customer, then book and take payment on their behalf." />

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {customer ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <div>
                  <div className="font-semibold text-foreground">{customer.name}</div>
                  <div className="text-xs text-muted-foreground">{customer.email}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
                  <X className="h-4 w-4 mr-1" /> Change
                </Button>
              </div>

              {canEmulate ? (
                <Button
                  disabled={emulating || (currentUser?.role !== 'RootSuperAdmin' && customer.canEmulate === false)}
                  onClick={startBooking}
                  className="w-full h-11 font-semibold"
                  title={
                    currentUser?.role !== 'RootSuperAdmin' && customer.canEmulate === false
                      ? 'This customer has no bookings in your saloon chain.'
                      : undefined
                  }
                >
                  {emulating ? 'Opening...' : 'Start Booking'} <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Your account isn't enabled to book on a customer's behalf. Ask an admin to grant emulation access.
                </p>
              )}

              {customerError !== null && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                  {customerError instanceof ApiError ? customerError.message : 'Something went wrong. Try again.'}
                </div>
              )}
            </div>
          ) : (
            <>
              <form onSubmit={searchCustomers} className="flex gap-2">
                <Input
                  placeholder="Search by name, email or phone"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" variant="outline" disabled={searchingCustomer}>
                  {searchingCustomer ? 'Searching...' : 'Search'}
                </Button>
              </form>

              {customerResults.length > 0 && (
                <div className="divide-y divide-border/50 rounded-lg border border-border">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCustomer(c)}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-accent/50 transition"
                    >
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.email}</span>
                    </button>
                  ))}
                </div>
              )}
              {customerSearched && !searchingCustomer && customerResults.length === 0 && customerQuery && (
                <p className="text-xs text-muted-foreground">No matches. Add them as a new customer below.</p>
              )}

              {showNewCustomerForm ? (
                <form onSubmit={createCustomer} className="space-y-3 rounded-lg border border-border p-4">
                  <Input
                    required
                    label="Full Name"
                    value={newCustomerForm.name}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                    error={getFieldError(customerError, 'name')}
                  />
                  <Input
                    required
                    type="email"
                    label="Email"
                    value={newCustomerForm.email}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                    error={getFieldError(customerError, 'email')}
                  />
                  <Input
                    label="Phone"
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                    error={getFieldError(customerError, 'phone')}
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={creatingCustomer} className="font-semibold">
                      {creatingCustomer ? 'Creating...' : 'Create & Select'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowNewCustomerForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Button type="button" variant="outline" onClick={() => setShowNewCustomerForm(true)} className="w-full">
                  <UserPlus className="h-4 w-4 mr-1.5" /> New Customer
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
