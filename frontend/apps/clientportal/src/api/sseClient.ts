import { API_BASE } from './client';

// One EventSource lifecycle for every SSE subscription (profile stream, booking stream, ...): open,
// listen for the one event the caller wants, and hand back a cleanup that unsubscribes and closes.
// A function, not a class -- every call site listens for exactly one event on one stream, so a
// class with an `.on()` built to register several would be flexibility nobody uses.
export function subscribeToStream(url: string, eventName: string, handler: () => void): () => void {
  const source = new EventSource(url);
  source.addEventListener(eventName, handler);
  return () => {
    source.removeEventListener(eventName, handler);
    source.close();
  };
}

// Named, typed builders instead of hand-rolled template strings at each call site -- a wrong param
// type is a compile error here, not a silently-dead stream from a typo'd query key.
export function profileStreamUrl(userId: number): string {
  return `${API_BASE}/api/profile/stream?${new URLSearchParams({ userId: String(userId) })}`;
}

export function bookingStreamUrl(locationId: number, date?: string | null): string {
  const params = new URLSearchParams({ locationId: String(locationId) });
  if (date) params.set('date', date);
  return `${API_BASE}/api/booking/stream?${params}`;
}
