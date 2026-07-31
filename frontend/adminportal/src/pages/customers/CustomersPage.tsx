import { useState, type FormEvent } from 'react';
import { api, ApiError, CLIENT_PORTAL_URL } from '../../api/client';
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
      setResults(await api.get<CustomerSummary[]>(`/api/admin/customers/search?q=${encodeURIComponent(query)}`));
      setSearched(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed');
    }
  }

  // Exchanges the admin's session for a short-lived customer token, then hands it to the
  // clientportal (a separate app/origin) via a redirect -- /emulate there swaps it in and fetches
  // the profile itself via GET /api/auth/me rather than trusting anything carried in the URL.
  async function emulate(customer: CustomerSummary) {
    setError(null);
    setEmulatingId(customer.id);
    try {
      const res = await api.post<AuthResponse>(`/api/auth/emulate/${customer.id}`);
      window.location.href = `${CLIENT_PORTAL_URL}/emulate?token=${encodeURIComponent(res.token)}`;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start emulation session');
      setEmulatingId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Customers</h1>
      <p className="mb-4 text-sm text-gray-500">
        Search for a customer to open the client portal on their behalf. Requires your account to be marked as an
        emulator on the Staff page.
      </p>

      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <input
          required
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
        <button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white">
          Search
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {searched &&
        (results.length === 0 ? (
          <p className="text-gray-500">No customers found.</p>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">Phone</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 dark:border-gray-900">
                  <td className="py-2">{c.name}</td>
                  <td className="py-2">{c.email}</td>
                  <td className="py-2">{c.phone ?? '-'}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={emulatingId === c.id}
                      onClick={() => emulate(c)}
                      className="text-purple-600 hover:underline disabled:opacity-40"
                    >
                      {emulatingId === c.id ? 'Opening…' : 'Log in as customer'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </div>
  );
}
