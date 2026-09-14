import { forwardRef, useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, LoadingFallback, PageHeader, Tooltip } from '@saloon/ui';
import { adminBookingsApi, adminCatalogApi, adminStaffApi, ApiError, schedulingApi } from '../../api/client';
import { bookingStreamUrl, subscribeToStream } from '../../api/sseClient';
import { useAuth } from '../../features/auth/AuthContext';
import type { AdminBooking, BlockedSlot, Location, Room, RoomOpening, Roster, ShiftType, TherapistShift, TreatmentCategory } from '../../api/types';
import { AddAppointmentModal } from '../../components/AddAppointmentModal';
import { BookingDetailPanel } from '../../components/BookingDetailPanel';
import { EditBlockSlotModal } from '../../components/EditBlockSlotModal';
import { QuickActionsPopover } from '../../components/QuickActionsPopover';
import { routes } from '../../routes';
import { venueTimezoneTag } from '../../lib/time';


const SHIFT_TIME_DEFAULTS: Record<ShiftType, { startTime: string; endTime: string }> = {
  Morning: { startTime: '09:00', endTime: '13:30' },
  Evening: { startTime: '13:30', endTime: '18:00' },
};

// Formats a Date using its local calendar fields -- toISOString() converts through UTC first,
// which rolls the date back a day for any positive UTC offset (e.g. IST) once local midnight is
// shifted forward and re-serialized.
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function today(): string {
  return toDateStr(new Date());
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// react-datepicker clones this into the toolbar in place of its default text input, so clicking
// the date label opens the picker instead of showing an editable box in the pill toolbar.
const DateHeaderButton = forwardRef<HTMLButtonElement, { label?: string; onClick?: () => void }>(
  ({ label, onClick }, ref) => (
    <button
      type="button"
      ref={ref}
      onClick={onClick}
      className="px-2 font-bold text-foreground min-w-24 text-center hover:text-primary transition cursor-pointer"
    >
      {label}
    </button>
  ),
);
DateHeaderButton.displayName = 'DateHeaderButton';


function getInitials(name: string): string {
  if (!name) return 'TK';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
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

function getStatusCardStyle(colorHex?: string | null) {
  const normalized = colorHex?.trim();
  const safeColor = normalized && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized) ? normalized : '#99D9EA';

  const hex = safeColor.replace('#', '');
  const expanded = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);

  return {
    borderColor: safeColor,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.18)`,
    color: safeColor,
  } as const;
}

interface FlatTreatmentSlot {
  bookingId: number;
  customerName: string;
  customerEmail: string;
  status: string;
  appointmentStatusColorHex?: string | null;
  treatmentName: string;
  therapistName: string | null;
  roomId: number | null;
  roomName: string | null;
  startTimeStr: string; // HH:mm
  endTimeStr: string;   // HH:mm
}

type BlockPosition = 'only' | 'first' | 'middle' | 'last';
type BlockCellState = { blocks: BlockedSlot[]; position: BlockPosition };

// Every 15-min row a block covers keeps its own visible <td> -- this does NOT collapse them into
// one rowSpan-ed cell. It only figures out, per room/slot-index, which contiguous run ("cluster")
// of blocked rows that slot belongs to and where in that run it sits (first/middle/last/only), so
// the renderer can draw matching partial borders on each row that together read as one rectangle
// wrapping the whole run -- e.g. slots 1-4 blocked under the same PK get a border-top+sides on row
// 1, sides only on rows 2-3, and border-bottom+sides on row 4.
//
// The backend rejects creating a block that overlaps an existing one (sp_Scheduling_HasBlockOverlap),
// so normally a cluster is exactly one block. This still merges overlapping blocks into one cluster
// (by shared covered slot index) rather than picking one and dropping the rest, purely so any
// already-overlapping rows from before that guard existed stay visible and unblockable instead of
// silently disappearing from the grid.
function computeBlockSpans(rooms: Room[], blockedSlots: BlockedSlot[], timeSlots: string[]): Map<number, Map<number, BlockCellState>> {
  const byRoom = new Map<number, Map<number, BlockCellState>>();
  for (const room of rooms) {
    const cellMap = new Map<number, BlockCellState>();

    const covered = blockedSlots
      .filter((b) => b.roomId === room.id)
      .map((block) => {
        const startStr = (block.startTime ?? '').slice(0, 5);
        const endStr = (block.endTime ?? '').slice(0, 5);
        const idx: number[] = [];
        timeSlots.forEach((slot, i) => {
          const nextSlot = i + 1 < timeSlots.length ? timeSlots[i + 1] : '23:59';
          if (slot < endStr && nextSlot > startStr) idx.push(i);
        });
        return { block, idx };
      })
      .filter((c) => c.idx.length > 0)
      .sort((a, b) => a.idx[0] - b.idx[0]);

    const clusters: { blocks: BlockedSlot[]; start: number; end: number }[] = [];
    for (const { block, idx } of covered) {
      const [first, last] = [idx[0], idx[idx.length - 1]];
      const current = clusters.at(-1);
      if (current && first <= current.end) {
        current.blocks.push(block);
        current.end = Math.max(current.end, last);
      } else {
        clusters.push({ blocks: [block], start: first, end: last });
      }
    }

    for (const cluster of clusters) {
      for (let idx = cluster.start; idx <= cluster.end; idx++) {
        const position: BlockPosition =
          cluster.start === cluster.end ? 'only' : idx === cluster.start ? 'first' : idx === cluster.end ? 'last' : 'middle';
        cellMap.set(idx, { blocks: cluster.blocks, position });
      }
    }

    byRoom.set(room.id, cellMap);
  }
  return byRoom;
}

// t.startTime/endTime are full UTC instants (ISO, e.g. "2026-09-11T08:30:00Z") when they carry a
// "T", so slicing the UTC wall-clock digits out of the string (as this used to do) printed the
// booking's UTC time-of-day instead of its venue-local time -- same root cause as the dashboard's
// "Upcoming Appointments" mismatch (see migrations/007_dashboard_upcoming_display_timezone.sql).
//
// This grid's own axis (timeSlots, generated from the location's OpenTime/CloseTime) and every
// other row on it (ShiftAssignments/RoomCategoryAssignments/BlockedSlots) are plain venue-local
// `time` values with no timezone conversion at all -- so a booking dot must be positioned using
// that SAME venue-local reference frame, not the admin's own browser zone. Converting via the
// browser's local time (as this used to) silently misaligns every booking against the shift/room
// rows the moment the admin's browser isn't in the venue's own zone. Intl's `timeZone` option
// converts straight to the venue's IANA zone without needing a date library.
function toLocalHHmm(iso: string, timeZoneId?: string): string {
  const d = new Date(iso);
  if (timeZoneId) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timeZoneId, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
  }
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function extractFlatTreatments(bookings: AdminBooking[], timeZoneId?: string): FlatTreatmentSlot[] {
  const flat: FlatTreatmentSlot[] = [];
  for (const b of bookings) {
    if (b.status === 'Cancelled') continue;
    for (const t of b.treatments) {
      if (t.startTime && t.endTime) {
        const startStr = t.startTime.includes('T') ? toLocalHHmm(t.startTime, timeZoneId) : t.startTime.slice(0, 5);
        const endStr = t.endTime.includes('T') ? toLocalHHmm(t.endTime, timeZoneId) : t.endTime.slice(0, 5);
        flat.push({
          bookingId: b.bookingId,
          customerName: b.customerName,
          customerEmail: b.customerEmail,
          status: b.status,
          appointmentStatusColorHex: b.appointmentStatusColorHex,
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

const RefreshIcon = () => {
  return <label className="cursor-pointer inline-block p-2">

    <input type="checkbox" className="peer hidden" />


    <svg xmlns="http://w3.org"
      className="w-5 h-5 transition-transform duration-700 ease-in-out peer-checked:rotate-180"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  </label>
}

export function CalendarPage() {
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
  // No setter was ever wired to a control -- shiftType (and the startTime/endTime window derived
  // from it) could only change by hand-editing the ?shiftType= URL param, so admins had no way to
  // switch to (or configure room openings/therapist shifts for) the Evening shift from this page.
  const [shiftType, setShiftType] = useState<ShiftType>(paramShiftType || 'Morning');
  const { startTime, endTime } = SHIFT_TIME_DEFAULTS[shiftType];

  const [therapists, setTherapists] = useState<{ id: number; name: string }[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [categories, setCategories] = useState<TreatmentCategory[]>([]);
  const [roster, setRoster] = useState<Roster>({ therapistShifts: [], roomOpenings: [], blockedSlots: [] });
  const [bookings, setBookings] = useState<AdminBooking[]>([]);


  const [detailBookingId, setDetailBookingId] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Same role gates BookingsPage.tsx uses for its own cancel/no-show actions.
  const canCancel =
    currentUser?.role === 'RootSuperAdmin' ||
    currentUser?.role === 'SuperAdmin' ||
    currentUser?.role === 'Admin' ||
    currentUser?.role === 'Manager' ||
    currentUser?.role === 'Receptionist';
  const canMarkNoShow =
    currentUser?.role === 'RootSuperAdmin' || currentUser?.role === 'SuperAdmin' || currentUser?.role === 'Admin' || currentUser?.role === 'Manager';

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


  function handleDateChange(newDate: string) {
    setDate(newDate);
    updateUrl(chainId, locationId, newDate, shiftType);
  }

  function changeLocation(v: unknown) {
    const locId = v ? Number(v) : null;
    setLocationId(locId);
    updateUrl(chainId, locId, date, shiftType);
  }

  function changeShiftType(st: ShiftType) {
    setShiftType(st);
    updateUrl(chainId, locationId, date, st);
  }

  useEffect(() => {
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data;
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
        const staff = data;
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
        const locs = data;
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
      .then(({ data }) => setRooms(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load rooms'));
    adminCatalogApi
      .apiAdminCatalogTreatmentCategoriesGet(locationId)
      .then(({ data }) => setCategories(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load treatment categories'));
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
      setRoster(rosterRes.data);
      setBookings(bookingsRes.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load schedule');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [locationId, date]);

  useEffect(() => {
    loadRosterAndBookings(false);
  }, [loadRosterAndBookings]);

  const handleSlotChangedEvent = useEffectEvent(() => {
    loadRosterAndBookings(true);
  });

  // Real-time EventSource SSE subscription + 15s fallback heartbeat polling (silent refetch)
  useEffect(() => {
    if (locationId === null) return;
    const unsubscribe = subscribeToStream(bookingStreamUrl(locationId, date), 'slot-changed', () => {
      handleSlotChangedEvent();
    });

    const timer = setInterval(() => {
      handleSlotChangedEvent();
    }, 15000);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [locationId, date]);

  async function handleUnblockSlot(id: number) {
    if (id <= 0) {
      setError('Saloon-level break configured at saloon level cannot be unblocked here.');
      return;
    }
    setError(null);
    try {
      await schedulingApi.apiAdminSchedulingBlockedSlotsIdDelete(id);
      await loadRosterAndBookings(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to unblock slot');
    }
  }

  async function changeRoomStatus(room: Room, opening: RoomOpening | undefined, categoryValue: string) {
    setError(null);
    try {
      if (opening && opening.id !== undefined) {
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

  // Assigning a therapist to a room only rejects if the requested window overlaps another
  // therapist's window in that same room (see sp_Scheduling_HasShiftOverlap); it never evicts them
  // otherwise, so a room can hold a primary therapist plus a proxy covering a narrower interval.
  async function assignTherapist(room: Room, therapistId: number, startTimeStr: string, endTimeStr: string) {
    if (locationId === null) return;
    setError(null);
    try {
      await schedulingApi.apiAdminSchedulingTherapistShiftsPost({
        locationId,
        therapistId,
        roomId: room.id,
        shiftType,
        workDate: date,
        startTime: startTimeStr,
        endTime: endTimeStr,
      });
      await loadRosterAndBookings(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign therapist');
    }
  }

  async function updateTherapistShift(id: number, startTimeStr: string, endTimeStr: string) {
    setError(null);
    try {
      await schedulingApi.apiAdminSchedulingTherapistShiftsIdPut(id, {
        startTime: startTimeStr,
        endTime: endTimeStr,
      });
      await loadRosterAndBookings(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update therapist shift');
    }
  }

  async function removeTherapistShift(id: number) {
    setError(null);
    try {
      await schedulingApi.apiAdminSchedulingTherapistShiftsIdDelete(id);
      await loadRosterAndBookings(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove therapist assignment');
    }
  }

  const selectedChain = chains.find((c) => c.id === chainId);
  const selectedLocation = locations.find((l) => l.id === locationId);
  const flatTreatments = useMemo(
    () => extractFlatTreatments(bookings, selectedLocation?.timeZoneId),
    [bookings, selectedLocation?.timeZoneId],
  );
  const timeSlots = useMemo(() => generateTimeSlots(startTime, endTime, 15), [startTime, endTime]);
  const workOpen = selectedLocation?.openTime.slice(0, 5);
  const workClose = selectedLocation?.closeTime.slice(0, 5);
  const startTimeError = startTime >= endTime
    ? 'Must be before end time'
    : workOpen && startTime < workOpen
      ? `Location opens at ${workOpen}`
      : null;
  const endTimeError = startTime >= endTime
    ? 'Must be after start time'
    : workClose && endTime > workClose
      ? `Location closes at ${workClose}`
      : null;
  void startTimeError;
  void endTimeError;

  return (
    <div className="space-y-6">
      <PageHeader
        title={selectedChain ? `${selectedChain.name} — Calendar` : 'Calendar'}
        description="View room schedule grid with booked slots and manage therapist shifts and room openings."
        action={
          paramLocationId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate(routes.catalogBack(currentUser?.role === 'Manager', chainId))
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

      {/* Fresha-Style Top Pill Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-xs">
        {/* Left Group: Today, < Date >, Saloon ▾ */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleDateChange(today())}
            className="rounded-full border border-border bg-background px-3.5 py-1 text-xs font-bold text-foreground hover:bg-accent transition cursor-pointer"
          >
            Today
          </button>

          <div className="flex items-center rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => handleDateChange(shiftDate(date, -1))}
              className="rounded-full px-1.5 py-0.5 hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer font-bold"
            >
              ‹
            </button>
            <DatePicker
              selected={parseDateStr(date)}
              onChange={(d: Date | null) => d && handleDateChange(toDateStr(d))}
              customInput={<DateHeaderButton label={formatDateHeader(date)} />}
            />
            <button
              type="button"
              onClick={() => handleDateChange(shiftDate(date, 1))}
              className="rounded-full px-1.5 py-0.5 hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer font-bold"
            >
              ›
            </button>
          </div>

          <select
            disabled={currentUser?.role === 'Manager'}
            value={locationId ?? ''}
            onChange={(e) => changeLocation(e.target.value)}
            className="rounded-full border border-border bg-background px-3.5 py-1 text-xs font-bold text-foreground hover:bg-accent transition cursor-pointer focus:outline-hidden"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          <div className="flex items-center rounded-full border border-border bg-background p-0.5 text-xs font-bold">
            {(['Morning', 'Evening'] as ShiftType[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => changeShiftType(st)}
                aria-pressed={shiftType === st}
                className={`rounded-full px-3 py-1 transition cursor-pointer ${
                  shiftType === st ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {st} ({SHIFT_TIME_DEFAULTS[st].startTime}–{SHIFT_TIME_DEFAULTS[st].endTime})
              </button>
            ))}
          </div>

          {selectedLocation && (
            <Tooltip content="Every time on this page is shown in the location's own timezone, not your browser's">
              <span>
                <Badge variant="outline" showDot={false}>
                  {venueTimezoneTag(selectedLocation.timeZoneId)}
                </Badge>
              </span>
            </Tooltip>
          )}
        </div>

        {/* Right Group: Settings, Refresh, View Mode, + Add */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadRosterAndBookings(true)}
            className="flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition cursor-pointer text-sm"
            title="Refresh Schedule"
          >
            <RefreshIcon />
          </button>

        </div>
      </div>

      {loading ? (
        <LoadingFallback />
      ) : (
        <ScheduleGridView
          rooms={rooms}
          roster={roster}
          date={date}
          shiftType={shiftType}
          shiftStartTime={startTime}
          shiftEndTime={endTime}
          timeSlots={timeSlots}
          flatTreatments={flatTreatments}
          categories={categories}
          therapists={therapists}
          changeRoomStatus={changeRoomStatus}
          assignTherapist={assignTherapist}
          updateTherapistShift={updateTherapistShift}
          removeTherapistShift={removeTherapistShift}
          handleUnblockSlot={handleUnblockSlot}
          onOpenBookingDetail={setDetailBookingId}
          navigate={navigate}
          chainId={chainId}
          locationId={locationId}
          loadRosterAndBookings={loadRosterAndBookings}
          workClose={workClose}
          canAddAppointment={!!currentUser?.canEmulate}
        />
      )}

      {detailBookingId !== null && locationId !== null && (() => {
        const detailBooking = bookings.find((b) => b.bookingId === detailBookingId);
        return detailBooking ? (
          <BookingDetailPanel
            booking={detailBooking}
            chainId={chainId}
            locationId={locationId}
            timeZoneId={selectedLocation?.timeZoneId}
            canCancel={canCancel}
            canMarkNoShow={canMarkNoShow}
            onClose={() => setDetailBookingId(null)}
            onChanged={() => loadRosterAndBookings(true)}
          />
        ) : null;
      })()}
    </div>
  );
}

