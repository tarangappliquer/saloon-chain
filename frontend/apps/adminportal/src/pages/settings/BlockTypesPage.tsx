import { useEffect, useState, useOptimistic, startTransition, type SyntheticEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminSchedulingApi, ApiError, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import { ADMIN_ACCESS } from '../../constants';
import type { BlockTypeDto } from '@saloon/api-client';

const DURATION_OPTIONS = [
  { label: '15 Minutes', value: 15 },
  { label: '30 Minutes', value: 30 },
  { label: '45 Minutes', value: 45 },
  { label: '60 Minutes (1 Hour)', value: 60 },
  { label: '90 Minutes (1.5 Hours)', value: 90 },
  { label: '120 Minutes (2 Hours)', value: 120 },
];

const COLOR_PRESETS = [
  { label: 'Amber Gold', hex: '#F59E0B' },
  { label: 'Ocean Blue', hex: '#3B82F6' },
  { label: 'Emerald Green', hex: '#10B981' },
  { label: 'Purple Violet', hex: '#8B5CF6' },
  { label: 'Rose Red', hex: '#EF4444' },
  { label: 'Slate Gray', hex: '#6B7280' },
];

function emptyForm() {
  return {
    name: '',
    isPaid: false,
    defaultDurationMinutes: 30,
    colorHex: '#F59E0B',
  };
}

export function BlockTypesPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser ? ADMIN_ACCESS.includes(currentUser.role) : false;

  const [blockTypes, setBlockTypes] = useState<BlockTypeDto[]>([]);
  const [optimisticBlockTypes, setOptimisticBlockTypes] = useOptimistic(
    blockTypes,
    (state, action: { type: 'toggle' | 'delete'; id: number }) => {
      if (action.type === 'delete') return state.filter((b) => Number(b.id) !== action.id);
      if (action.type === 'toggle') return state.map((b) => (Number(b.id) === action.id ? { ...b, isActive: !b.isActive } : b));
      return state;
    },
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState<BlockTypeDto | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const [deletingType, setDeletingType] = useState<BlockTypeDto | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminSchedulingApi.apiAdminSchedulingBlockTypesGet();
      setBlockTypes(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load block types');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleOpenAdd() {
    setEditingType(null);
    setForm(emptyForm());
    setShowForm(true);
    setSubmitError(null);
  }

  function handleOpenEdit(b: BlockTypeDto) {
    setEditingType(b);
    setForm({
      name: b.name,
      isPaid: b.isPaid,
      defaultDurationMinutes: Number(b.defaultDurationMinutes),
      colorHex: b.colorHex,
    });
    setShowForm(true);
    setSubmitError(null);
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingType(null);
    setForm(emptyForm());
    setSubmitError(null);
  }

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (editingType) {
        await adminSchedulingApi.apiAdminSchedulingBlockTypesIdPut(Number(editingType.id), {
          name: form.name,
          isPaid: form.isPaid,
          defaultDurationMinutes: form.defaultDurationMinutes,
          colorHex: form.colorHex,
          isActive: editingType.isActive,
        });
      } else {
        await adminSchedulingApi.apiAdminSchedulingBlockTypesPost({
          name: form.name,
          isPaid: form.isPaid,
          defaultDurationMinutes: form.defaultDurationMinutes,
          colorHex: form.colorHex,
        });
      }
      handleCancelForm();
      await load();
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : `Failed to ${editingType ? 'update' : 'create'} block type`);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(b: BlockTypeDto) {
    setError(null);
    setSavingId(Number(b.id));
    startTransition(() => {
      setOptimisticBlockTypes({ type: 'toggle', id: Number(b.id) });
    });
    try {
      await adminSchedulingApi.apiAdminSchedulingBlockTypesIdPut(Number(b.id), {
        name: b.name,
        isPaid: b.isPaid,
        defaultDurationMinutes: b.defaultDurationMinutes,
        colorHex: b.colorHex,
        isActive: !b.isActive,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update block type');
      await load();
    } finally {
      setSavingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingType) return;
    const targetId = Number(deletingType.id);
    setError(null);
    setSavingId(targetId);
    startTransition(() => {
      setOptimisticBlockTypes({ type: 'delete', id: targetId });
    });
    try {
      await adminSchedulingApi.apiAdminSchedulingBlockTypesIdDelete(targetId);
      setDeletingType(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete block type');
      await load();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deletingType !== null}
        title="Delete Block Type"
        description={`Are you sure you want to delete block type "${deletingType?.name}"?`}
        confirmLabel="Delete Block Type"
        cancelLabel="Cancel"
        variant="danger"
        loading={savingId === deletingType?.id}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeletingType(null)}
      />

      <PageHeader
        title="Block Types Configuration"
        description="Configure non-booking shift blocks like lunch breaks, meetings, and personal time. Scoped at saloon level or location level."
        action={
          isAdmin && (
            <Button onClick={handleOpenAdd} className="font-semibold">
              + New Block Type
            </Button>
          )
        }
      />

      {error && <div className="rounded-xl bg-destructive/15 border border-destructive/30 p-4 text-xs font-semibold text-destructive">{error}</div>}

      {showForm && (
        <Card className="border-primary/40 shadow-lg">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle>{editingType ? `Edit Block Type: ${editingType.name}` : 'Create Custom Block Type'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
              <Input
                required
                label="Block Type Name"
                placeholder="e.g. Lunch Break, Team Meeting, Personal Time"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                error={getFieldError(submitError, 'name')}
              />

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Time Classification</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isPaid: false })}
                    className={`flex-1 rounded-xl border p-3 text-xs font-bold transition-all text-left ${!form.isPaid
                        ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent'
                      }`}
                  >
                    ⏸️ Unpaid Block Time
                    <p className="mt-0.5 text-[10px] font-normal opacity-80">Subtracted from payable shift hours (e.g. Unpaid Lunch)</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isPaid: true })}
                    className={`flex-1 rounded-xl border p-3 text-xs font-bold transition-all text-left ${form.isPaid
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent'
                      }`}
                  >
                    💰 Paid Block Time
                    <p className="mt-0.5 text-[10px] font-normal opacity-80">Included in paid shift hours (e.g. Paid Team Meeting)</p>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Default Duration</label>
                <select
                  value={form.defaultDurationMinutes}
                  onChange={(e) => setForm({ ...form, defaultDurationMinutes: Number(e.target.value) })}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Calendar Color Badge</label>
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
                  {submitting ? 'Saving...' : editingType ? 'Update Block Type' : 'Create Block Type'}
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
          <CardTitle>Configured Block Types ({optimisticBlockTypes.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : optimisticBlockTypes.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">No block types configured.</CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Block Category</th>
                  <th className="px-6 py-3.5">Scope</th>
                  <th className="px-6 py-3.5">Classification</th>
                  <th className="px-6 py-3.5">Default Duration</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {optimisticBlockTypes.map((b) => (
                  <tr key={String(b.id)} className="hover:bg-accent/40 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="h-3.5 w-3.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: b.colorHex }} />
                        <span className="font-bold text-foreground text-sm">{b.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {b.chainName ? (
                        <span className="inline-flex items-center rounded-md bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[11px] font-bold text-purple-600 dark:text-purple-400">
                          🏰 Saloon: {String(b.chainName)}
                        </span>
                      ) : b.locationName ? (
                        <span className="inline-flex items-center rounded-md bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                          📍 Location: {String(b.locationName)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-muted border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          🌐 System Default Preset
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {b.isPaid ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          💰 Paid Time
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                          ⏸️ Unpaid Break
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-semibold text-foreground">⏱️ {Number(b.defaultDurationMinutes)} mins</td>
                    <td className="px-6 py-4">
                      <Badge status={b.isActive ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(b)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" disabled={savingId === Number(b.id)} onClick={() => toggleActive(b)}>
                            {b.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          {b.chainId !== null || b.locationId !== null ? (
                            <Button variant="danger" size="sm" disabled={savingId === Number(b.id)} onClick={() => setDeletingType(b)}>
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      )}
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
