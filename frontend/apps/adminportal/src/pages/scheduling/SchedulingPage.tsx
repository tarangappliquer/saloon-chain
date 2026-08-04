import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, ApiError, schedulingApi } from '../../api/client';
import type { Location, Room, Roster, ShiftType, Therapist, TreatmentCategory } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

const SHIFT_TYPES: ShiftType[] = ['Morning', 'Evening'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyShiftForm() {
  return { therapistId: '', shiftType: 'Morning' as ShiftType, startTime: '09:00', endTime: '13:30' };
}

function emptyRoomForm() {
  return { roomId: '', treatmentCategoryId: '', shiftType: 'Morning' as ShiftType };
}

export function SchedulingPage() {
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [date, setDate] = useState(today());

  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [categories, setCategories] = useState<TreatmentCategory[]>([]);
  const [roster, setRoster] = useState<Roster>({ therapistShifts: [], roomOpenings: [] });

  const [shiftForm, setShiftForm] = useState(emptyShiftForm());
  const [roomForm, setRoomForm] = useState(emptyRoomForm());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittingShift, setSubmittingShift] = useState(false);
  const [submittingRoom, setSubmittingRoom] = useState(false);

  useEffect(() => {
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data as unknown as { id: number }[];
        if (cs.length > 0) setChainId(cs[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load chains'));
    adminCatalogApi
      .apiAdminCatalogTherapistsGet()
      .then(({ data }) => setTherapists(data as unknown as Therapist[]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (chainId === null) return;
    adminCatalogApi
      .apiAdminCatalogLocationsGet(chainId)
      .then(({ data }) => {
        const locs = data as unknown as Location[];
        setLocations(locs);
        setLocationId(locs.length > 0 ? locs[0].id : null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load locations'));
    adminCatalogApi
      .apiAdminCatalogTreatmentCategoriesGet(chainId)
      .then(({ data }) => setCategories(data as unknown as TreatmentCategory[]))
      .catch(() => {});
  }, [chainId]);

  useEffect(() => {
    if (locationId === null) return;
    adminCatalogApi
      .apiAdminCatalogRoomsGet(locationId)
      .then(({ data }) => setRooms(data as unknown as Room[]))
      .catch(() => {});
  }, [locationId]);

  const loadRoster = useCallback(async () => {
    if (locationId === null) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await schedulingApi.apiAdminSchedulingRosterGet(locationId, date);
      setRoster(data as unknown as Roster);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load roster');
    } finally {
      setLoading(false);
    }
  }, [locationId, date]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  async function handleAssignShift(e: FormEvent) {
    e.preventDefault();
    if (locationId === null || !shiftForm.therapistId) return;
    setError(null);
    setSubmittingShift(true);
    try {
      await schedulingApi.apiAdminSchedulingTherapistShiftsPost({
        locationId,
        therapistId: Number(shiftForm.therapistId),
        shiftType: shiftForm.shiftType,
        workDate: date,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
      });
      setShiftForm(emptyShiftForm());
      await loadRoster();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign shift');
    } finally {
      setSubmittingShift(false);
    }
  }

  async function handleRemoveShift(id: number) {
    setError(null);
    try {
      await schedulingApi.apiAdminSchedulingTherapistShiftsIdDelete(id);
      await loadRoster();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove shift');
    }
  }

  async function handleOpenRoom(e: FormEvent) {
    e.preventDefault();
    if (!roomForm.roomId || !roomForm.treatmentCategoryId) return;
    setError(null);
    setSubmittingRoom(true);
    try {
      await schedulingApi.apiAdminSchedulingRoomOpeningsPost({
        roomId: Number(roomForm.roomId),
        treatmentCategoryId: Number(roomForm.treatmentCategoryId),
        shiftType: roomForm.shiftType,
        workDate: date,
      });
      setRoomForm(emptyRoomForm());
      await loadRoster();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to open room');
    } finally {
      setSubmittingRoom(false);
    }
  }

  async function handleCloseRoom(id: number) {
    setError(null);
    try {
      await schedulingApi.apiAdminSchedulingRoomOpeningsIdDelete(id);
      await loadRoster();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to close room');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roster & Shift Scheduling"
        description="Schedule therapist shifts and open treatment rooms for specific working dates."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Location:</span>
              <SearchableSelect
                value={String(locationId ?? '')}
                onChange={(v) => setLocationId(Number(v))}
                options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[160px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Date:</span>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 text-xs min-w-[140px]"
              />
            </div>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingFallback />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Therapist Shifts Card */}
          <Card>
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle>Therapist Shifts</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <form onSubmit={handleAssignShift} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Therapist
                    </label>
                    <SearchableSelect
                      value={shiftForm.therapistId}
                      onChange={(v) => setShiftForm({ ...shiftForm, therapistId: v })}
                      placeholder="Select..."
                      options={therapists.map((t) => ({ value: String(t.id), label: t.name }))}
                      className="rounded-lg border border-input bg-card px-2.5 py-1 text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Shift Type
                    </label>
                    <SearchableSelect
                      value={shiftForm.shiftType}
                      onChange={(v) => setShiftForm({ ...shiftForm, shiftType: v as ShiftType })}
                      options={SHIFT_TYPES.map((s) => ({ value: s, label: s }))}
                      className="rounded-lg border border-input bg-card px-2.5 py-1 text-xs text-foreground"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    required
                    type="time"
                    label="Start Time"
                    value={shiftForm.startTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                  />
                  <Input
                    required
                    type="time"
                    label="End Time"
                    value={shiftForm.endTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                  />
                </div>
                <Button type="submit" disabled={submittingShift} className="w-full">
                  {submittingShift ? 'Assigning...' : 'Assign Therapist Shift'}
                </Button>
              </form>

              <div className="pt-2 border-t border-border/50">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Scheduled Shifts ({roster.therapistShifts.length})</h4>
                {roster.therapistShifts.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No therapists scheduled for this date.</p>
                ) : (
                  <ul className="divide-y divide-border/50 text-xs">
                    {roster.therapistShifts.map((s) => (
                      <li key={s.id} className="flex items-center justify-between py-3">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-foreground">{s.therapistName}</span>
                          <p className="text-muted-foreground font-mono text-xs">
                            {s.shiftType} ({s.startTime} - {s.endTime})
                          </p>
                        </div>
                        <Button variant="danger" size="sm" onClick={() => handleRemoveShift(s.id)}>
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Room Openings Card */}
          <Card>
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle>Room Openings</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <form onSubmit={handleOpenRoom} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Room
                    </label>
                    <SearchableSelect
                      value={roomForm.roomId}
                      onChange={(v) => setRoomForm({ ...roomForm, roomId: v })}
                      placeholder="Select..."
                      options={rooms.map((r) => ({ value: String(r.id), label: r.name }))}
                      className="rounded-lg border border-input bg-card px-2.5 py-1 text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Shift Type
                    </label>
                    <SearchableSelect
                      value={roomForm.shiftType}
                      onChange={(v) => setRoomForm({ ...roomForm, shiftType: v as ShiftType })}
                      options={SHIFT_TYPES.map((s) => ({ value: s, label: s }))}
                      className="rounded-lg border border-input bg-card px-2.5 py-1 text-xs text-foreground"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Treatment Category
                  </label>
                  <SearchableSelect
                    value={roomForm.treatmentCategoryId}
                    onChange={(v) => setRoomForm({ ...roomForm, treatmentCategoryId: v })}
                    placeholder="Select category..."
                    options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                    className="rounded-lg border border-input bg-card px-2.5 py-1 text-xs text-foreground"
                  />
                </div>
                <Button type="submit" disabled={submittingRoom} className="w-full">
                  {submittingRoom ? 'Opening...' : 'Open Room'}
                </Button>
              </form>

              <div className="pt-2 border-t border-border/50">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Open Rooms ({roster.roomOpenings.length})</h4>
                {roster.roomOpenings.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No rooms opened for this date.</p>
                ) : (
                  <ul className="divide-y divide-border/50 text-xs">
                    {roster.roomOpenings.map((r) => (
                      <li key={r.id} className="flex items-center justify-between py-3">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-foreground">{r.roomName}</span>
                          <p className="text-muted-foreground text-xs">
                            {r.categoryName} <Badge variant="secondary" showDot={false} className="ml-1 text-[10px]">{r.shiftType}</Badge>
                          </p>
                        </div>
                        <Button variant="danger" size="sm" onClick={() => handleCloseRoom(r.id)}>
                          Close
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
