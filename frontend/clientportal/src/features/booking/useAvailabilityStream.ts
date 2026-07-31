import { useEffect, useRef } from 'react';
import { API_BASE } from '../../api/client';

// Anonymous, unauthenticated: the event carries no data beyond "refetch this location+date".
export function useAvailabilityStream(locationId: number | null, date: string | null, onChange: () => void) {
  // Callers typically pass a fresh closure every render (useBookingFlow returns a new object each
  // time, so anything derived from it is a new identity too). Keeping onChange out of the effect's
  // deps -- reading it via a ref instead -- means the EventSource only reconnects when the
  // location/date actually changes, not on every unrelated re-render (including the re-render
  // triggered by the 'slot-changed' event this same connection just delivered).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!locationId || !date) return;
    const source = new EventSource(`${API_BASE}/api/booking/stream?locationId=${locationId}&date=${date}`);
    const handler = () => onChangeRef.current();
    source.addEventListener('slot-changed', handler);
    return () => source.close();
  }, [locationId, date]);
}
