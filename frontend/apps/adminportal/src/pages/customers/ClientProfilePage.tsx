import { useEffect, useState, type SyntheticEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader, Tooltip } from '@saloon/ui';
import { X } from 'lucide-react';
import type { MyBookingDto } from '@saloon/api-client';
import { adminCatalogApi, adminCustomersApi, ApiError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import { routes } from '../../routes';
import type { Chain, Location } from '../../api/types';

interface CustomerProfile {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdDate: string;
}

interface CustomerTag {
  id: number;
  tag: string;
  chainId: number | null;
  chainName: string | null;
  locationId: number | null;
  locationName: string | null;
}

interface CustomerNote {
  id: number;
  note: string;
  chainId: number | null;
  chainName: string | null;
  locationId: number | null;
  locationName: string | null;
  createdDate: string;
  createdByName: string | null;
}

function scopeLabel(chainName: string | null, locationName: string | null) {
  return locationName ?? (chainName ? `${chainName} (all locations)` : 'Everywhere');
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Same "past" definition MyBookingsPage.tsx uses client-side (and sp_Review_Create re-derives
// server-side): every treatment's EndTime has already passed.
function isPast(b: MyBookingDto, now: number): boolean {
  const ends = b.treatments
    .map((t) => t.endTime)
    .filter((s): s is string => !!s)
    .map((s) => new Date(s).getTime());
  return ends.length > 0 && now > Math.max(...ends);
}

function earliestStart(b: MyBookingDto): number {
  const starts = b.treatments
    .map((t) => t.startTime)
    .filter((s): s is string => !!s)
    .map((s) => new Date(s).getTime());
  return starts.length > 0 ? Math.min(...starts) : Infinity;
}

function latestEnd(b: MyBookingDto): number {
  const ends = b.treatments
    .map((t) => t.endTime)
    .filter((s): s is string => !!s)
    .map((s) => new Date(s).getTime());
  return ends.length > 0 ? Math.max(...ends) : 0;
}

function BookingRow({ b }: { b: MyBookingDto }) {
  return (
    <div className="py-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{b.locationName}</span>
        <Badge status={b.status} />
      </div>
      <ul className="text-xs text-muted-foreground space-y-0.5">
        {b.treatments.map((t, idx) => (
          <li key={idx}>
            {t.treatmentName} {t.therapistName ? `with ${t.therapistName}` : ''} — {t.startTime ? formatDate(t.startTime) : 'unscheduled'}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ClientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const canPickScope = currentUser?.role === 'RootSuperAdmin' || currentUser?.role === 'SuperAdmin' || currentUser?.role === 'Admin';

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [bookings, setBookings] = useState<MyBookingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scope picker for SuperAdmin/Admin/RootSuperAdmin only -- Manager/Receptionist always write to
  // their own location silently, no picker shown.
  const [chains, setChains] = useState<Chain[]>([]);
  const [scopeChainId, setScopeChainId] = useState('');
  const [scopeLocations, setScopeLocations] = useState<Location[]>([]);
  const [scopeLocationId, setScopeLocationId] = useState('');

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [{ data: profileData }, { data: tagsData }, { data: notesData }, { data: bookingsData }] = await Promise.all([
        adminCustomersApi.apiAdminCustomersIdProfileGet(customerId),
        adminCustomersApi.apiAdminCustomersIdTagsGet(customerId),
        adminCustomersApi.apiAdminCustomersIdNotesGet(customerId),
        adminCustomersApi.apiAdminCustomersIdBookingsGet(customerId),
      ]);
      setProfile(profileData as unknown as CustomerProfile);
      setTags(tagsData as unknown as CustomerTag[]);
      setNotes(notesData as unknown as CustomerNote[]);
      setBookings(bookingsData as unknown as MyBookingDto[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load customer.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    if (!canPickScope) return;
    adminCatalogApi.apiAdminCatalogChainsGet().then(({ data }) => {
      const cs = data as unknown as Chain[];
      setChains(cs);
      if (cs.length === 1) setScopeChainId(String(cs[0].id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPickScope]);

  useEffect(() => {
    if (!scopeChainId) {
      setScopeLocations([]);
      return;
    }
    adminCatalogApi.apiAdminCatalogLocationsGet(Number(scopeChainId)).then(({ data }) => setScopeLocations(data as unknown as Location[]));
  }, [scopeChainId]);

  function writeScopeParams() {
    if (!canPickScope) return {};
    return scopeLocationId
      ? { locationId: Number(scopeLocationId) }
      : { chainId: scopeChainId ? Number(scopeChainId) : undefined };
  }

  // --- Tags ---
  const [newTag, setNewTag] = useState('');
  const [tagError, setTagError] = useState<unknown>(null);
  const [savingTag, setSavingTag] = useState(false);

  async function addTag(e: SyntheticEvent) {
    e.preventDefault();
    if (!newTag.trim()) return;
    setTagError(null);
    setSavingTag(true);
    try {
      await adminCustomersApi.apiAdminCustomersIdTagsPost(customerId, { tag: newTag.trim(), ...writeScopeParams() });
      setNewTag('');
      await loadAll();
    } catch (err) {
      setTagError(err);
    } finally {
      setSavingTag(false);
    }
  }

  async function removeTag(tagId: number) {
    try {
      await adminCustomersApi.apiAdminCustomersIdTagsTagIdDelete(customerId, tagId);
      setTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch {
      // ignore -- list reload on next full refresh will reconcile
    }
  }

  // --- Notes ---
  const [newNote, setNewNote] = useState('');
  const [noteError, setNoteError] = useState<unknown>(null);
  const [savingNote, setSavingNote] = useState(false);

  async function addNote(e: SyntheticEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setNoteError(null);
    setSavingNote(true);
    try {
      await adminCustomersApi.apiAdminCustomersIdNotesPost(customerId, { note: newNote.trim(), ...writeScopeParams() });
      setNewNote('');
      await loadAll();
    } catch (err) {
      setNoteError(err);
    } finally {
      setSavingNote(false);
    }
  }

  async function removeNote(noteId: number) {
    try {
      await adminCustomersApi.apiAdminCustomersIdNotesNoteIdDelete(customerId, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      // ignore
    }
  }

  const now = Date.now();
  const upcoming = bookings
    .filter((b) => b.status === 'Confirmed' && !isPast(b, now))
    .sort((a, c) => earliestStart(a) - earliestStart(c));
  const past = bookings
    .filter((b) => b.status !== 'Confirmed' || isPast(b, now))
    .sort((a, c) => latestEnd(c) - latestEnd(a));

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Client Profile" />
        <LoadingFallback />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Client Profile" />
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">{error ?? 'Customer not found.'}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title={profile.name}
        description={profile.email}
        action={
          <Button variant="outline" size="sm" onClick={() => navigate(routes.customers)}>
            ← Back to Customers
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center gap-6 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone</div>
            <div className="text-foreground">{profile.phone ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</div>
            <Badge status={profile.isActive ? 'Active' : 'Inactive'} />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer Since</div>
            <div className="text-foreground">{formatDate(profile.createdDate)}</div>
          </div>
        </CardContent>
      </Card>

      {canPickScope && (
        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle>Writing Scope</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-3">
            <p className="text-xs text-muted-foreground">
              New notes/tags apply here. Pick a location to scope them there, or leave it as "Saloon-wide" so every
              location in the chain sees them.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {chains.length > 1 && (
                <select
                  value={scopeChainId}
                  onChange={(e) => {
                    setScopeChainId(e.target.value);
                    setScopeLocationId('');
                  }}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground"
                >
                  <option value="">Select saloon...</option>
                  {chains.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={scopeLocationId}
                onChange={(e) => setScopeLocationId(e.target.value)}
                disabled={!scopeChainId}
                className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
              >
                <option value="">Saloon-wide (all locations)</option>
                {scopeLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {tags.length === 0 && <p className="text-sm text-muted-foreground">No tags yet.</p>}
            {tags.map((t) => (
              <Tooltip key={t.id} content={scopeLabel(t.chainName, t.locationName)}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {t.tag}
                  <button type="button" onClick={() => removeTag(t.id)} className="hover:text-destructive transition">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </Tooltip>
            ))}
          </div>
          <form onSubmit={addTag} className="flex gap-2 max-w-sm">
            <Input
              placeholder="e.g. VIP, Allergy: Latex"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className="flex-1"
              error={tagError instanceof ApiError ? tagError.message : undefined}
            />
            <Button type="submit" variant="outline" disabled={savingTag || !newTag.trim()}>
              {savingTag ? 'Adding...' : 'Add'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <form onSubmit={addNote} className="space-y-2">
            <textarea
              placeholder="Add a note about this customer..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
            />
            {noteError instanceof ApiError && <p className="text-xs text-destructive">{noteError.message}</p>}
            <Button type="submit" disabled={savingNote || !newNote.trim()} className="font-semibold">
              {savingNote ? 'Saving...' : 'Add Note'}
            </Button>
          </form>

          <div className="divide-y divide-border/50">
            {notes.length === 0 && <p className="text-sm text-muted-foreground py-3">No notes yet.</p>}
            {notes.map((n) => (
              <div key={n.id} className="py-3 space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{n.note}</p>
                  <button type="button" onClick={() => removeNote(n.id)} className="text-muted-foreground hover:text-destructive transition shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {n.createdByName ?? 'Staff'} &middot; {scopeLabel(n.chainName, n.locationName)} &middot; {formatDate(n.createdDate)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {upcoming.map((b) => (
                <BookingRow key={b.id as unknown as number} b={b} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Past Visits</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {past.length === 0 ? (
            <p className="text-sm text-muted-foreground">No past visits yet.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {past.map((b) => (
                <BookingRow key={b.id as unknown as number} b={b} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
