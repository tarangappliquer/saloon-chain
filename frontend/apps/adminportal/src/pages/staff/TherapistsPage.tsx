import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, ApiError, getFieldError } from '../../api/client';
import type { Therapist } from '../../api/types';

export function TherapistsPage() {
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogTherapistsGet();
      setTherapists(data as unknown as Therapist[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load therapists');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      await adminCatalogApi.apiAdminCatalogTherapistsPost({ name });
      setName('');
      await load();
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : 'Failed to create therapist');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(t: Therapist) {
    setError(null);
    try {
      await adminCatalogApi.apiAdminCatalogTherapistsIdPut(t.id, { name: t.name, isActive: !t.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update therapist');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Therapists Roster"
        description="Manage therapist profiles and active working status."
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Add New Therapist</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 items-end max-w-md">
            <Input
              required
              label="Therapist Name"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={getFieldError(submitError, 'name')}
              className="w-full"
            />
            <Button type="submit" disabled={submitting} className="shrink-0 mb-0.5">
              {submitting ? 'Adding...' : 'Add Therapist'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Therapist Roster ({therapists.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : therapists.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No therapists found.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {therapists.map((t) => (
                  <tr key={t.id} className="hover:bg-accent/40 transition">
                    <td className="px-6 py-4 font-semibold text-foreground">{t.name}</td>
                    <td className="px-6 py-4">
                      <Badge status={t.isActive ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(t)}>
                        {t.isActive ? 'Deactivate' : 'Activate'}
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
