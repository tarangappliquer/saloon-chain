import { forwardRef, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Button, Card, CardContent, CardHeader, CardTitle, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminBookingsApi, adminCatalogApi, adminStaffApi, ApiError, schedulingApi } from '../../api/client';
import { bookingStreamUrl, subscribeToStream } from '../../api/sseClient';
import { useAuth } from '../../features/auth/AuthContext';
import type { AdminBooking, BlockedSlot, Location, Room, RoomOpening, Roster, ShiftType, StaffUser, TreatmentCategory } from '../../api/types';
import { EditBlockSlotModal } from '../../components/EditBlockSlotModal';
import { QuickActionsPopover } from '../../components/QuickActionsPopover';
import { routes } from '../../routes';


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
        const startStr = block.startTime.slice(0, 5);
        const endStr = block.endTime.slice(0, 5);
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
  const [shiftType] = useState<ShiftType>(paramShiftType || 'Morning');
  const [startTime] = useState(SHIFT_TIME_DEFAULTS[paramShiftType || 'Morning'].startTime);
  const [endTime] = useState(SHIFT_TIME_DEFAULTS[paramShiftType || 'Morning'].endTime);

  const [therapists, setTherapists] = useState<{ id: number; name: string }[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [categories, setCategories] = useState<TreatmentCategory[]>([]);
  const [roster, setRoster] = useState<Roster>({ therapistShifts: [], roomOpenings: [], blockedSlots: [] });
  const [bookings, setBookings] = useState<AdminBooking[]>([]);

  const [selectedTherapistFilter, setSelectedTherapistFilter] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'Day' | 'Week'>('Day');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    console.log(newDate)
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
    const unsubscribe = subscribeToStream(bookingStreamUrl(locationId, date), 'slot-changed', () => {
      loadRosterAndBookings(true);
    });

    const timer = setInterval(() => {
      loadRosterAndBookings(true);
    }, 15000);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [locationId, date, loadRosterAndBookings]);

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
        {/* Left Group: Today, < Date >, Saloon ▾, Scheduled team ▾, Filter button */}
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

          <select
            value={selectedTherapistFilter ?? ''}
            onChange={(e) => setSelectedTherapistFilter(e.target.value ? Number(e.target.value) : null)}
            className="rounded-full border border-border bg-background px-3.5 py-1 text-xs font-bold text-foreground hover:bg-accent transition cursor-pointer focus:outline-hidden"
          >
            <option value="">Scheduled team</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                👤 {t.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="flex items-center justify-center h-7 w-7 rounded-full border border-border bg-background text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition cursor-pointer"
            title="Filter schedule"
          >
            🎛️
          </button>
        </div>

        {/* Right Group: Settings, Refresh, View Mode, + Add */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition cursor-pointer"
            title="Settings"
          >
            ⚙️
          </button>

          <button
            type="button"
            onClick={() => loadRosterAndBookings(true)}
            className="flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition cursor-pointer text-sm"
            title="Refresh Schedule"
          >
            🔄
          </button>

          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as 'Day' | 'Week')}
            className="rounded-full border border-border bg-background px-3 py-1 text-xs font-bold text-foreground hover:bg-accent transition cursor-pointer focus:outline-hidden"
          >
            <option value="Day">Day</option>
            <option value="Week">Week</option>
          </select>

          <button
            type="button"
            className="rounded-full bg-black text-white dark:bg-white dark:text-black px-4 py-1.5 text-xs font-extrabold hover:opacity-90 transition cursor-pointer shadow-xs"
          >
            Add ▾
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
          timeSlots={timeSlots}
          flatTreatments={flatTreatments}
          categories={categories}
          therapists={therapists}
          changeRoomStatus={changeRoomStatus}
          handleUnblockSlot={handleUnblockSlot}
          navigate={navigate}
          chainId={chainId}
          locationId={locationId}
          loadRosterAndBookings={loadRosterAndBookings}
          workClose={workClose}
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
  changeRoomStatus: (room: Room, opening: RoomOpening | undefined, categoryValue: string) => void;
  handleUnblockSlot: (id: number) => void;
  navigate: ReturnType<typeof useNavigate>;
  chainId: number | null;
  locationId: number | null;
  loadRosterAndBookings: (force?: boolean) => void;
  workClose: string | undefined;
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
  changeRoomStatus,
  handleUnblockSlot,
  navigate,
  chainId,
  locationId,
  loadRosterAndBookings,
  workClose,
}: ScheduleGridViewProps) {
  const blockSpans = computeBlockSpans(rooms, roster.blockedSlots || [], timeSlots);

  const [popover, setPopover] = useState<{
    isOpen: boolean;
    position: { x: number; y: number } | null;
    roomId: number;
    startTime: string;
  } | null>(null);

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

  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; kind: 'block'; roomId: number; startTime: string }
    | { x: number; y: number; kind: 'unblock'; blocks: BlockedSlot[] }
    | null
  >(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

  function openBlockMenu(e: React.MouseEvent, roomId: number, startTime: string) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, kind: 'block', roomId, startTime });
  }

  function openUnblockMenu(e: React.MouseEvent, blocks: BlockedSlot[]) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, kind: 'unblock', blocks });
  }

  // Compute free minutes from startTime until next booking/block/close
  function getMaxBlockMinutes(roomId: number, startTime: string): number {
    const candidates: string[] = [];
    if (workClose) candidates.push(workClose);
    for (const t of flatTreatments) {
      if (t.roomId === roomId && t.startTimeStr > startTime) candidates.push(t.startTimeStr);
    }
    for (const b of roster.blockedSlots) {
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
    if (block.id <= 0) return;
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
              style={{ gridTemplateColumns: `6rem repeat(${rooms.length}, minmax(220px, 1fr))` }}
            >
              <div role="row" className="contents">
                <div
                  role="columnheader"
                  className="sticky left-0 z-20 w-24 border-r border-b border-border bg-accent/60 p-3 font-semibold text-foreground"
                >
                  Time Slot
                </div>
                {rooms.map((room) => {
                  const opening = roster.roomOpenings.find((ro) => ro.roomId === room.id && ro.shiftType === shiftType);
                  const assignedShift = roster.therapistShifts.find((s) => s.roomId === room.id);
                  const assignedTherapistName = assignedShift ? therapists.find((t) => t.id === assignedShift.therapistId)?.name || 'Staff' : room.name;

                  const isOpen = !!opening;
                  const hasBooking = flatTreatments.some((t) => (t.roomId ? t.roomId === room.id : t.roomName === room.name));
                  void hasBooking;

                  return (
                    <div
                      key={room.id}
                      role="columnheader"
                      className="border-r border-b border-border bg-card p-3 font-semibold text-center flex flex-col items-center justify-center sticky top-0 z-10"
                    >
                      {/* Fresha Staff Avatar Icon */}
                      <div className="h-10 w-10 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30 flex items-center justify-center font-extrabold text-sm shadow-2xs">
                        {getInitials(assignedTherapistName)}
                      </div>

                      <div className="mt-1.5 text-xs font-bold text-foreground truncate max-w-36">
                        {assignedTherapistName}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-32">
                        {room.name}
                      </div>

                      <div className="mt-2 w-full space-y-1">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isOpen}
                            aria-label={`${room.name} open`}
                            disabled={categories.length === 0}
                            onClick={() => changeRoomStatus(room, opening, opening ? '' : String(categories[0]?.id ?? ''))}
                            className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isOpen ? 'border-emerald-500 bg-emerald-500' : 'border-border-strong bg-muted'}`}
                          >
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition-transform ${isOpen ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                          </button>
                          <span className="text-[10px] font-semibold text-muted-foreground">{isOpen ? 'Open' : 'Closed'}</span>
                        </div>
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
                      if (s.roomId !== room.id) return false;
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
                            <div
                              className="rounded-xl border border-sky-400/60 bg-[#99D9EA] dark:bg-sky-900/70 p-2.5 text-sky-950 dark:text-sky-100 shadow-2xs cursor-pointer hover:brightness-95 transition space-y-0.5"
                              onClick={() => navigate(routes.bookings)}
                              title={`Booking #${matchedTreatment.bookingId}: ${matchedTreatment.treatmentName} — ${matchedTreatment.customerName}`}
                            >
                              <div className="text-xs font-extrabold flex items-center justify-between gap-1">
                                <span>{matchedTreatment.startTimeStr} – {matchedTreatment.endTimeStr}</span>
                                <span className="text-[10px] font-bold opacity-75">#{matchedTreatment.bookingId}</span>
                              </div>
                              <div className="text-xs font-bold truncate">
                                {matchedTreatment.treatmentName}
                              </div>
                              <div className="text-[11px] font-medium opacity-90 truncate">
                                👤 {matchedTreatment.customerName}
                              </div>
                            </div>
                          ) : blockCell ? (
                            /* BLOCKED SLOT -- every 15-min row the block covers keeps its own visible
                               cell (content repeats per row); border-t/rounded-t only on the group's
                               first row and border-b/rounded-b only on its last stitch the individual
                               rows into one rectangle outline for the whole group. */
                            <div
                              className={`h-full border-l border-r border-violet-500/40 bg-violet-500/10 p-2 space-y-1.5 shadow-2xs cursor-pointer hover:bg-violet-500/20 transition ${blockCell.position === 'only'
                                ? 'rounded-lg border-t border-b'
                                : blockCell.position === 'first'
                                  ? 'rounded-t-lg border-t'
                                  : blockCell.position === 'last'
                                    ? 'rounded-b-lg border-b'
                                    : ''
                                }`}
                              title={blockCell.blocks.length === 1 ? `Click to edit: ${blockCell.blocks[0].reason}` : `${blockCell.blocks.length} overlapping blocked ranges`}
                              onClick={() => blockCell.blocks.length > 0 && handleEditBlockSlot(blockCell.blocks[0])}
                              onContextMenu={(e) => openUnblockMenu(e, blockCell.blocks)}
                            >
                              {blockCell.blocks.map((block) => (
                                <div key={block.id} className="space-y-1">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                                      block.id <= 0
                                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-800 dark:text-amber-200'
                                        : 'bg-violet-500/20 border-violet-500/40 text-violet-800 dark:text-violet-200'
                                    }`}>
                                      {block.id <= 0 ? 'Lunch Break' : 'Blocked'}
                                    </span>
                                    {block.id > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => handleUnblockSlot(block.id)}
                                        className="text-[10px] font-semibold text-violet-700 dark:text-violet-300 underline cursor-pointer"
                                      >
                                        Unblock
                                      </button>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-0.5">
                                        🔒 Locked
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] font-mono font-bold text-violet-700 dark:text-violet-300">
                                    {block.startTime.slice(0, 5)}–{block.endTime.slice(0, 5)}
                                  </p>
                                  <p className="text-[11px] text-violet-800 dark:text-violet-200 line-clamp-2">
                                    {block.reason}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : isStaffed ? (
                            /* OPEN AVAILABLE SLOT WITH CATEGORY & ASSIGNED THERAPIST */
                            <div
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 space-y-1 shadow-2xs cursor-pointer hover:bg-emerald-500/20 transition"
                              onClick={(e) => {
                                setPopover({
                                  isOpen: true,
                                  position: { x: e.clientX, y: e.clientY },
                                  roomId: room.id,
                                  startTime: slot,
                                });
                              }}
                              onContextMenu={(e) => openBlockMenu(e, room.id, slot)}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                  Available
                                </span>
                                <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-200 truncate max-w-27.5" title={opening?.categoryName}>
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
                            <div
                              className={`rounded-md bg-muted/15 p-2 text-center space-y-1 ${isOpen ? 'cursor-pointer hover:bg-muted/30 transition' : ''}`}
                              onClick={isOpen ? (e) => {
                                setPopover({
                                  isOpen: true,
                                  position: { x: e.clientX, y: e.clientY },
                                  roomId: room.id,
                                  startTime: slot,
                                });
                              } : undefined}
                              onContextMenu={isOpen ? (e) => openBlockMenu(e, room.id, slot) : undefined}
                            >
                              <p className="text-[10px] text-muted-foreground/40 italic">
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

    {contextMenu && (
      <div
        className="fixed z-50 min-w-35 rounded-lg border border-border bg-card py-1 text-xs shadow-lg"
        style={{ top: contextMenu.y, left: contextMenu.x }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {contextMenu.kind === 'block' ? (
          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              handleBlockSlot(contextMenu.roomId, contextMenu.startTime);
            }}
            className="block w-full px-3 py-1.5 text-left font-medium text-foreground hover:bg-accent"
          >
            Block slot
          </button>
        ) : (
          contextMenu.blocks.map((block) => (
            <button
              key={block.id}
              type="button"
              onClick={() => {
                setContextMenu(null);
                handleUnblockSlot(block.id);
              }}
              className="block w-full px-3 py-1.5 text-left font-medium text-violet-700 dark:text-violet-300 hover:bg-accent"
            >
              {contextMenu.blocks.length === 1 ? 'Unblock slot' : `Unblock ${block.startTime.slice(0, 5)}–${block.endTime.slice(0, 5)}`}
            </button>
          ))
        )}
      </div>
    )}

    <QuickActionsPopover
      isOpen={popover?.isOpen ?? false}
      onClose={() => setPopover(null)}
      position={popover?.position ?? null}
      timeDisplay={popover?.startTime ?? ''}
      onAddAppointment={() => navigate(routes.bookings)}
      onAddGroupAppointment={() => navigate(routes.bookings)}
      onAddBlockedTime={() => {
        if (popover) {
          handleBlockSlot(popover.roomId, popover.startTime);
        }
      }}
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
