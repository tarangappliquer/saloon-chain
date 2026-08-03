import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ApiError, bookingApi } from '../../api/client';
import type { AvailableSlot, HeldSlot, HoldResponse, MyBooking } from '../../api/types';

type Step = 'treatments' | 'date' | 'slot' | 'held' | 'confirmed';

interface State {
  step: Step;
  selectedTreatmentIds: number[];
  selectedDate: string | null;
  dates: string[];
  // Slots are fetched per treatment (one API call per treatment id), because each treatment
  // has its own duration — a single combined call would only return blocks sized for the sum of
  // all durations, which can't be picked independently per treatment.
  slotsByTreatment: Record<number, AvailableSlot[]>;
  // A hold is created the moment a slot is picked, so holds ARE the picks. One entry per
  // treatment; re-picking a treatment cancels its old hold and replaces it here.
  holds: HeldSlot[];
  error: string | null;
  loading: boolean;
}

type Action =
  | { type: 'LOADING' }
  | { type: 'ERROR'; message: string }
  | { type: 'TOGGLE_TREATMENT'; id: number }
  | { type: 'DATES_LOADED'; dates: string[] }
  | { type: 'PICK_DATE'; date: string }
  | { type: 'SLOTS_LOADED'; slotsByTreatment: Record<number, AvailableSlot[]> }
  | { type: 'HOLD_CREATED'; hold: HeldSlot }
  | { type: 'RESTORE'; selectedTreatmentIds: number[]; selectedDate: string; holds: HeldSlot[]; step: Step }
  | { type: 'CANCEL_HOLDS' }
  | { type: 'CONFIRMED' }
  | { type: 'RESET' };

const initialState: State = {
  step: 'treatments',
  selectedTreatmentIds: [],
  selectedDate: null,
  dates: [],
  slotsByTreatment: {},
  holds: [],
  error: null,
  loading: false,
};

