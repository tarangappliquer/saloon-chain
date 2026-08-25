import { useEffect, useState, useOptimistic, startTransition, type SyntheticEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminAppointmentStatusesApi, ApiError, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import { ADMIN_ACCESS } from '../../constants';
import type { AppointmentStatusDto } from '@saloon/api-client';

const COLOR_PRESETS = [
  { label: 'Ocean Blue', hex: '#3B82F6' },
  { label: 'Amber Gold', hex: '#F59E0B' },
  { label: 'Emerald Green', hex: '#10B981' },
  { label: 'Purple Violet', hex: '#8B5CF6' },
  { label: 'Rose Red', hex: '#EF4444' },
  { label: 'Slate Gray', hex: '#6B7280' },
];

function emptyForm() {
  return { name: '', colorHex: '#3B82F6' };
}

export function AppointmentStatusesPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser ? ADMIN_ACCESS.includes(currentUser.role) : false;

  const [statuses, setStatuses] = useState<AppointmentStatusDto[]>([]);
  const [optimisticStatuses, setOptimisticStatuses] = useOptimistic(
    statuses,
    (state, action: { type: 'toggle' | 'delete'; id: number }) => {
      if (action.type === 'delete') return state.filter((s) => Number(s.id) !== action.id);
      if (action.type === 'toggle') return state.map((s) => (Number(s.id) === action.id ? { ...s, isActive: !s.isActive } : s));
      return state;
    },
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingStatus, setEditingStatus] = useState<AppointmentStatusDto | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const [deletingStatus, setDeletingStatus] = useState<AppointmentStatusDto | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminAppointmentStatusesApi.apiAdminAppointmentStatusesGet();
      setStatuses(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load appointment statuses');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleOpenAdd() {
    setEditingStatus(null);
    setForm(emptyForm());
    setShowForm(true);
    setSubmitError(null);
  }

  function handleOpenEdit(s: AppointmentStatusDto) {
    setEditingStatus(s);
    setForm({ name: s.name, colorHex: s.colorHex });
    setShowForm(true);
    setSubmitError(null);
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingStatus(null);
    setForm(emptyForm());
    setSubmitError(null);
  }

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (editingStatus) {
        await adminAppointmentStatusesApi.apiAdminAppointmentStatusesIdPut(Number(editingStatus.id), {
          name: form.name,
          colorHex: form.colorHex,
          sortOrder: editingStatus.sortOrder,
          isActive: editingStatus.isActive,
        });
      } else {
        await adminAppointmentStatusesApi.apiAdminAppointmentStatusesPost({
          name: form.name,
          colorHex: form.colorHex,
          sortOrder: statuses.filter((s) => !s.isSystem).length,
        });
      }
      handleCancelForm();
      await load();
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : `Failed to ${editingStatus ? 'update' : 'create'} appointment status`);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(s: AppointmentStatusDto) {
    setError(null);
    setSavingId(Number(s.id));
    startTransition(() => {
      setOptimisticStatuses({ type: 'toggle', id: Number(s.id) });
    });
    try {
      await adminAppointmentStatusesApi.apiAdminAppointmentStatusesIdPut(Number(s.id), {
        name: s.name,
        colorHex: s.colorHex,
        sortOrder: s.sortOrder,
        isActive: !s.isActive,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update appointment status');
      await load();
    } finally {
      setSavingId(null);
    }
  }

  // Swaps SortOrder with the adjacent non-system row -- the fixed Complete row is excluded from
  // the orderable list (backend forces it last regardless), so this only ever reorders siblings.
  async function move(index: number, direction: -1 | 1, orderable: AppointmentStatusDto[]) {
    const other = orderable[index + direction];
    if (!other) return;
    const current = orderable[index];
    setSavingId(Number(current.id));
    setError(null);
    try {
      await Promise.all([
        adminAppointmentStatusesApi.apiAdminAppointmentStatusesIdPut(Number(current.id), {
          name: current.name, colorHex: current.colorHex, sortOrder: other.sortOrder, isActive: current.isActive,
        }),
        adminAppointmentStatusesApi.apiAdminAppointmentStatusesIdPut(Number(other.id), {
          name: other.name, colorHex: other.colorHex, sortOrder: current.sortOrder, isActive: other.isActive,
        }),
      ]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reorder appointment statuses');
    } finally {
      setSavingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingStatus) return;
    const targetId = Number(deletingStatus.id);
    setError(null);
    setSavingId(targetId);
    startTransition(() => {
      setOptimisticStatuses({ type: 'delete', id: targetId });
    });
    try {
      await adminAppointmentStatusesApi.apiAdminAppointmentStatusesIdDelete(targetId);
      setDeletingStatus(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete appointment status');
      await load();
    } finally {
      setSavingId(null);
    }
  }

  const orderable = statuses.filter((s) => !s.isSystem);

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deletingStatus !== null}
        title="Delete Appointment Status"
        description={`Are you sure you want to delete status "${deletingStatus?.name}"?`}
        confirmLabel="Delete Status"
        cancelLabel="Cancel"
        variant="danger"
        loading={savingId === deletingStatus?.id}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeletingStatus(null)}
      />

      <PageHeader
        title="Appointment Statuses"
        description="Configure custom progress labels (Arrived, Started...) shown on a confirmed booking's detail panel. 'Complete' is fixed and always sorts last."
        action={
          isAdmin && (
            <Button onClick={handleOpenAdd} className="font-semibold">
              + New Status
            </Button>
          )
        }
      />

      {error && <div className="rounded-xl bg-destructive/15 border border-destructive/30 p-4 text-xs font-semibold text-destructive">{error}</div>}

      {showForm && (
        <Card className="border-primary/40 shadow-lg">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle>{editingStatus ? `Edit Status: ${editingStatus.name}` : 'Create Custom Appointment Status'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
              <Input
                required
                label="Status Name"
                placeholder="e.g. Arrived, Started, In Progress"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                error={getFieldError(submitError, 'name')}
              />

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Badge Color</label>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setForm({ ...form, colorHex: c.hex })}
                      className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border transition-all ${form.colorHex === c.hex ? 'border-primary ring-2 ring-primary/30 font-bold' : 'border-border hover:border-primary/50'
                        }`}
                    >
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <Button type="submit" disabled={submitting} className="font-semibold">
                  {submitting ? 'Saving...' : editingStatus ? 'Update Status' : 'Create Status'}
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
          <CardTitle>Configured Statuses ({optimisticStatuses.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : optimisticStatuses.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">No appointment statuses configured.</CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Order</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Scope</th>
                  <th className="px-6 py-3.5">State</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {optimisticStatuses.map((s) => {
                  const orderIdx = orderable.findIndex((o) => o.id === s.id);
                  return (
                    <tr key={String(s.id)} className="hover:bg-accent/40 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {s.isSystem ? (
                          <span className="text-[10px] font-bold text-muted-foreground">— fixed —</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={orderIdx === 0 || savingId === Number(s.id)}
                              onClick={() => move(orderIdx, -1, orderable)}
                              className="rounded border border-border px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={orderIdx === orderable.length - 1 || savingId === Number(s.id)}
                              onClick={() => move(orderIdx, 1, orderable)}
                              className="rounded border border-border px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              ↓
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="h-3.5 w-3.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: s.colorHex }} />
                          <span className="font-bold text-foreground text-sm">{s.name}</span>
                          {s.isSystem && (
                            <span className="inline-flex items-center rounded-md bg-muted border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                              🔒 Fixed
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {s.chainName ? (
                          <span className="inline-flex items-center rounded-md bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[11px] font-bold text-purple-600 dark:text-purple-400">
                            🏰 Saloon: {String(s.chainName)}
                          </span>
                        ) : s.locationName ? (
                          <span className="inline-flex items-center rounded-md bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                            📍 Location: {String(s.locationName)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-muted border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            🌐 System Default
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge status={s.isActive ? 'Active' : 'Inactive'} />
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {isAdmin && !s.isSystem && (
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(s)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" disabled={savingId === Number(s.id)} onClick={() => toggleActive(s)}>
                              {s.isActive ? 'Deactivate' : 'Activate'}
                            </Button>
                            {s.chainId !== null || s.locationId !== null ? (
                              <Button variant="danger" size="sm" disabled={savingId === Number(s.id)} onClick={() => setDeletingStatus(s)}>
                                Delete
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