function ShiftRow({
  shift,
  onUpdate,
  onRemove,
}: {
  shift: TherapistShift;
  onUpdate: (id: number, start: string, end: string) => void;
  onRemove: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState((shift.startTime ?? '').slice(0, 5));
  const [end, setEnd] = useState((shift.endTime ?? '').slice(0, 5));

  function save() {
    if (start >= end || shift.id === undefined) return;
    onUpdate(shift.id, start, end);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs shadow-xs">
        <div className="flex items-center justify-between">
          <Tooltip content={shift.therapistName}>
            <span className="font-semibold text-foreground truncate max-w-50">{shift.therapistName}</span>
          </Tooltip>
          <span className="text-[10px] text-muted-foreground uppercase font-mono">Editing Shift</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Start Time</label>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono shadow-xs focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">End Time</label>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono shadow-xs focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={start >= end}
            onClick={save}
            className="h-7 px-3 text-xs font-semibold"
          >
            Save Shift
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-accent/30 p-2 hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
          {(shift.startTime ?? '').slice(0, 5)} – {(shift.endTime ?? '').slice(0, 5)}
        </span>
        <Tooltip content={shift.therapistName}>
          <span className="truncate text-xs font-medium text-foreground">{shift.therapistName}</span>
        </Tooltip>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
          title="Edit shift hours"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => shift.id !== undefined && onRemove(shift.id)}
          className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          title="Remove assignment"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface ScheduleGridViewProps {
  rooms: Room[];
  roster: Roster;
  date: string;
  shiftType: ShiftType;
  shiftStartTime: string;
  shiftEndTime: string;
  timeSlots: string[];
  flatTreatments: FlatTreatmentSlot[];
  categories: TreatmentCategory[];
  therapists: { id: number; name: string }[];
  changeRoomStatus: (room: Room, opening: RoomOpening | undefined, categoryValue: string) => void;
  assignTherapist: (room: Room, therapistId: number, startTimeStr: string, endTimeStr: string) => void;
  updateTherapistShift: (id: number, startTimeStr: string, endTimeStr: string) => void;
  removeTherapistShift: (id: number) => void;
  handleUnblockSlot: (id: number) => void;
  onOpenBookingDetail: (bookingId: number) => void;
  navigate: ReturnType<typeof useNavigate>;
  chainId: number | null;
  locationId: number | null;
  loadRosterAndBookings: (force?: boolean) => void;
  workClose: string | undefined;
  // "Add appointment" from the slot popover books via customer emulation -- gated on canEmulate.
  canAddAppointment: boolean;
}

function ScheduleGridView({
  rooms,
  roster,
  date,
  shiftType,
  shiftStartTime,
  shiftEndTime,
  timeSlots,
  flatTreatments,
  categories,
  therapists,
  changeRoomStatus,
  assignTherapist,
  updateTherapistShift,
  removeTherapistShift,
  handleUnblockSlot,
  onOpenBookingDetail,
  navigate,
  chainId,
  locationId,
  loadRosterAndBookings,
  workClose,
  canAddAppointment,
}: ScheduleGridViewProps) {
  const blockSpans = useMemo(
    () => computeBlockSpans(rooms, roster.blockedSlots || [], timeSlots),
    [rooms, roster.blockedSlots, timeSlots],
  );

  const [popover, setPopover] = useState<{
    isOpen: boolean;
    position: { x: number; y: number } | null;
    roomId: number;
    startTime: string;
  } | null>(null);

  const [appointmentModal, setAppointmentModal] = useState<{ roomId: number; roomName?: string; startTime: string } | null>(null);

  const [blockModalState, setBlockModalState] = useState<{
    isOpen: boolean;
    roomId: number;
    roomName?: string;
    startTime: string;
    maxMinutes: number;
    existingBlock?: BlockedSlot | null;
  }>({
    isOpen: false,
    roomId: 0,
    startTime: '09:00',
    maxMinutes: 30,
    existingBlock: null,
  });

  // Per-room staff popover: lists every therapist window assigned to that room for this shift/date
  // (a room can hold more than one, e.g. a primary plus a proxy covering an interval), and a small
  // form to add another one -- assigning rejects only if it overlaps another therapist's window in
  // the same room, so a narrower proxy window can sit alongside the primary's without evicting them.
  const [staffPopover, setStaffPopover] = useState<{ roomId: number; roomName: string; x: number; y: number } | null>(null);
  const [newAssignTherapistId, setNewAssignTherapistId] = useState<number | ''>('');
  const [newAssignStart, setNewAssignStart] = useState(shiftStartTime);
  const [newAssignEnd, setNewAssignEnd] = useState(shiftEndTime);

  useEffect(() => {
    if (!staffPopover) return;
    const close = () => setStaffPopover(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [staffPopover]);

  function openStaffPopover(e: React.MouseEvent, room: Room) {
    e.stopPropagation();
    setStaffPopover({ roomId: room.id, roomName: room.name, x: e.clientX, y: e.clientY });
    setNewAssignTherapistId('');
    setNewAssignStart(shiftStartTime);
    setNewAssignEnd(shiftEndTime);
  }

  function handleAddAssignment() {
    if (!staffPopover || newAssignTherapistId === '' || newAssignStart >= newAssignEnd) return;
    const room = rooms.find((r) => r.id === staffPopover.roomId);
    if (!room) return;
    assignTherapist(room, newAssignTherapistId, newAssignStart, newAssignEnd);
    setNewAssignTherapistId('');
  }

  const popoverAssignments = staffPopover
    ? (roster.therapistShifts || [])
      .filter((s) => s.roomId === staffPopover.roomId && s.shiftType === shiftType)
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    : [];

  // Compute free minutes from startTime until next booking/block/close
  function getMaxBlockMinutes(roomId: number, startTime: string): number {
    const candidates: string[] = [];
    if (workClose) candidates.push(workClose);
    for (const t of flatTreatments) {
      if (t.roomId === roomId && t.startTimeStr > startTime) candidates.push(t.startTimeStr);
    }
    for (const b of roster.blockedSlots) {
      if (!b.startTime) continue;
      const bStart = b.startTime.slice(0, 5);
      if (b.roomId === roomId && bStart > startTime) candidates.push(bStart);
    }
    const cutoff = candidates.length > 0 ? candidates.reduce((a, b) => (a < b ? a : b)) : '23:59';
    const [sh, sm] = startTime.split(':').map(Number);
    const [ch, cm] = cutoff.split(':').map(Number);
    return Math.max(0, ch * 60 + cm - (sh * 60 + sm));
  }

  function handleBlockSlot(roomId: number, slotTime: string) {
    const maxMinutes = getMaxBlockMinutes(roomId, slotTime);
    if (maxMinutes < 5) return;
    const rm = rooms.find((r) => r.id === roomId);
    setBlockModalState({ isOpen: true, roomId, roomName: rm?.name, startTime: slotTime, maxMinutes, existingBlock: null });
  }

  function handleEditBlockSlot(block: BlockedSlot) {
    if (!block.id || block.id <= 0 || !block.startTime || block.roomId === undefined) return;
    const rm = rooms.find((r) => r.id === block.roomId);
    const slotTime = block.startTime.slice(0, 5);
    const maxMinutes = getMaxBlockMinutes(block.roomId, slotTime);
    setBlockModalState({ isOpen: true, roomId: block.roomId, roomName: rm?.name, startTime: slotTime, maxMinutes, existingBlock: block });
  }

  return (
    <>
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
                <span className="h-2.5 w-2.5 rounded-full bg-gray-500" />
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
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                Blocked
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
              {/* CSS Grid instead of a <table> -- a table cell's height is famously unreliable to
                stretch a child to fill (percentage heights on <td> children are inconsistent across
                browsers when a sibling column's row is taller), which showed up as a visible gap
                between consecutive rows of the same blocked-slot group. Grid items stretch to fill
                their row track by default, no percentage-height special-casing needed. */}
              <div
                role="table"
                className="grid text-left text-xs"
                style={{ gridTemplateColumns: `6.5rem repeat(${rooms.length}, minmax(260px, 1fr))` }}
              >
                <div role="row" className="contents">
                  <div
                    role="columnheader"
                    className="sticky left-0 z-20 w-26 border-r border-b border-border bg-accent/60 p-3.5 font-bold text-foreground flex items-center justify-center text-center"
                  >
                    Time Slot
                  </div>
                  {rooms.map((room) => {
                    const opening = roster.roomOpenings.find((ro) => ro.roomId === room.id && ro.shiftType === shiftType);
                    const roomShifts = (roster.therapistShifts || [])
                      .filter((s) => s.roomId === room.id && s.shiftType === shiftType)
                      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
                    const primaryName = roomShifts[0]?.therapistName || room.name;

                    const hasBooking = flatTreatments.some((t) => (t.roomId ? t.roomId === room.id : t.roomName === room.name));
                    void hasBooking;

                    return (
                      <div
                        key={room.id}
                        role="columnheader"
                        className="border-r border-b border-border bg-card/90 p-3.5 font-semibold text-center flex flex-col items-center justify-between sticky top-0 z-10 space-y-2.5"
                      >
                        {/* Fresha Staff Avatar Icon -- Clickable to see/manage assigned staff */}
                        <Tooltip content={`Click to view assigned staff for ${room.name}`}>
                          <div
                            onClick={(e) => openStaffPopover(e, room)}
                            className="relative h-12 w-12 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30 flex items-center justify-center font-extrabold text-base shadow-xs shrink-0 cursor-pointer hover:ring-2 hover:ring-primary hover:scale-105 transition-all"
                          >
                            {getInitials(primaryName)}
                            {roomShifts.length > 1 && (
                              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-extrabold text-primary-foreground shadow-xs">
                                +{roomShifts.length - 1}
                              </span>
                            )}
                          </div>
                        </Tooltip>

                        <div className="w-full text-center min-w-0">
                          <Tooltip content={primaryName}>
                            <div className="text-sm font-bold text-foreground truncate w-full">{primaryName}</div>
                          </Tooltip>
                          <Tooltip content={room.name}>
                            <div className="text-xs font-medium text-muted-foreground truncate w-full">{room.name}</div>
                          </Tooltip>
                        </div>

                        {/* Category picker & Staff button */}
                        <div className="w-full space-y-1.5 pt-1">
                          <select
                            value={opening ? String(opening.treatmentCategoryId) : ''}
                            onChange={(e) => changeRoomStatus(room, opening, e.target.value)}
                            disabled={categories.length === 0}
                            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-semibold text-foreground text-center focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer shadow-xs transition-colors"
                          >
                            <option value="">Closed</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          {categories.length === 0 && (
                            <p className="text-[10px] font-medium text-muted-foreground">
                              No treatment categories for this location &mdash; add one in Catalog to open rooms.
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={(e) => openStaffPopover(e, room)}
                            className="w-full rounded-lg border border-input bg-accent/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent hover:border-primary/40 transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                          >
                            <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                            Staff ({roomShifts.length})
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {timeSlots.map((slot, slotIdx) => (
                  <div key={slot} role="row" className="contents">
                    {/* Sticky Time Column -- display:contents on the row wrapper above means it has no
                      box of its own, so :hover can't reliably hit-test on it (no rendered element to
                      hover); each cell gets its own hover highlight instead of a synced whole-row one. */}
                    <div className="sticky left-0 z-10 flex items-center border-r border-b border-border bg-card p-2.5 font-mono text-xs font-bold text-foreground hover:bg-accent/10 transition-colors">
                      {slot}
                    </div>

                    {/* Room Columns */}
                    {rooms.map((room) => {
                      const blockCell = blockSpans.get(room.id)?.get(slotIdx);

                      const opening = roster.roomOpenings.find((ro) => ro.roomId === room.id && ro.shiftType === shiftType);
                      const isOpen = !!opening;

                      const nextSlot = slotIdx + 1 < timeSlots.length ? timeSlots[slotIdx + 1] : '23:59';

                      // Find any treatment booking that covers this room and time slot
                      const matchedTreatment = flatTreatments.find((t) => {
                        const matchRoom = t.roomId ? t.roomId === room.id : t.roomName === room.name;
                        return matchRoom && slot < t.endTimeStr && nextSlot > t.startTimeStr;
                      });

                      const isTempBooked = matchedTreatment?.status === 'Draft';
                      void isTempBooked;

                      const activeTherapists = (roster.therapistShifts || []).filter((s) => {
                        if (s.roomId !== room.id || !s.startTime || !s.endTime) return false;
                        const startStr = s.startTime.slice(0, 5);
                        const endStr = s.endTime.slice(0, 5);
                        return slot >= startStr && slot < endStr;
                      });
                      const isStaffed = isOpen && activeTherapists.length > 0;

                      return (
                        <div
                          key={room.id}
                          role="cell"
                          className={`border-r border-b border-border/40 hover:bg-accent/10 transition-colors ${blockCell ? 'px-2 py-0' : 'p-2'}`}
                        >
                          {matchedTreatment ? (
                            /* FRESHA SKY-BLUE BOOKED APPOINTMENT CARD */
                            <Tooltip content={`Booking #${matchedTreatment.bookingId}: ${matchedTreatment.treatmentName} — ${matchedTreatment.customerName}`}>
                              <div
                                className="rounded-xl border p-2.5 shadow-2xs cursor-pointer hover:brightness-95 transition space-y-0.5"
                                style={getStatusCardStyle(matchedTreatment.appointmentStatusColorHex)}
                                onClick={() => onOpenBookingDetail(matchedTreatment.bookingId)}
                              >
                                <div className="text-xs font-extrabold flex items-center justify-between gap-1">
                                  <span>{matchedTreatment.startTimeStr} – {matchedTreatment.endTimeStr}</span>
                                  <span className="text-xs font-mono font-extrabold opacity-95">#{matchedTreatment.bookingId}</span>
                                </div>
                                <div className="text-xs font-extrabold truncate">
                                  {matchedTreatment.treatmentName}
                                </div>
                                <div className="text-xs font-bold opacity-100 truncate">
                                  👤 {matchedTreatment.customerName}
                                </div>
                              </div>
                            </Tooltip>
                          ) : blockCell ? (
                            /* BLOCKED SLOT -- every 15-min row the block covers keeps its own visible
                               cell (content repeats per row); border-t/rounded-t only on the group's
                               first row and border-b/rounded-b only on its last stitch the individual
                               rows into one rectangle outline for the whole group. */
                            <Tooltip content={blockCell.blocks.length === 1 ? `Click to edit: ${blockCell.blocks[0].reason}` : `${blockCell.blocks.length} overlapping blocked ranges`}>
                              <div
                                className={`h-full border-l border-r border-violet-500/50 bg-violet-500/15 p-2.5 space-y-1.5 shadow-2xs cursor-pointer hover:bg-violet-500/25 transition ${blockCell.position === 'only'
                                  ? 'rounded-lg border-t border-b'
                                  : blockCell.position === 'first'
                                    ? 'rounded-t-lg border-t'
                                    : blockCell.position === 'last'
                                      ? 'rounded-b-lg border-b'
                                      : ''
                                  }`}
                                onClick={() => blockCell.blocks.length > 0 && handleEditBlockSlot(blockCell.blocks[0])}
                              >
                                {blockCell.blocks.map((block) => {
                                  const blockId = block.id ?? 0;
                                  return (
                                    <div key={blockId} className="space-y-1">
                                      <div className="flex items-center justify-between gap-1">
                                        <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${blockId <= 0
                                          ? 'bg-amber-500/25 border-amber-500/50 text-amber-900 dark:text-amber-100'
                                          : 'bg-violet-500/25 border-violet-500/50 text-violet-900 dark:text-violet-100'
                                          }`}>
                                          {blockId <= 0 ? 'Lunch Break' : 'Blocked'}
                                        </span>
                                        {blockId > 0 ? (
                                          <button
                                            type="button"
                                            onClick={() => handleUnblockSlot(blockId)}
                                            className="text-xs font-bold text-violet-700 dark:text-violet-300 underline cursor-pointer"
                                          >
                                            Unblock
                                          </button>
                                        ) : (
                                          <span className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-0.5">
                                            🔒 Locked
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs font-mono font-extrabold text-violet-900 dark:text-violet-100">
                                        {(block.startTime ?? '').slice(0, 5)}–{(block.endTime ?? '').slice(0, 5)}
                                      </p>
                                      <p className="text-xs font-semibold text-violet-950 dark:text-violet-100 line-clamp-2">
                                        {block.reason}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </Tooltip>
                          ) : isStaffed ? (
                            /* OPEN AVAILABLE SLOT WITH CATEGORY & ASSIGNED THERAPIST */
                            <div
                              className="rounded-lg border border-gray-500/30 bg-gray-500/10 p-2 space-y-1 shadow-2xs cursor-pointer hover:bg-gray-500/20 transition"
                              onClick={(e) => {
                                setPopover({
                                  isOpen: true,
                                  position: { x: e.clientX, y: e.clientY },
                                  roomId: room.id,
                                  startTime: slot,
                                });
                              }}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                                  Available
                                </span>
                                <Tooltip content={opening?.categoryName}>
                                  <span className="text-xs font-semibold text-foreground truncate">{opening?.categoryName}</span>
                                </Tooltip>
                              </div>
                              <div className="text-xs font-medium text-foreground flex items-center gap-1.5 pt-0.5">
                                <span className="text-muted-foreground text-[11px] uppercase font-bold">Staff:</span>
                                <span className="font-semibold text-foreground truncate">
                                  {activeTherapists.map((t) => t.therapistName).join(', ')}
                                </span>
                              </div>
                            </div>
                          ) : (
                            /* CLOSED OR UNSTAFFED ROOM SLOT */
                            <div
                              className={`rounded-md bg-muted/30 border border-border/50 p-2 text-center space-y-1 ${isOpen ? 'cursor-pointer hover:bg-muted/50 transition' : ''}`}
                              onClick={isOpen ? (e) => {
                                setPopover({
                                  isOpen: true,
                                  position: { x: e.clientX, y: e.clientY },
                                  roomId: room.id,
                                  startTime: slot,
                                });
                              } : undefined}
                            >
                              <p className="text-xs text-muted-foreground font-medium">
                                {isOpen ? 'No Staff Assigned' : 'Closed'}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {staffPopover && (
        <div
          className="fixed z-50 w-96 rounded-xl border border-border/80 bg-card p-4 text-xs shadow-2xl space-y-3.5"
          style={{
            top: Math.min(staffPopover.y, window.innerHeight - 420),
            left: Math.min(staffPopover.x, window.innerWidth - 400),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <div className="font-bold text-sm text-foreground">{staffPopover.roomName}</div>
                <p className="text-[10px] text-muted-foreground">Manage Assigned Staff & Shifts</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStaffPopover(null)}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Active Staff</p>
              <span className="text-[10px] font-medium text-muted-foreground font-mono">{popoverAssignments.length} assigned</span>
            </div>
            {popoverAssignments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 p-3.5 text-center text-muted-foreground/70 bg-muted/10">
                No therapist assigned to this room yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
                {popoverAssignments.map((s) => (
                  <ShiftRow key={s.id} shift={s} onUpdate={updateTherapistShift} onRemove={removeTherapistShift} />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2.5 border-t border-border/60 pt-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Assign Staff / Proxy Shift</p>
            <select
              value={newAssignTherapistId}
              onChange={(e) => setNewAssignTherapistId(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-xs focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="">Select therapist to assign...</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">From</label>
                <input
                  type="time"
                  value={newAssignStart}
                  onChange={(e) => setNewAssignStart(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-mono shadow-xs focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">To</label>
                <input
                  type="time"
                  value={newAssignEnd}
                  onChange={(e) => setNewAssignEnd(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-mono shadow-xs focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full h-8 font-semibold mt-1"
              disabled={newAssignTherapistId === '' || newAssignStart >= newAssignEnd}
              onClick={handleAddAssignment}
            >
              + Add Staff Assignment
            </Button>
          </div>
        </div>
      )}

      <QuickActionsPopover
        isOpen={popover?.isOpen ?? false}
        onClose={() => setPopover(null)}
        position={popover?.position ?? null}
        timeDisplay={popover?.startTime ?? ''}
        showAddAppointment={canAddAppointment}
        onAddAppointment={() => {
          if (popover) {
            const room = rooms.find((r) => r.id === popover.roomId);
            setAppointmentModal({ roomId: popover.roomId, roomName: room?.name, startTime: popover.startTime });
          }
        }}
        onAddGroupAppointment={() => navigate(routes.bookings)}
        onAddBlockedTime={() => {
          if (popover) {
            handleBlockSlot(popover.roomId, popover.startTime);
          }
        }}
      />

      <AddAppointmentModal
        isOpen={appointmentModal !== null}
        onClose={() => setAppointmentModal(null)}
        onSuccess={() => loadRosterAndBookings(true)}
        locationId={locationId}
        roomId={appointmentModal?.roomId ?? 0}
        roomName={appointmentModal?.roomName}
        workDate={date}
        startTime={appointmentModal?.startTime ?? '09:00'}
        therapists={therapists}
        therapistShifts={roster.therapistShifts}
        rooms={rooms}
      />

      <EditBlockSlotModal
        isOpen={blockModalState.isOpen}
        onClose={() => setBlockModalState((prev) => ({ ...prev, isOpen: false }))}
        onSuccess={() => loadRosterAndBookings(true)}
        chainId={chainId}
        locationId={locationId}
        roomId={blockModalState.roomId}
        roomName={blockModalState.roomName}
        workDate={date}
        startTime={blockModalState.startTime}
        maxMinutes={blockModalState.maxMinutes}
        existingBlock={blockModalState.existingBlock}
        therapists={therapists}
      />
    </>
  );
}
