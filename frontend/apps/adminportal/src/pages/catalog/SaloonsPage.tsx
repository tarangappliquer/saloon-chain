import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Input, KpiTile, LoadingFallback, PageHeader } from '@saloon/ui';
import { Building2, CheckCircle2, MapPin, UserPlus, XCircle } from 'lucide-react';
import { adminCatalogApi, ApiError, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location } from '../../api/types';
import { routes } from '../../routes';

export function SaloonsPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isRootSuperAdmin = currentUser?.role === 'RootSuperAdmin';
  const canEditChain = isRootSuperAdmin || currentUser?.role === 'SuperAdmin';
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add / Edit Chain form state
  const [showForm, setShowForm] = useState(false);
  const [editingChain, setEditingChain] = useState<Chain | null>(null);
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Locations modal state for selected chain
  const [selectedChainForLocations, setSelectedChainForLocations] = useState<Chain | null>(null);
  const [chainLocations, setChainLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  async function loadChains() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogChainsGet();
      setChains(data as unknown as Chain[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load saloon chains');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadChains();
  }, []);

  function handleOpenAdd() {
    setEditingChain(null);
    setName('');
    setIsActive(true);
    setShowForm(true);
    setError(null);
    setSubmitError(null);
  }

  function handleOpenEdit(c: Chain) {
    setEditingChain(c);
    setName(c.name);
    setIsActive(c.isActive ?? true);
    setShowForm(true);
    setError(null);
    setSubmitError(null);
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingChain(null);
    setName('');
    setIsActive(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (editingChain) {
        await adminCatalogApi.apiAdminCatalogChainsIdPut(editingChain.id, { name, isActive });
      } else {
        await adminCatalogApi.apiAdminCatalogChainsPost({ name });
      }
      handleCancelForm();
      await loadChains();
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : 'Failed to save saloon chain');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (deleteConfirmId === null) return;
    setError(null);
    setDeletingId(deleteConfirmId);
    try {
      await adminCatalogApi.apiAdminCatalogChainsIdDelete(deleteConfirmId);
      setDeleteConfirmId(null);
      await loadChains();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete saloon chain');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleOpenLocationsModal(chain: Chain) {
    setSelectedChainForLocations(chain);
    setLoadingLocations(true);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogLocationsGet(chain.id);
      setChainLocations(data as unknown as Location[]);
    } catch {
      setChainLocations([]);
    } finally {
      setLoadingLocations(false);
    }
  }

  function handleCloseLocationsModal() {
    setSelectedChainForLocations(null);
    setChainLocations([]);
  }

  function handleNavigateToLocations(chainId: number) {
    navigate(routes.catalog.locations(chainId));
  }

  function handleNavigateToUsers(chainId: number) {
    navigate(routes.catalog.saloonUsers(chainId));
  }

  const totalCount = chains.length;
  const activeCount = chains.filter((c) => c.isActive !== false).length;
  const inactiveCount = totalCount - activeCount;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirmId !== null}
        title="Delete Saloon Chain"
        description="Are you sure you want to delete this saloon chain? All associated location data and settings will be permanently removed. This action cannot be undone."
        confirmLabel="Delete Saloon Chain"
        cancelLabel="Keep Chain"
        variant="danger"
        loading={deletingId !== null}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteConfirmId(null)}
      />

      <PageHeader
        title="Saloon Chains"
        description={
          isRootSuperAdmin
            ? 'Manage saloon chains, tenant boundaries, and chain users (RootSuperAdmin access).'
            : canEditChain
            ? "View and edit your saloon chain's details."
            : "View your saloon chain's details."
        }
        action={
          !showForm && isRootSuperAdmin && (
            <Button onClick={handleOpenAdd} className="font-semibold">
              + Add Saloon Chain
            </Button>
          )
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {/* KPI Overview Tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiTile
          title="Total Chains"
          value={totalCount}
          icon={<Building2 className="h-4 w-4" />}
          subtext="Configured tenant chains"
        />
        <KpiTile
          title="Active Chains"
          value={activeCount}
          changeType="positive"
          icon={<CheckCircle2 className="h-4 w-4" />}
          subtext="Operational chains"
        />
        <KpiTile
          title="Inactive Chains"
          value={inactiveCount}
          changeType="negative"
          icon={<XCircle className="h-4 w-4" />}
          subtext="Disabled chains"
        />
      </div>

      {/* Create / Edit Form Card */}
      {showForm && (
        <Card className="border-primary/30 shadow-lift">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle>{editingChain ? `Edit Saloon Chain #${editingChain.id}` : 'Create New Saloon Chain'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
              <Input
                required
                label="Chain Name"
                placeholder="e.g. Elegance Saloons or Urban Glow Chain"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={getFieldError(submitError, 'name')}
              />

              {editingChain && (
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                  <label htmlFor="isActive" className="text-xs font-semibold text-foreground cursor-pointer">
                    Chain Active & Operational
                  </label>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : editingChain ? 'Update Chain' : 'Create Chain'}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancelForm} disabled={submitting}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Saloon Chains Data Table */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>All Saloon Chains ({chains.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : chains.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No saloon chains found. Click "+ Add Saloon Chain" above to create one.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">ID</th>
                  <th className="px-6 py-3.5">Saloon Chain Name</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {chains.map((c) => (
                  <tr key={c.id} className="hover:bg-accent/40 transition">
                    <td className="px-6 py-4 font-mono text-muted-foreground">#{c.id}</td>
                    <td className="px-6 py-4 font-semibold text-foreground">{c.name}</td>
                    <td className="px-6 py-4">
                      <Badge status={c.isActive !== false ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap min-w-max">
                      <div className="flex items-center justify-end gap-2 shrink-0 w-max">
                        {isRootSuperAdmin && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleNavigateToUsers(c.id)}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Add User
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenLocationsModal(c)}
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          Locations
                        </Button>
                        {canEditChain && (
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(c)}>
                            Edit
                          </Button>
                        )}
                        {isRootSuperAdmin && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={deletingId === c.id}
                            onClick={() => setDeleteConfirmId(c.id)}
                          >
                            {deletingId === c.id ? 'Deleting...' : 'Delete'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Locations Modal Dialog */}
      {selectedChainForLocations && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <Card className="w-full max-w-2xl shadow-lift border-border bg-card">
            <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Locations for {selectedChainForLocations.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Saloon Chain ID #{selectedChainForLocations.id}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleCloseLocationsModal}>
                ✕
              </Button>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {loadingLocations ? (
                <div className="py-8">
                  <LoadingFallback />
                </div>
              ) : chainLocations.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No locations configured for this saloon chain yet.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-80 divide-y divide-border/50">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                        <th className="px-4 py-2.5">Location</th>
                        <th className="px-4 py-2.5">Address</th>
                        <th className="px-4 py-2.5">Working Hours</th>
                        <th className="px-4 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {chainLocations.map((l) => (
                        <tr key={l.id} className="hover:bg-accent/40 transition">
                          <td className="px-4 py-3 font-semibold text-foreground">{l.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{l.address ?? '-'}</td>
                          <td className="px-4 py-3 font-mono text-muted-foreground">
                            {l.openTime} - {l.closeTime}
                          </td>
                          <td className="px-4 py-3">
                            <Badge status={l.isActive !== false ? 'Active' : 'Inactive'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border/50 pt-4">
                <Button
                  variant="primary"
                  onClick={() => handleNavigateToLocations(selectedChainForLocations.id)}
                >
                  Manage in Locations Page
                </Button>
                <Button variant="outline" onClick={handleCloseLocationsModal}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