function sameSlot(a: AvailableSlot, b: AvailableSlot) {
  return a.startTime === b.startTime && a.roomId === b.roomId && a.therapistId === b.therapistId;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOADING':
      return { ...state, loading: true, error: null };
    case 'ERROR':
      return { ...state, loading: false, error: action.message };
    case 'TOGGLE_TREATMENT': {
      const has = state.selectedTreatmentIds.includes(action.id);
      return {
        ...state,
        selectedTreatmentIds: has
          ? state.selectedTreatmentIds.filter((id) => id !== action.id)
          : [...state.selectedTreatmentIds, action.id],
      };
    }
    case 'DATES_LOADED':
      return { ...state, loading: false, dates: action.dates, step: 'date' };
    case 'PICK_DATE':
      // New date: throw away the old slots. Holds can't exist here (the date step precedes slot
      // picking), so nothing to cancel.
      return { ...state, selectedDate: action.date, slotsByTreatment: {}, holds: [] };
    case 'SLOTS_LOADED': {
      // On a refetch (SSE "slot-changed") keep holds intact — a hold the user just created will
      // have disappeared from the available list (the calculator excludes existing bookings), so
      // SlotPicker re-injects it from `holds` when rendering.
      return { ...state, loading: false, slotsByTreatment: action.slotsByTreatment, step: 'slot' };
    }
    case 'HOLD_CREATED': {
      const holds = [...state.holds.filter((h) => h.treatmentId !== action.hold.treatmentId), action.hold];
      const allCovered = state.selectedTreatmentIds.every((id) => holds.some((h) => h.treatmentId === id));
      return { ...state, loading: false, holds, step: allCovered ? 'held' : 'slot', error: null };
    }
    case 'RESTORE':
      return {
        ...state,
        selectedTreatmentIds: action.selectedTreatmentIds,
        selectedDate: action.selectedDate,
        holds: action.holds,
        step: action.step,
        loading: false,
        error: null,
      };
    case 'CANCEL_HOLDS':
      return { ...state, loading: false, holds: [], step: 'slot', error: null };
    case 'CONFIRMED':
      return { ...state, loading: false, step: 'confirmed' };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

// --- localStorage persistence -------------------------------------------------
// Holds live on the server (Held-status bookings with an expiry), but the bookingId + slot
// details + which treatment each maps to are session state. Persisting them lets a refresh
// restore the summary without making the user re-pick. The server is still the source of
// truth: on restore we re-validate via /mine that each hold is still 'Held' (not swept/expired).
const STORAGE_KEY = 'saloon_holds';

interface PersistedFlow {
  locationId: number;
  selectedTreatmentIds: number[];
  selectedDate: string;
  holds: HeldSlot[];
}

function loadPersisted(): PersistedFlow | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedFlow;
    if (!parsed.selectedDate || !Array.isArray(parsed.holds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersisted(p: PersistedFlow) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore quota / private-mode failures
  }
}

function clearPersisted() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function useBookingFlow(locationId: number | null) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // `state.loading` alone doesn't stop a double-click: it's only set via `dispatch`, which doesn't
  // take effect until the next render, so two clicks in the same tick (before React re-renders
  // with the disabled button) both slip through and fire duplicate requests. This ref is set
  // synchronously, before either the dispatch or the await, so the second call in the same tick
  // sees it immediately and bails.
  const inFlight = useRef(false);
  // Restore runs once per locationId, not on every render — otherwise the /mine validation
  // call would fire on every state change while the effect's deps settle.
  const restoredRef = useRef(false);

  const loadDates = useCallback(async () => {
    if (!locationId || state.selectedTreatmentIds.length === 0) return;
    dispatch({ type: 'LOADING' });
    try {
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + 13 * 86_400_000).toISOString().slice(0, 10);
      const { data } = await bookingApi.apiBookingAvailableDatesGet(locationId, from, to);
      dispatch({ type: 'DATES_LOADED', dates: data });
    } catch (err) {
      dispatch({ type: 'ERROR', message: errorMessage(err, 'Failed to load available dates') });
    }
  }, [locationId, state.selectedTreatmentIds]);

  const fetchSlotsByTreatment = useCallback(
    async (date: string, ids: number[]): Promise<Record<number, AvailableSlot[]>> => {
      if (!locationId || ids.length === 0) return {};
      const entries = await Promise.all(
        ids.map(async (id) => {
          const { data } = await bookingApi.apiBookingAvailableSlotsGet(locationId, String(id), date);
          return [id, data as unknown as AvailableSlot[]] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
    [locationId],
  );

  const pickDate = useCallback(
    async (date: string) => {
      if (!locationId) return;
      dispatch({ type: 'PICK_DATE', date });
      dispatch({ type: 'LOADING' });
      try {
        dispatch({ type: 'SLOTS_LOADED', slotsByTreatment: await fetchSlotsByTreatment(date, state.selectedTreatmentIds) });
      } catch (err) {
        dispatch({ type: 'ERROR', message: errorMessage(err, 'Failed to load available slots') });
      }
    },
    [fetchSlotsByTreatment, locationId, state.selectedTreatmentIds],
  );

  // SSE refetch path: reload slots for the current date without clearing holds (a hold just
  // created will drop out of the available list; SlotPicker re-injects it from `holds`).
  const reloadSlots = useCallback(async () => {
    if (!locationId || !state.selectedDate) return;
    dispatch({ type: 'LOADING' });
    try {
      dispatch({ type: 'SLOTS_LOADED', slotsByTreatment: await fetchSlotsByTreatment(state.selectedDate, state.selectedTreatmentIds) });
    } catch (err) {
      dispatch({ type: 'ERROR', message: errorMessage(err, 'Failed to load available slots') });
    }
  }, [fetchSlotsByTreatment, locationId, state.selectedDate, state.selectedTreatmentIds]);

  // Picking a slot immediately creates a temporary appointment (a Held booking). Re-picking the
  // same treatment cancels its prior hold first so only one live hold per treatment exists.
  const selectSlot = useCallback(
    async (treatmentId: number, slot: AvailableSlot) => {
      if (!locationId || inFlight.current) return;
      const existing = state.holds.find((h) => h.treatmentId === treatmentId);
      if (existing && sameSlot(existing.slot, slot)) return; // no-op: same slot re-clicked
      inFlight.current = true;
      dispatch({ type: 'LOADING' });
      try {
        if (existing) {
          await bookingApi.apiBookingIdDelete(existing.bookingId).catch(() => {
            // best-effort: a failed cancel of the old hold shouldn't block creating the new one
          });
        }
        const { data } = await bookingApi.apiBookingHoldPost({
          locationId,
          roomId: slot.roomId,
          therapistId: slot.therapistId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          treatmentIds: [treatmentId],
        });
        const hold = data as unknown as HoldResponse;
        const held: HeldSlot = { bookingId: hold.bookingId, expiresAt: hold.expiresAt, slot, treatmentId };
        const newHolds = [...state.holds.filter((h) => h.treatmentId !== treatmentId), held];
        if (state.selectedDate) {
          savePersisted({
            locationId,
            selectedTreatmentIds: state.selectedTreatmentIds,
            selectedDate: state.selectedDate,
            holds: newHolds,
          });
        }
        dispatch({ type: 'HOLD_CREATED', hold: held });
      } catch (err) {
        dispatch({ type: 'ERROR', message: errorMessage(err, 'That slot was just taken — pick another') });
      } finally {
        inFlight.current = false;
      }
    },
    [locationId, state.holds, state.selectedDate, state.selectedTreatmentIds],
  );

  const confirmAll = useCallback(async () => {
    if (state.holds.length === 0 || inFlight.current) return;
    inFlight.current = true;
    dispatch({ type: 'LOADING' });
    try {
      await Promise.all(state.holds.map((h) => bookingApi.apiBookingIdConfirmPost(h.bookingId)));
      clearPersisted();
      dispatch({ type: 'CONFIRMED' });
    } catch (err) {
      dispatch({ type: 'ERROR', message: errorMessage(err, 'A hold expired — start again') });
    } finally {
      inFlight.current = false;
    }
  }, [state.holds]);

  const cancelHolds = useCallback(async () => {
    if (state.holds.length === 0) return;
    try {
      await Promise.allSettled(state.holds.map((h) => bookingApi.apiBookingIdDelete(h.bookingId)));
    } finally {
      clearPersisted();
      dispatch({ type: 'CANCEL_HOLDS' });
    }
  }, [state.holds]);

  const toggleTreatment = useCallback((id: number) => dispatch({ type: 'TOGGLE_TREATMENT', id }), []);
  const reset = useCallback(() => {
    clearPersisted();
    dispatch({ type: 'RESET' });
  }, []);

  // Restore holds across a refresh: read what we persisted, drop any that are obviously expired,
  // then ask the server which are still 'Held' (the sweep may have expired them). If all
  // selected treatments still have a live hold, land on the summary; otherwise go back to slot
  // picking for the missing ones (reloading their slot grids).
  useEffect(() => {
    if (!locationId || restoredRef.current) return;
    restoredRef.current = true;
    const persisted = loadPersisted();
    if (!persisted || persisted.locationId !== locationId) return;

    (async () => {
      const now = Date.now();
      let valid = persisted.holds.filter((h) => new Date(h.expiresAt).getTime() > now);
      try {
        const { data } = await bookingApi.apiBookingMineGet();
        const heldIds = new Set(
          (data as unknown as MyBooking[]).filter((b) => b.status === 'Held').map((b) => b.id),
        );
        valid = valid.filter((h) => heldIds.has(h.bookingId));
      } catch {
        // server unreachable — trust the client-side expiry filter only
      }

      const allCovered =
        valid.length > 0 &&
        persisted.selectedTreatmentIds.every((id) => valid.some((h) => h.treatmentId === id));

      dispatch({
        type: 'RESTORE',
        selectedTreatmentIds: persisted.selectedTreatmentIds,
        selectedDate: persisted.selectedDate,
        holds: valid,
        step: allCovered ? 'held' : 'slot',
      });

      if (!allCovered) {
        try {
          const slots = await fetchSlotsByTreatment(persisted.selectedDate, persisted.selectedTreatmentIds);
          dispatch({ type: 'SLOTS_LOADED', slotsByTreatment: slots });
        } catch {
          // leave slot grids empty; user can re-pick a date
        }
      }

      if (valid.length > 0) {
        savePersisted({
          locationId,
          selectedTreatmentIds: persisted.selectedTreatmentIds,
          selectedDate: persisted.selectedDate,
          holds: valid,
        });
      } else {
        clearPersisted();
      }
    })();
  }, [locationId, fetchSlotsByTreatment]);

  return {
    state,
    toggleTreatment,
    loadDates,
    pickDate,
    reloadSlots,
    selectSlot,
    confirmAll,
    cancelHolds,
    reset,
  };
}