import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Select, { type SingleValue } from 'react-select';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, LoadingFallback, PageHeader } from '@saloon/ui';
import { API_BASE, adminBookingsApi, adminCatalogApi, adminStaffApi, ApiError, getFieldError, schedulingApi } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { AdminBooking, Location, Room, RoomOpening, Roster, ShiftType, StaffUser, TreatmentCategory } from '../../api/types';
import { type SelectOption, selectClassNames } from '../../components/reactSelectStyles';
import { TimeInput } from '../../components/TimeInput';
import { DateInput } from '../../components/DateInput';

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
    if (b.status === 'Cancelled') continue;
    for (const t of b.treatments) {
      if (t.startTime && t.endTime) {
        const startStr = t.startTime.includes('T') ? t.startTime.split('T')[1].slice(0, 5) : t.startTime.slice(0, 5);
        const endStr = t.endTime.includes('T') ? t.endTime.split('T')[1].slice(0, 5) : t.endTime.slice(0, 5);
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
  const paramDate = searchParams.get('date');
  const paramShiftType = searchParams.get('shiftType') as ShiftType | null;

  const [chainId, setChainId] = useState<number | null>(paramChainId ? Number(paramChainId) : null);
  const [chains, setChains] = useState<{ id: number; name: string }[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(paramLocationId ? Number(paramLocationId) : null);
  const [date, setDate] = useState<string>(paramDate || today());
  const [shiftType, setShiftType] = useState<ShiftType>(paramShiftType || 'Morning');
  const [startTime, setStartTime] = useState(SHIFT_TIME_DEFAULTS[paramShiftType || 'Morning'].startTime);
  const [endTime, setEndTime] = useState(SHIFT_TIME_DEFAULTS[paramShiftType || 'Morning'].endTime);

  const [therapists, setTherapists] = useState<{ id: number; name: string }[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [categories, setCategories] = useState<TreatmentCategory[]>([]);
  const [roster, setRoster] = useState<Roster>({ therapistShifts: [], roomOpenings: [] });
  const [bookings, setBookings] = useState<AdminBooking[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [shiftSubmitError, setShiftSubmitError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [submittingShift, setSubmittingShift] = useState(false);

  const updateUrl = useCallback(
    (cId: number | null, lId: number | null, d: string, st: ShiftType) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (cId !== null) next.set('chainId', cId.toString());
          else next.delete('chainId');

          if (lId !== null) next.set('locationId', lId.toString());
          else next.delete('locationId');

          if (d) next.set('date', d);
          else next.delete('date');

          if (st) next.set('shiftType', st);
          else next.delete('shiftType');

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  function handleShiftTypeChange(v: string) {
    const type = v as ShiftType;
    setShiftType(type);
    setStartTime(SHIFT_TIME_DEFAULTS[type].startTime);
    setEndTime(SHIFT_TIME_DEFAULTS[type].endTime);
    updateUrl(chainId, locationId, date, type);
  }

  function handleDateChange(newDate: string) {
    setDate(newDate);
    updateUrl(chainId, locationId, newDate, shiftType);
  }

  function changeLocation(v: unknown) {
    const locId = v ? Number(v) : null;
    setLocationId(locId);
    updateUrl(chainId, locId, date, shiftType);
  }

  useEffect(() => {
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data as unknown as { id: number; name: string }[];
        setChains(cs);
        if (cs.length > 0) {
          const matched = paramChainId ? cs.find((c) => c.id === Number(paramChainId)) : null;
          const chosenChainId = matched ? matched.id : (chainId ?? cs[0].id);
          if (chainId !== chosenChainId) {
            setChainId(chosenChainId);
          }
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load chains'));
  }, [chainId, paramChainId]);

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

        let resolvedLocationId: number | null = null;
        if (paramLocationId && locs.some((l) => l.id === Number(paramLocationId))) {
          resolvedLocationId = Number(paramLocationId);
        } else if (locationId && locs.some((l) => l.id === locationId)) {
          resolvedLocationId = locationId;
        } else if (locs.length > 0) {
          resolvedLocationId = locs[0].id;
        }

        if (resolvedLocationId !== locationId) {
          setLocationId(resolvedLocationId);
        }

        if (resolvedLocationId !== null) {
          updateUrl(chainId, resolvedLocationId, date, shiftType);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load locations'));
  }, [chainId, date, locationId, paramLocationId, shiftType, updateUrl]);

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

    const slotHandler = () => {
      loadRosterAndBookings(true);
    };
    es.addEventListener('slot-changed', slotHandler);

    const timer = setInterval(() => {
      loadRosterAndBookings(true);
    }, 15000);

    return () => {
      es.removeEventListener('slot-changed', slotHandler);
      es.close();
      clearInterval(timer);
    };
  }, [locationId, date, loadRosterAndBookings]);

  async function handleAssignShift(therapistIdValue: string, roomId: number) {
    if (locationId === null || !therapistIdValue) return;
    setError(null);
    setShiftSubmitError(null);
    if (startTime >= endTime) {
      setError('Start time must be before end time');
      return;
    }
    if ((workOpen && startTime < workOpen) || (workClose && endTime > workClose)) {
      setError(`Shift time must be within location working hours (${workOpen}–${workClose})`);
      return;
    }
    setSubmittingShift(true);
    try {
      await schedulingApi.apiAdminSchedulingTherapistShiftsPost({
        locationId,
        therapistId: Number(therapistIdValue),
        roomId,
        shiftType,
        workDate: date,
        startTime,
        endTime,
      });
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

  async function changeRoomStatus(room: Room, opening: RoomOpening | undefined, categoryValue: string) {
    setError(null);
    try {
      if (opening) {
        await schedulingApi.apiAdminSchedulingRoomOpeningsIdDelete(opening.id);
      }
      if (categoryValue) {
        await schedulingApi.apiAdminSchedulingRoomOpeningsPost({
          roomId: room.id,
          treatmentCategoryId: Number(categoryValue),
          shiftType,
          workDate: date,
        });
      }
      await loadRosterAndBookings(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update room status');
    }
  }

  const flatTreatments = extractFlatTreatments(bookings);
  const timeSlots = generateTimeSlots(startTime, endTime, 15);
  const selectedChain = chains.find((c) => c.id === chainId);
  const selectedLocation = locations.find((l) => l.id === locationId);
  const workOpen = selectedLocation?.openTime.slice(0, 5);
  const workClose = selectedLocation?.closeTime.slice(0, 5);
  const startTimeError = startTime >= endTime
    ? 'Must be before end time'
    : workOpen && startTime < workOpen
      ? `Location opens at ${workOpen}`
      : getFieldError(shiftSubmitError, 'startTime');
  const endTimeError = startTime >= endTime
    ? 'Must be after start time'
    : workClose && endTime > workClose
      ? `Location closes at ${workClose}`
      : getFieldError(shiftSubmitError, 'endTime');

  return (
    <div className="space-y-6">
      <PageHeader
        title={selectedChain ? `${selectedChain.name} — Roster & Shift Scheduling` : 'Roster & Shift Scheduling'}
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

      {/* Control bar: Location, Date, Shift Type & Time Window */}
      <Card>
        <CardContent className="py-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</span>
              <Select
                isClearable
                isDisabled={currentUser?.role === 'Manager'}
                value={locations.map((l) => ({ value: String(l.id), label: l.name })).find((o) => o.value === String(locationId ?? '')) ?? null}
                onChange={(picked: SingleValue<SelectOption>) => changeLocation(picked?.value ?? '')}
                options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                unstyled
                classNames={selectClassNames('h-8 rounded-lg border border-input bg-card px-3 py-1 text-xs text-foreground min-w-[160px]')}
              />
            </div>
            <DateInput
              label="Date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="min-w-full"
            />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shift Type</span>
              <Select
                value={SHIFT_TYPES.map((s) => ({ value: s, label: s })).find((o) => o.value === shiftType) ?? null}
                onChange={(picked: SingleValue<SelectOption>) => handleShiftTypeChange(picked?.value ?? shiftType)}
                options={SHIFT_TYPES.map((s) => ({ value: s, label: s }))}
                unstyled
                classNames={selectClassNames('h-8 rounded-lg border border-input bg-card px-3 py-1 text-xs text-foreground min-w-[130px]')}
              />
            </div>
            <TimeInput
              required
              label="Start Time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              error={startTimeError}
              className="w-full"
              incrementMinutes={15}
            />
            <TimeInput
              required
              label="End Time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              error={endTimeError}
              className="w-full"
              incrementMinutes={15}
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingFallback />
      ) : (
        <ScheduleGridView
          rooms={rooms}
          roster={roster}
          date={date}
          shiftType={shiftType}
          timeSlots={timeSlots}
          flatTreatments={flatTreatments}
          categories={categories}
          therapists={therapists}
          submittingShift={submittingShift}
          handleAssignShift={handleAssignShift}
          handleRemoveShift={handleRemoveShift}
          changeRoomStatus={changeRoomStatus}
        />
      )}
    </div>
  );
}

interface ScheduleGridViewProps {
  rooms: Room[];
  roster: Roster;
  date: string;
  shiftType: ShiftType;
  timeSlots: string[];
  flatTreatments: FlatTreatmentSlot[];
  categories: TreatmentCategory[];
  therapists: { id: number; name: string }[];
  submittingShift: boolean;
  handleAssignShift: (therapistId: string, roomId: number) => void;
  handleRemoveShift: (id: number) => void;
  changeRoomStatus: (room: Room, opening: RoomOpening | undefined, categoryValue: string) => void;
}

function ScheduleGridView({
  rooms,
  roster,
  date,
  shiftType,
  timeSlots,
  flatTreatments,
  categories,
  therapists,
  submittingShift,
  handleAssignShift,
  handleRemoveShift,
  changeRoomStatus,
}: ScheduleGridViewProps) {
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
                    const opening = roster.roomOpenings.find((ro) => ro.roomId === room.id && ro.shiftType === shiftType);
                    const assignedShift = roster.therapistShifts.find((s) => s.roomId === room.id);

                    const isOpen = !!opening;
                    const hasBooking = flatTreatments.some((t) => (t.roomId ? t.roomId === room.id : t.roomName === room.name));

                    return (
                      <th key={room.id} className="min-w-[220px] border-r border-border/60 p-3 font-semibold align-top">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isOpen}
                              aria-label={`${room.name} open`}
                              disabled={categories.length === 0}
                              onClick={() => changeRoomStatus(room, opening, opening ? '' : String(categories[0]?.id ?? ''))}
                              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isOpen ? 'border-emerald-500 bg-emerald-500' : 'border-border-strong bg-muted'}`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${isOpen ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                            <span className="text-foreground text-sm font-bold">{room.name}</span>
                          </div>
                          {isOpen && (
                            <Select
                              isClearable
                              isDisabled={hasBooking}
                              value={categories.map((c) => ({ value: String(c.id), label: c.name })).find((o) => o.value === String(opening?.treatmentCategoryId ?? '')) ?? null}
                              onChange={(picked: SingleValue<SelectOption>) => changeRoomStatus(room, opening, picked?.value ?? '')}
                              placeholder="Category..."
                              options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                              unstyled
                              classNames={selectClassNames('rounded-md border border-input bg-card px-2 py-1 text-[11px] text-foreground w-full')}
                            />
                          )}
                          {isOpen && hasBooking && (
                            <p className="text-[10px] italic text-muted-foreground">Category locked (room has a booking today)</p>
                          )}
                          {isOpen && (
                            <Select
                              isClearable
                              isDisabled={submittingShift}
                              value={therapists.map((t) => ({ value: String(t.id), label: t.name })).find((o) => o.value === String(assignedShift?.therapistId ?? '')) ?? null}
                              onChange={(picked: SingleValue<SelectOption>) => {
                                const v = picked?.value ?? '';
                                if (v) {
                                  handleAssignShift(v, room.id);
                                } else if (assignedShift) {
                                  handleRemoveShift(assignedShift.id);
                                }
                              }}
                              placeholder="Select..."
                              options={therapists.map((t) => ({ value: String(t.id), label: t.name }))}
                              unstyled
                              classNames={selectClassNames('rounded-md border border-input bg-card px-2 py-1 text-[11px] text-foreground w-full')}
                            />
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
                      const opening = roster.roomOpenings.find((ro) => ro.roomId === room.id && ro.shiftType === shiftType);
                      const isOpen = !!opening;

                      const slotIdx = timeSlots.indexOf(slot);
                      const nextSlot = slotIdx >= 0 && slotIdx + 1 < timeSlots.length ? timeSlots[slotIdx + 1] : '23:59';

                      // Find any treatment booking that covers this room and time slot
                      const matchedTreatment = flatTreatments.find((t) => {
                        const matchRoom = t.roomId ? t.roomId === room.id : t.roomName === room.name;
                        return matchRoom && slot < t.endTimeStr && nextSlot > t.startTimeStr;
                      });

                      const isTempBooked = matchedTreatment?.status === 'Draft';

                      const activeTherapists = (roster.therapistShifts || []).filter((s) => {
                        if (s.roomId !== room.id) return false;
                        const startStr = s.startTime.slice(0, 5);
                        const endStr = s.endTime.slice(0, 5);
                        return slot >= startStr && slot < endStr;
                      });
                      const isStaffed = isOpen && activeTherapists.length > 0;

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
                          ) : isStaffed ? (
                            /* OPEN AVAILABLE SLOT WITH CATEGORY & ASSIGNED THERAPIST */
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 space-y-1 shadow-2xs">
                              <div className="flex items-center justify-between gap-1">
                                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                  Available
                                </span>
                                <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-200 truncate max-w-[110px]" title={opening?.categoryName}>
                                  {opening?.categoryName}
                                </span>
                              </div>
                              <div className="text-[11px] font-medium text-foreground/90 flex items-center gap-1 pt-0.5">
                                <span className="text-muted-foreground text-[10px] uppercase font-bold">Staff:</span>
                                <span className="font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                                  {activeTherapists.map((t) => t.therapistName).join(', ')}
                                </span>
                              </div>
                            </div>
                          ) : (
                            /* CLOSED OR UNSTAFFED ROOM SLOT */
                            <div className="rounded-md bg-muted/15 p-2 text-center text-[10px] text-muted-foreground/40 italic">
                              {isOpen ? 'No Staff Assigned' : 'Closed'}
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
