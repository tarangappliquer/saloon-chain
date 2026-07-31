import { useEffect } from 'react';
import { API_BASE } from '../../api/client';

// Anonymous, unauthenticated: the event carries no data beyond "refetch this location+date".
export function useAvailabilityStream(locationId: number | null, date: string | null, onChange: () => void) {
  useEffect(() => {
    if (!locationId || !date) return;
    const source = new EventSource(`${API_BASE}/api/booking/stream?locationId=${locationId}&date=${date}`);
    source.addEventListener('slot-changed', onChange);
    return () => source.close();
  }, [locationId, date, onChange]);
}
