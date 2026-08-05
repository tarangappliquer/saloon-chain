import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { API_BASE, adminBookingsApi, adminCatalogApi, adminStaffApi, ApiError, getFieldError, schedulingApi } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { AdminBooking, Location, Room, Roster, ShiftType, StaffUser, TreatmentCategory } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

const SHIFT_TYPES: ShiftType[] = ['Morning', 'Evening'];

const SHIFT_TIME_DEFAULTS: Record<ShiftType, { startTime: string; endTime: string }> = {
  Morning: { startTime: '09:00', endTime: '13:30' },
  Evening: { startTime: '13:30', endTime: '18:00' },
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function generateTimeSlots(startStr: string, endStr: string, stepMinutes = 15): string[] {
  const [startH, startM] = (startStr || '09:00').split(':').map(Number);
  const [endH, endM] = (endStr || '18:00').split(':').map(Number);

  const slots: string[] = [];
  let currentMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (currentMinutes < endMinutes) {
    const h = Math.floor(currentMinutes / 60).toString().padStart(2, '0');
    const m = (currentMinutes % 60).toString().padStart(2, '0');
    slots.push(`${h}:${m}`);
    currentMinutes += stepMinutes;
  }
  return slots;
}

interface FlatTreatmentSlot {
  bookingId: number;
  customerName: string;
  customerEmail: string;
  status: string;
  treatmentName: string;
  therapistName: string | null;
  roomId: number | null;
  roomName: string | null;
  startTimeStr: string; // HH:mm
  endTimeStr: string;   // HH:mm
}

function extractFlatTreatments(bookings: AdminBooking[]): FlatTreatmentSlot[] {
  const flat: FlatTreatmentSlot[] = [];
  for (const b of bookings) {
    for (const t of b.treatments) {
      if (t.startTime && t.endTime) {
        const start = new Date(t.startTime);
        const end = new Date(t.endTime);
        const startStr = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
        const endStr = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
        flat.push({
          bookingId: b.id,
          customerName: b.customerName,
          customerEmail: b.customerEmail,
          status: b.status,
          treatmentName: t.treatmentName,
          therapistName: t.therapistName,
          roomId: t.roomId ?? null,
          roomName: t.roomName ?? null,
          startTimeStr: startStr,
          endTimeStr: endStr,
        });
      }
    }
  }
  return flat;
}

export function SchedulingPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramChainId = searchParams.get('chainId');
  const paramLocationId = searchParams.get('locationId');
  const paramView = searchParams.get('view') || 'roster';

  const [view, setView] = useState<'grid' | 'roster'>(paramView === 'grid' ? 'grid' : 'roster');
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
  const [bookings, setBookings] = useState<AdminBooking[]>([]);

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
      .catch(() => { });
    adminCatalogApi
      .apiAdminCatalogTreatmentCategoriesGet(locationId)
      .then(({ data }) => setCategories(data as unknown as TreatmentCategory[]))
      .catch(() => { });
  }, [locationId]);

  const loadRosterAndBookings = useCallback(async (isSilent = false) => {
    if (locationId === null) return;
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const [rosterRes, bookingsRes] = await Promise.all([
        schedulingApi.apiAdminSchedulingRosterGet(locationId, date),
        adminBookingsApi.apiAdminBookingsGet(locationId, date),
      ]);
      setRoster(rosterRes.data as unknown as Roster);
      setBookings(bookingsRes.data as unknown as AdminBooking[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load schedule');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [locationId, date]);

  useEffect(() => {
    loadRosterAndBookings(false);
  }, [loadRosterAndBookings]);

  // Real-time EventSource SSE subscription + 15s fallback heartbeat polling (silent refetch)
  useEffect(() => {
    if (locationId === null) return;
    const url = `${API_BASE}/api/booking/stream?locationId=${locationId}&date=${date}`;
    const es = new EventSource(url);

    es.addEventListener('slot-changed', () => {
      loadRosterAndBookings(true);
    });

    const timer = setInterval(() => {
      loadRosterAndBookings(true);
    }, 15000);

    return () => {
      es.close();
      clearInterval(timer);
    };
  }, [locationId, date, loadRosterAndBookings]);

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
      await loadRosterAndBookings(true);
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
      await loadRosterAndBookings(true);
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
      await loadRosterAndBookings(true);
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
      await loadRosterAndBookings(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to close room');
    }
  }

  function changeLocation(v: unknown) {
    const locId = Number(v);
    setLocationId(locId);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('locationId', locId.toString());
      return p;
    });
  }

  function switchView(newView: 'grid' | 'roster') {
    setView(newView);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('view', newView);
      return p;
    });
  }

  const flatTreatments = extractFlatTreatments(bookings);
  const timeSlots = generateTimeSlots(startTime, endTime, 15);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roster & Shift Scheduling"
        description="View room schedule grid with booked slots and manage therapist shifts and room openings."
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

      {/* Control bar: Location, Date, Shift Type, Time Window & View Switcher */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
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
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[130px]"
                />
              </div>
              <Input
                required
                type="time"
                label="Start Time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-8 text-xs w-[110px]"
              />
              <Input
                required
                type="time"
                label="End Time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                error={getFieldError(shiftSubmitError, 'endTime')}
                className="h-8 text-xs w-[110px]"
              />
            </div>

            {/* View Switcher Tabs */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-accent/30 p-1">
              <button
                type="button"
                onClick={() => switchView('roster')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${view === 'roster'
                  ? 'bg-card text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
              >
                Roster & Setup
              </button>
              <button
                type="button"
                onClick={() => switchView('grid')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${view === 'grid'
                  ? 'bg-card text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
              >
                Schedule Grid View
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingFallback />
      ) : view === 'grid' ? (
        <ScheduleGridView
          rooms={rooms}
          roster={roster}
          date={date}
          timeSlots={timeSlots}
          flatTreatments={flatTreatments}
        />
      ) : (
        <RosterSetupView
          roster={roster}
          therapists={therapists}
          rooms={rooms}
          categories={categories}
          therapistId={therapistId}
          setTherapistId={setTherapistId}
          roomId={roomId}
          setRoomId={setRoomId}
          treatmentCategoryId={treatmentCategoryId}
          setTreatmentCategoryId={setTreatmentCategoryId}
          submittingShift={submittingShift}
          submittingRoom={submittingRoom}
          handleAssignShift={handleAssignShift}
          handleRemoveShift={handleRemoveShift}
          handleOpenRoom={handleOpenRoom}
          handleCloseRoom={handleCloseRoom}
        />
      )}
    </div>
  );
}

interface ScheduleGridViewProps {
  rooms: Room[];
  roster: Roster;
  date: string;
  timeSlots: string[];
  flatTreatments: FlatTreatmentSlot[];
}

function ScheduleGridView({ rooms, roster, date, timeSlots, flatTreatments }: ScheduleGridViewProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Room Schedule Grid</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Showing room status, available open slots, and active bookings for {date}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Available Open Slot
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              Booked Slot
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              Temp Booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-muted" />
              Closed Room
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rooms.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No rooms configured for this location.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-accent/40">
                  <th className="sticky left-0 z-20 w-24 border-r border-border bg-accent/60 p-3 font-semibold text-foreground">
                    Time Slot
                  </th>
                  {rooms.map((room) => {
                    const opening = roster.roomOpenings.find((ro) => ro.roomId === room.id);
                    const hasExplicitRestriction = roster.roomOpenings.some((ro) => ro.roomId === room.id);
                    const isOpen = opening ? true : (room.isActive !== false && !hasExplicitRestriction);
                    const statusLabel = opening
                      ? `Open: ${opening.categoryName}`
                      : isOpen
                        ? 'Open (All)'
                        : 'Closed';

                    return (
                      <th key={room.id} className="min-w-[220px] border-r border-border/60 p-3 font-semibold">
                        <div className="flex items-center justify-between">
                          <span className="text-foreground text-sm font-bold">{room.name}</span>
                          {isOpen ? (
                            <Badge status="Confirmed" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">
                              {statusLabel}
                            </Badge>
                          ) : (
                            <span className="rounded-sm bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              Closed
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {timeSlots.map((slot) => (
                  <tr key={slot} className="hover:bg-accent/10 transition-colors">
                    {/* Sticky Time Column */}
                    <td className="sticky left-0 z-10 border-r border-border bg-card p-2.5 font-mono text-xs font-bold text-foreground">
                      {slot}
                    </td>

                    {/* Room Columns */}
                    {rooms.map((room) => {
                      const opening = roster.roomOpenings.find((ro) => ro.roomId === room.id);
                      const hasExplicitRestriction = roster.roomOpenings.some((ro) => ro.roomId === room.id);
                      const isOpen = opening ? true : (room.isActive !== false && !hasExplicitRestriction);

                      // Find any treatment booking that covers this room and time slot
                      const matchedTreatment = flatTreatments.find((t) => {
                        const matchRoom = t.roomId ? t.roomId === room.id : t.roomName === room.name;
                        return matchRoom && slot >= t.startTimeStr && slot < t.endTimeStr;
                      });

                      const isTempBooked = matchedTreatment?.status === 'Draft';

                      return (
                        <td key={room.id} className="border-r border-border/40 p-2 vertical-align-top">
                          {matchedTreatment ? (
                            /* BOOKED / TEMP BOOKED SLOT CARD WITH BOOKING ID & CUSTOMER INFO */
                            <div className={`rounded-lg border p-2.5 space-y-1.5 shadow-2xs ${isTempBooked
                              ? 'border-amber-500/40 bg-amber-500/10'
                              : 'border-primary/30 bg-primary/10'
                              }`}>
                              <div className="flex items-center justify-between gap-1">
                                <span className={`font-mono text-xs font-bold ${isTempBooked ? 'text-amber-700 dark:text-amber-300' : 'text-primary'
                                  }`}>
                                  Booking #{matchedTreatment.bookingId}
                                </span>
                                {isTempBooked ? (
                                  <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                                    Temp Booked
                                  </span>
                                ) : (
                                  <Badge status={matchedTreatment.status} className="text-[10px] py-0 px-1.5" />
                                )}
                              </div>
                              <div className="font-medium text-foreground text-xs">
                                {matchedTreatment.treatmentName}
                              </div>
                              <div className="text-[11px] text-muted-foreground space-y-0.5">
                                <p className="font-semibold text-foreground/90">{matchedTreatment.customerName}</p>
                                <p className="truncate">{matchedTreatment.customerEmail}</p>
                                {matchedTreatment.therapistName && (
                                  <p className={isTempBooked ? 'text-amber-700 dark:text-amber-300 font-medium' : 'text-primary/90 font-medium'}>
                                    Therapist: {matchedTreatment.therapistName}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : isOpen ? (
                            /* OPEN AVAILABLE SLOT WITH CATEGORY & ASSIGNED THERAPIST */
                            (() => {
                              const categoryLabel = opening ? opening.categoryName : 'All Categories';
                              const activeTherapists = (roster.therapistShifts || []).filter((s) => {
                                const startStr = s.startTime.slice(0, 5);
                                const endStr = s.endTime.slice(0, 5);
                                return slot >= startStr && slot < endStr;
                              });
                              const therapistLabel = activeTherapists.length > 0
                                ? activeTherapists.map((t) => t.therapistName).join(', ')
                                : 'No Therapist Assigned';

                              return (
                                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 space-y-1 shadow-2xs">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                      Available
                                    </span>
                                    <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-200 truncate max-w-[110px]" title={categoryLabel}>
                                      {categoryLabel}
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-medium text-foreground/90 flex items-center gap-1 pt-0.5">
                                    <span className="text-muted-foreground text-[10px] uppercase font-bold">Staff:</span>
                                    <span className={activeTherapists.length > 0 ? "font-semibold text-emerald-700 dark:text-emerald-300 truncate" : "text-muted-foreground italic text-[10px]"}>
                                      {therapistLabel}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            /* CLOSED ROOM SLOT */
                            <div className="rounded-md bg-muted/15 p-2 text-center text-[10px] text-muted-foreground/40 italic">
                              Closed
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RosterSetupViewProps {
  roster: Roster;
  therapists: { id: number; name: string }[];
  rooms: Room[];
  categories: TreatmentCategory[];
  therapistId: string;
  setTherapistId: (v: string) => void;
  roomId: string;
  setRoomId: (v: string) => void;
  treatmentCategoryId: string;
  setTreatmentCategoryId: (v: string) => void;
  submittingShift: boolean;
  submittingRoom: boolean;
  handleAssignShift: (e: FormEvent) => void;
  handleRemoveShift: (id: number) => void;
  handleOpenRoom: (e: FormEvent) => void;
  handleCloseRoom: (id: number) => void;
}

function RosterSetupView({
  roster,
  therapists,
  rooms,
  categories,
  therapistId,
  setTherapistId,
  roomId,
  setRoomId,
  treatmentCategoryId,
  setTreatmentCategoryId,
  submittingShift,
  submittingRoom,
  handleAssignShift,
  handleRemoveShift,
  handleOpenRoom,
  handleCloseRoom,
}: RosterSetupViewProps) {
  return (
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
  );
}
