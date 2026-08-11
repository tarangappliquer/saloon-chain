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
const ROOM_COL_PX = 160;

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
        startHHMM: toHHMM(t.startTime),
        slotCount: t.slotCount,
      });
    }
  }
  return out;
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

function DroppableCell({ roomId, time }: { roomId: number; time: string }) {
  const { ref, isDropTarget } = useDroppable({ id: `${roomId}__${time}`, data: { roomId, time } });
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

  const loadBookings = useCallback(
    (isSilent = false) => {
      if (locationId === null) return;
      if (!isSilent) setBookings(null);
      adminBookingsApi
        .apiAdminBookingsGet(locationId, date)
        .then(({ data }) => setBookings(data as unknown as AdminBooking[]))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load bookings.'));
    },
    [locationId, date],
  );

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    if (locationId === null) return;
    const unsubscribe = subscribeToStream(bookingStreamUrl(locationId, date), 'slot-changed', () => loadBookings(true));
    const interval = setInterval(() => loadBookings(true), 15000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [locationId, date, loadBookings]);

  const selectedLocation = locations.find((l) => l.id === locationId);
  const slots = useMemo(
    () => generateTimeSlots(selectedLocation?.openTime?.slice(0, 5) ?? '09:00', selectedLocation?.closeTime?.slice(0, 5) ?? '18:00'),
    [selectedLocation],
  );
  const slotIndex = useMemo(() => new Map(slots.map((s, i) => [s, i])), [slots]);
  const appointments = useMemo(() => flattenAppointments(bookings ?? []), [bookings]);

  async function handleDragEnd(event: DragEndEvent) {
    const { source, target } = event.operation;
    if (!source || !target) return;
    const appt = source.data as FlatAppointment;
    const cell = target.data as { roomId: number; time: string };

    const [h, m] = cell.time.split(':').map(Number);
    const start = new Date(`${date}T00:00:00`);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + appt.slotCount * SLOT_MINUTES * 60 * 1000);

    if (cell.roomId === appt.roomId && cell.time === appt.startHHMM) return;

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
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground"
            />
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">{error}</div>
      )}

      {!bookings || rooms.length === 0 ? (
        <LoadingFallback />
      ) : (
        <Card className="overflow-x-auto">
          <DragDropProvider onDragEnd={handleDragEnd}>
            <div className="relative" style={{ width: TIME_COL_PX + rooms.length * ROOM_COL_PX }}>
              <div className="grid" style={{ gridTemplateColumns: `${TIME_COL_PX}px repeat(${rooms.length}, ${ROOM_COL_PX}px)` }}>
                {/* Header row */}
                <div className="sticky top-0 z-10 border-b border-r border-border bg-card" />
                {rooms.map((r) => (
                  <div key={r.id} className="sticky top-0 z-10 border-b border-r border-border bg-card px-2 py-2 text-xs font-bold text-foreground">
                    {r.name}
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
                    {rooms.map((r) => (
                      <DroppableCell key={r.id} roomId={r.id} time={time} />
                    ))}
                  </div>
                ))}
              </div>

              {/* Appointment blocks, absolutely positioned over the grid (header row is one row tall) */}
              {rooms.map((r, roomIdx) => (
                <div
                  key={`overlay-${r.id}`}
                  className="pointer-events-none absolute"
                  style={{
                    left: TIME_COL_PX + roomIdx * ROOM_COL_PX,
                    top: ROW_HEIGHT_PX,
                    width: ROOM_COL_PX,
                    height: slots.length * ROW_HEIGHT_PX,
                  }}
                >
                  {appointments
                    .filter((a) => a.roomId === r.id)
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
