import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, adminStaffApi, ApiError, getFieldError, schedulingApi } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Location, Room, Roster, ShiftType, StaffUser, TreatmentCategory } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

const SHIFT_TYPES: ShiftType[] = ['Morning', 'Evening'];

const SHIFT_TIME_DEFAULTS: Record<ShiftType, { startTime: string; endTime: string }> = {
  Morning: { startTime: '09:00', endTime: '13:30' },
  Evening: { startTime: '13:30', endTime: '18:00' },
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SchedulingPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramChainId = searchParams.get('chainId');
  const paramLocationId = searchParams.get('locationId');

  const [chainId, setChainId] = useState<number | null>(paramChainId ? Number(paramChainId) : null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(paramLocationId ? Number(paramLocationId) : null);
  const [date, setDate] = useState(today());
  const [shiftType, setShiftType] = useState<ShiftType>('Morning');
  const [startTime, setStartTime] = useState(SHIFT_TIME_DEFAULTS.Morning.startTime);
  const [endTime, setEndTime] = useState(SHIFT_TIME_DEFAULTS.Morning.endTime);

  const [therapists, setTherapists] = useState<{ id: number; name: string }[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [categories, setCategories] = useState<TreatmentCategory[]>([]);
  const [roster, setRoster] = useState<Roster>({ therapistShifts: [], roomOpenings: [] });

  const [therapistId, setTherapistId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [treatmentCategoryId, setTreatmentCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shiftSubmitError, setShiftSubmitError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [submittingShift, setSubmittingShift] = useState(false);
  const [submittingRoom, setSubmittingRoom] = useState(false);

  function handleShiftTypeChange(v: string) {
    const type = v as ShiftType;
    setShiftType(type);
    setStartTime(SHIFT_TIME_DEFAULTS[type].startTime);
    setEndTime(SHIFT_TIME_DEFAULTS[type].endTime);
  }

  useEffect(() => {
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data as unknown as { id: number }[];
        if (cs.length > 0 && chainId === null) setChainId(cs[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load chains'));
  }, [chainId]);

  useEffect(() => {
    if (locationId === null) {
      setTherapists([]);
      return;
    }
    adminStaffApi
      .apiAdminStaffGet('Therapist', undefined, locationId)
      .then(({ data }) => {
        const staff = data as unknown as StaffUser[];
        setTherapists(
          staff
            .filter((s) => s.therapistId !== null && s.isActive)
            .map((s) => ({ id: s.therapistId as number, name: s.name })),
        );
      })
      .catch(() => setTherapists([]));
  }, [locationId]);

  useEffect(() => {
    if (chainId === null) return;
    adminCatalogApi
      .apiAdminCatalogLocationsGet(chainId)
      .then(({ data }) => {
        const locs = data as unknown as Location[];
        setLocations(locs);
        if (paramLocationId) {
          setLocationId(Number(paramLocationId));
        } else if (locs.length > 0 && locationId === null) {
          setLocationId(locs[0].id);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load locations'));
  }, [chainId, locationId, paramLocationId]);

  useEffect(() => {
    if (locationId === null) return;
    adminCatalogApi
      .apiAdminCatalogRoomsGet(locationId)
      .then(({ data }) => setRooms(data as unknown as Room[]))
      .catch(() => {});
    adminCatalogApi
      .apiAdminCatalogTreatmentCategoriesGet(locationId)
      .then(({ data }) => setCategories(data as unknown as TreatmentCategory[]))
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
    if (locationId === null || !therapistId) return;
    setError(null);
    setShiftSubmitError(null);
    setSubmittingShift(true);
    try {
      await schedulingApi.apiAdminSchedulingTherapistShiftsPost({
        locationId,
        therapistId: Number(therapistId),
        shiftType,
        workDate: date,
        startTime,
        endTime,
      });
      setTherapistId('');
      await loadRoster();
    } catch (err) {
      setShiftSubmitError(err);
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
    if (!roomId || !treatmentCategoryId) return;
    setError(null);
    setSubmittingRoom(true);
    try {
      await schedulingApi.apiAdminSchedulingRoomOpeningsPost({
        roomId: Number(roomId),
        treatmentCategoryId: Number(treatmentCategoryId),
        shiftType,
        workDate: date,
      });
      setRoomId('');
      setTreatmentCategoryId('');
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

  function changeLocation(v:unknown){
    setSearchParams({locationId: Number(v).toString()})
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roster & Shift Scheduling"
        description="Schedule therapist shifts and open treatment rooms for specific working dates."
        action={
          paramLocationId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate(
                  currentUser?.role === 'Manager' ? '/my-location' : chainId ? `/catalog/locations?chainId=${chainId}` : '/catalog/saloons',
                )
              }
            >
              ← Back
            </Button>
          ) : undefined
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {/* Shared schedule context: location, date, shift type, and shift times drive both cards below */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</span>
              <SearchableSelect
                value={String(locationId ?? '')}
                onChange={changeLocation}
                options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                disabled={currentUser?.role === 'Manager'}
                className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[160px]"
              />
            </div>
            <Input
              type="date"
              label="Date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-xs min-w-[140px]"
            />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shift Type</span>
              <SearchableSelect
                value={shiftType}
                onChange={handleShiftTypeChange}
                options={SHIFT_TYPES.map((s) => ({ value: s, label: s }))}
                className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[140px]"
              />
            </div>
            <Input
              required
              type="time"
              label="Start Time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-8 text-xs"
            />
            <Input
              required
              type="time"
              label="End Time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              error={getFieldError(shiftSubmitError, 'endTime')}
              className="h-8 text-xs"
            />
          </div>
        </CardContent>
      </Card>

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
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Therapist
                  </label>
                  <SearchableSelect
                    value={therapistId}
                    onChange={setTherapistId}
                    placeholder="Select..."
                    options={therapists.map((t) => ({ value: String(t.id), label: t.name }))}
                    className="rounded-lg border border-input bg-card px-2.5 py-1 text-xs text-foreground"
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
                      value={roomId}
                      onChange={setRoomId}
                      placeholder="Select..."
                      options={rooms.map((r) => ({ value: String(r.id), label: r.name }))}
                      className="rounded-lg border border-input bg-card px-2.5 py-1 text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Treatment Category
                    </label>
                    <SearchableSelect
                      value={treatmentCategoryId}
                      onChange={setTreatmentCategoryId}
                      placeholder="Select category..."
                      options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                      className="rounded-lg border border-input bg-card px-2.5 py-1 text-xs text-foreground"
                    />
                  </div>
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
