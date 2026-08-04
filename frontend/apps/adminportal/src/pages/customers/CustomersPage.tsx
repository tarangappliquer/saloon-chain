import { useState, type FormEvent } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader } from '@saloon/ui';
import { adminCustomersApi, ApiError, authApi, CLIENT_PORTAL_URL } from '../../api/client';
import type { AuthResponse, CustomerSummary } from '../../api/types';

export function CustomersPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emulatingId, setEmulatingId] = useState<number | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { data } = await adminCustomersApi.apiAdminCustomersSearchGet(query);
      setResults(data as unknown as CustomerSummary[]);
      setSearched(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed');
    }
  }

  async function emulate(customer: CustomerSummary) {
    setError(null);
    setEmulatingId(customer.id);
    try {
      const { data } = await authApi.apiAuthEmulateCustomerIdPost(customer.id);
      const res = data as unknown as AuthResponse;
      window.location.href = `${CLIENT_PORTAL_URL}/emulate?token=${encodeURIComponent(res.token)}`;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start emulation session');
      setEmulatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Directory & Emulation"
        description="Search for registered customers and launch client portal emulation sessions."
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Customer Search</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 items-end max-w-lg">
            <Input
              required
              label="Customer Name or Email"
              placeholder="Search by name or email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full"
            />
            <Button type="submit" className="shrink-0 mb-0.5">
              Search Customers
            </Button>
          </form>
        </CardContent>
      </Card>

      {searched && (
        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle>Search Results ({results.length})</CardTitle>
          </CardHeader>
          {results.length === 0 ? (
            <CardContent className="py-8 text-center text-xs text-muted-foreground">
              No matching customers found.
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                    <th className="px-6 py-3.5">Name</th>
                    <th className="px-6 py-3.5">Email</th>
                    <th className="px-6 py-3.5">Phone</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {results.map((c) => (
                    <tr key={c.id} className="hover:bg-accent/40 transition">
                      <td className="px-6 py-4 font-semibold text-foreground">{c.name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{c.email}</td>
                      <td className="px-6 py-4 text-muted-foreground">{c.phone ?? '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={emulatingId === c.id}
                          onClick={() => emulate(c)}
                        >
                          {emulatingId === c.id ? 'Opening...' : 'Log in as Customer'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
