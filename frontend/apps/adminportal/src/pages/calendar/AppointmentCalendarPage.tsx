import { useCallback, useEffect, useMemo, useState } from 'react';
import Select, { type SingleValue } from 'react-select';
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react';
import type { DragEndEvent } from '@dnd-kit/react';
import { Badge, Card, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminBookingsApi, adminCatalogApi, ApiError } from '../../api/client';
import { bookingStreamUrl, subscribeToStream } from '../../api/sseClient';
import type { AdminBooking, Location, Room } from '../../api/types';
import { type SelectOption, selectClassNames, selectMenuPortalStyles } from '../../components/reactSelectStyles';

const SLOT_MINUTES = 15;
const ROW_HEIGHT_PX = 22;
const TIME_COL_PX = 64;
const COL_PX = 160;

type ViewMode = 'day' | 'week';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Monday-Sunday week containing `dateStr`.
function weekDatesFor(dateStr: string): string[] {
  const d = new Date(`${dateStr}T00:00:00`);
  const mondayOffset = d.getDay() === 0 ? -6 : 1 - d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd.toISOString().slice(0, 10);
  });
}

function generateTimeSlots(startStr: string, endStr: string): string[] {
  const [startH, startM] = (startStr || '09:00').split(':').map(Number);
  const [endH, endM] = (endStr || '18:00').split(':').map(Number);
  const slots: string[] = [];
  let cur = startH * 60 + startM;
  const end = endH * 60 + endM;
  while (cur < end) {
    slots.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`);
    cur += SLOT_MINUTES;
  }
  return slots;
}

function toHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface FlatAppointment {
  bookingId: number;
  treatmentId: number;
  treatmentName: string;
  customerName: string;
  roomId: number;
  therapistId: number | null;
  therapistName: string | null;
  status: string;
  dateStr: string;
  startHHMM: string;
  slotCount: number;
}

function flattenAppointments(bookings: AdminBooking[]): FlatAppointment[] {
  const out: FlatAppointment[] = [];
  for (const b of bookings) {
    for (const t of b.treatments) {
      if (!t.roomId || !t.startTime) continue;
      out.push({
        bookingId: b.id,
        treatmentId: t.treatmentId,
        treatmentName: t.treatmentName,
        customerName: b.customerName,
        roomId: t.roomId,
        therapistId: t.therapistId ?? null,
        therapistName: t.therapistName,
        status: b.status,
        dateStr: t.startTime.slice(0, 10),
        startHHMM: toHHMM(t.startTime),
        slotCount: t.slotCount,
      });
    }
  }
  return out;
}

// A calendar column: day view = one per room (fixed date), week view = one per day (fixed room).
interface Column {
  key: string;
  label: string;
  roomId: number;
  dateStr: string;
}

function AppointmentBlock({ appt, top, height }: { appt: FlatAppointment; top: number; height: number }) {
  const draggable = appt.status === 'Confirmed';
  const { ref, isDragging } = useDraggable({
    id: `${appt.bookingId}-${appt.treatmentId}`,
    data: appt,
    disabled: !draggable,
  });

  return (
    <div
      ref={ref}
      style={{ top, height }}
      className={`absolute left-1 right-1 rounded-lg border px-2 py-1 text-[11px] overflow-hidden transition-opacity ${
        draggable ? 'cursor-grab border-primary/40 bg-primary/10' : 'cursor-default border-border bg-muted/40'
      } ${isDragging ? 'opacity-30' : ''}`}
      title={`${appt.treatmentName} — ${appt.customerName}${appt.therapistName ? ` — ${appt.therapistName}` : ''}`}
    >
      <div className="font-semibold text-foreground truncate">{appt.treatmentName}</div>
      <div className="text-muted-foreground truncate">{appt.customerName}</div>
    </div>
  );
}

function DroppableCell({ roomId, dateStr, time }: { roomId: number; dateStr: string; time: string }) {
  const { ref, isDropTarget } = useDroppable({ id: `${roomId}__${dateStr}__${time}`, data: { roomId, dateStr, time } });
  return (
    <div
      ref={ref}
      style={{ height: ROW_HEIGHT_PX }}
      className={`border-b border-r border-border/40 transition-colors ${isDropTarget ? 'bg-primary/15' : ''}`}
    />
  );
}

export function AppointmentCalendarPage() {
  const [chains, setChains] = useState<{ id: number; name: string }[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [date, setDate] = useState(today());
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [weekRoomId, setWeekRoomId] = useState<number | null>(null);
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminCatalogApi.apiAdminCatalogChainsGet().then(({ data }) => {
      const cs = data as unknown as { id: number; name: string }[];
      setChains(cs);
      if (cs.length > 0) setChainId(cs[0].id);
    });
  }, []);

  useEffect(() => {
    if (chainId === null) return;
    adminCatalogApi.apiAdminCatalogLocationsGet(chainId).then(({ data }) => {
      const locs = data as unknown as Location[];
      setLocations(locs);
      setLocationId(locs.length > 0 ? locs[0].id : null);
    });
  }, [chainId]);

  useEffect(() => {
    if (locationId === null) return;
    adminCatalogApi.apiAdminCatalogRoomsGet(locationId).then(({ data }) => setRooms(data as unknown as Room[]));
  }, [locationId]);

  // Default (or re-pick, if the location changed) which room week view is anchored to.
  useEffect(() => {
    if (rooms.length === 0) {
      setWeekRoomId(null);
      return;
    }
    setWeekRoomId((prev) => (prev !== null && rooms.some((r) => r.id === prev) ? prev : rooms[0].id));
  }, [rooms]);

  const weekDates = useMemo(() => weekDatesFor(date), [date]);

  const loadBookings = useCallback(
    (isSilent = false) => {
      if (locationId === null) return;
      if (!isSilent) setBookings(null);
      const dates = viewMode === 'week' ? weekDates : [date];
      Promise.all(dates.map((d) => adminBookingsApi.apiAdminBookingsGet(locationId, d).then(({ data }) => data as unknown as AdminBooking[])))
        .then((results) => setBookings(results.flat()))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load bookings.'));
    },
    [locationId, date, viewMode, weekDates],
  );

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // Live slot-changed updates only cover a single date's stream -- week view (7 dates at once)
  // falls back to the 15s poll below instead of opening 7 concurrent subscriptions.
  useEffect(() => {
    if (locationId === null || viewMode !== 'day') return;
    const unsubscribe = subscribeToStream(bookingStreamUrl(locationId, date), 'slot-changed', () => loadBookings(true));
    return unsubscribe;
  }, [locationId, date, viewMode, loadBookings]);

  useEffect(() => {
    if (locationId === null) return;
    const interval = setInterval(() => loadBookings(true), 15000);
    return () => clearInterval(interval);
  }, [locationId, loadBookings]);

  const selectedLocation = locations.find((l) => l.id === locationId);
  const slots = useMemo(
    () => generateTimeSlots(selectedLocation?.openTime?.slice(0, 5) ?? '09:00', selectedLocation?.closeTime?.slice(0, 5) ?? '18:00'),
    [selectedLocation],
  );
  const slotIndex = useMemo(() => new Map(slots.map((s, i) => [s, i])), [slots]);
  const appointments = useMemo(() => flattenAppointments(bookings ?? []), [bookings]);

  const columns: Column[] = useMemo(() => {
    if (viewMode === 'day') {
      return rooms.map((r) => ({ key: String(r.id), label: r.name, roomId: r.id, dateStr: date }));
    }
    if (weekRoomId === null) return [];
    return weekDates.map((d) => ({
      key: d,
      label: new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      roomId: weekRoomId,
      dateStr: d,
    }));
  }, [viewMode, rooms, date, weekRoomId, weekDates]);

  async function handleDragEnd(event: DragEndEvent) {
    const { source, target } = event.operation;
    if (!source || !target) return;
    const appt = source.data as FlatAppointment;
    const cell = target.data as { roomId: number; dateStr: string; time: string };

    const [h, m] = cell.time.split(':').map(Number);
    const start = new Date(`${cell.dateStr}T00:00:00`);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + appt.slotCount * SLOT_MINUTES * 60 * 1000);

    if (cell.roomId === appt.roomId && cell.dateStr === appt.dateStr && cell.time === appt.startHHMM) return;

    try {
      await adminBookingsApi.apiAdminBookingsIdTreatmentsTreatmentIdReschedulePut(appt.bookingId, appt.treatmentId, {
        roomId: cell.roomId,
        therapistId: appt.therapistId ?? 0,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      loadBookings(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not move that appointment -- the slot may already be taken.');
      loadBookings(true);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointment Calendar"
        description="Drag a confirmed appointment to a new room or time."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {chains.length > 1 && (
              <Select
                value={chains.map((c) => ({ value: String(c.id), label: c.name })).find((o) => o.value === String(chainId ?? '')) ?? null}
                onChange={(picked: SingleValue<SelectOption>) => setChainId(Number(picked?.value ?? ''))}
                options={chains.map((c) => ({ value: String(c.id), label: c.name }))}
                unstyled
                classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground')}
                menuPortalTarget={document.body}
                styles={selectMenuPortalStyles}
              />
            )}
            <Select
              value={locations.map((l) => ({ value: String(l.id), label: l.name })).find((o) => o.value === String(locationId ?? '')) ?? null}
              onChange={(picked: SingleValue<SelectOption>) => setLocationId(Number(picked?.value ?? ''))}
              options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
              unstyled
              classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[160px]')}
              menuPortalTarget={document.body}
              styles={selectMenuPortalStyles}
            />
            {viewMode === 'week' && rooms.length > 1 && (
              <Select
                value={rooms.map((r) => ({ value: String(r.id), label: r.name })).find((o) => o.value === String(weekRoomId ?? '')) ?? null}
                onChange={(picked: SingleValue<SelectOption>) => setWeekRoomId(Number(picked?.value ?? ''))}
                options={rooms.map((r) => ({ value: String(r.id), label: r.name }))}
                unstyled
                classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[140px]')}
                menuPortalTarget={document.body}
                styles={selectMenuPortalStyles}
              />
            )}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground"
            />
            <div className="flex rounded-lg border border-input overflow-hidden">
              {(['day', 'week'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                    viewMode === m ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">{error}</div>
      )}

      {!bookings || columns.length === 0 ? (
        <LoadingFallback />
      ) : (
        <Card className="overflow-x-auto">
          <DragDropProvider onDragEnd={handleDragEnd}>
            <div className="relative" style={{ width: TIME_COL_PX + columns.length * COL_PX }}>
              <div className="grid" style={{ gridTemplateColumns: `${TIME_COL_PX}px repeat(${columns.length}, ${COL_PX}px)` }}>
                {/* Header row */}
                <div className="sticky top-0 z-10 border-b border-r border-border bg-card" />
                {columns.map((c) => (
                  <div key={c.key} className="sticky top-0 z-10 border-b border-r border-border bg-card px-2 py-2 text-xs font-bold text-foreground">
                    {c.label}
                  </div>
                ))}

                {/* Time rows */}
                {slots.map((time) => (
                  <div key={time} className="contents">
                    <div
                      style={{ height: ROW_HEIGHT_PX }}
                      className="flex items-start justify-end border-b border-r border-border/40 pr-1.5 text-[10px] text-muted-foreground"
                    >
                      {time.endsWith(':00') ? time : ''}
                    </div>
                    {columns.map((c) => (
                      <DroppableCell key={c.key} roomId={c.roomId} dateStr={c.dateStr} time={time} />
                    ))}
                  </div>
                ))}
              </div>

              {/* Appointment blocks, absolutely positioned over the grid (header row is one row tall) */}
              {columns.map((c, colIdx) => (
                <div
                  key={`overlay-${c.key}`}
                  className="pointer-events-none absolute"
                  style={{
                    left: TIME_COL_PX + colIdx * COL_PX,
                    top: ROW_HEIGHT_PX,
                    width: COL_PX,
                    height: slots.length * ROW_HEIGHT_PX,
                  }}
                >
                  {appointments
                    .filter((a) => a.roomId === c.roomId && a.dateStr === c.dateStr)
                    .map((a) => {
                      const idx = slotIndex.get(a.startHHMM);
                      if (idx === undefined) return null;
                      return (
                        <div key={`${a.bookingId}-${a.treatmentId}`} className="pointer-events-auto">
                          <AppointmentBlock appt={a} top={idx * ROW_HEIGHT_PX} height={a.slotCount * ROW_HEIGHT_PX} />
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </DragDropProvider>

          <div className="flex flex-wrap items-center gap-4 border-t border-border p-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-primary/40 bg-primary/10" /> Confirmed (draggable)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-border bg-muted/40" /> Draft (not yet confirmed)
            </span>
            <Badge status="Confirmed" className="ml-auto" />
          </div>
        </Card>
      )}
    </div>
  );
}
