import { startTransition, useCallback, useEffect, useMemo, useOptimistic, useReducer, useRef } from 'react';
import { ApiError, bookingApi } from '../../api/client';
import type { AvailableSlot, BookingDetails, ScheduleResponse } from '../../api/types';

interface State {
  booking: BookingDetails | null;
  dates: string[];
  datesFetched: boolean;
  // Slots are fetched per treatment (one API call per treatment id), because each treatment has
  // its own duration -- a single combined call would only return blocks sized for the sum of all
  // durations, which can't be picked independently per treatment.
  slotsByTreatment: Record<number, AvailableSlot[]>;
  loading: boolean;
  error: string | null;
  // True until the initial GET /api/booking/{id} resolves (found or not). The wizard's routes
  // guard their own precondition off this, so a hard refresh mid-flow doesn't bounce the user
  // away before the fetch has had a chance to repopulate `booking`.
  restoring: boolean;
}

type Action =
  | { type: 'LOADING' }
  | { type: 'ERROR'; message: string }
  | { type: 'BOOKING_LOADED'; booking: BookingDetails }
  | { type: 'RESTORE_DONE' }
  | { type: 'DATES_LOADED'; dates: string[] }
  | { type: 'SLOTS_LOADED'; slotsByTreatment: Record<number, AvailableSlot[]> }
  | { type: 'LINE_SCHEDULED'; treatmentId: number; slot: AvailableSlot; expiresAt: string }
  | { type: 'TREATMENT_REMOVED'; treatmentId: number };

const initialState: State = {
  booking: null,
  dates: [],
  datesFetched: false,
  slotsByTreatment: {},
  loading: false,
  error: null,
  restoring: true,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOADING':
      return { ...state, loading: true, error: null };
    case 'ERROR':
      return { ...state, loading: false, error: action.message };
    case 'BOOKING_LOADED':
      return { ...state, loading: false, booking: action.booking };
    case 'RESTORE_DONE':
      return { ...state, restoring: false };
    case 'DATES_LOADED': {
      const merged = Array.from(new Set([...state.dates, ...action.dates])).sort();
      return { ...state, loading: false, dates: merged, datesFetched: true };
    }
    case 'SLOTS_LOADED':
      return { ...state, loading: false, slotsByTreatment: action.slotsByTreatment };
    case 'LINE_SCHEDULED': {
      if (!state.booking) return state;
      const treatments = state.booking.treatments.map((t) =>
        t.treatmentId === action.treatmentId
          ? {
              ...t,
              roomId: action.slot.roomId,
              therapistId: action.slot.therapistId,
              startTime: action.slot.startTime,
              endTime: action.slot.endTime,
              expiresAt: action.expiresAt,
            }
          : t,
      );
      return { ...state, loading: false, booking: { ...state.booking, treatments } };
    }
    case 'TREATMENT_REMOVED': {
      if (!state.booking) return state;
      const { [action.treatmentId]: _removed, ...slotsByTreatment } = state.slotsByTreatment;
      return {
        ...state,
        booking: { ...state.booking, treatments: state.booking.treatments.filter((t) => t.treatmentId !== action.treatmentId) },
        slotsByTreatment,
      };
    }
    default:
      return state;
  }
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

// The booking id lives in the route (see App.tsx), so this hook always re-fetches its state from
// the server (GET /api/booking/{id}) rather than restoring from localStorage -- a refresh just
// re-runs the same fetch against the same URL. Only used once a draft exists (ScheduleStep,
// SummaryStep); the initial treatment-selection screen has no booking id yet.
export function useBookingFlow(bookingId: number) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // `state.loading` alone doesn't stop a double-click: it's only set via `dispatch`, which doesn't
  // take effect until the next render, so two clicks in the same tick both slip through. This ref
  // is set synchronously, before either the dispatch or the await, so the second call in the same
  // tick sees it immediately and bails.
  const inFlight = useRef(false);
  const lastDatesReq = useRef<string>('');

  // Strikes a removed treatment line immediately instead of waiting for the DELETE to resolve --
  // reconciled against the real value once TREATMENT_REMOVED (or ERROR, on failure) dispatches.
  const [optimisticBooking, applyOptimisticRemoval] = useOptimistic(
    state.booking,
    (current, removedTreatmentId: number) =>
      current ? { ...current, treatments: current.treatments.filter((t) => t.treatmentId !== removedTreatmentId) } : current,
  );
  const effectiveState = useMemo(() => ({ ...state, booking: optimisticBooking }), [state, optimisticBooking]);

  const allCovered = useMemo(
    () =>
      optimisticBooking !== null &&
      optimisticBooking.treatments.length > 0 &&
      optimisticBooking.treatments.every((t) => t.startTime !== null),
    [optimisticBooking],
  );

  useEffect(() => {
    dispatch({ type: 'LOADING' });
    (async () => {
      try {
        const { data } = await bookingApi.apiBookingIdGet(bookingId);
        dispatch({ type: 'BOOKING_LOADED', booking: data as unknown as BookingDetails });
      } catch (err) {
        dispatch({ type: 'ERROR', message: errorMessage(err, 'Booking not found') });
      } finally {
        dispatch({ type: 'RESTORE_DONE' });
      }
    })();
  }, [bookingId]);

  const loadDates = useCallback(
    async (locationId: number, treatmentIds: number[], bookingId?: number, fromDate?: string, toDate?: string) => {
      const now = new Date();
      const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const defaultToDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90);
      const defaultTo = `${defaultToDate.getFullYear()}-${String(defaultToDate.getMonth() + 1).padStart(2, '0')}-${String(defaultToDate.getDate()).padStart(2, '0')}`;
      const from = fromDate || defaultFrom;
      const to = toDate || defaultTo;
      const tIdsStr = treatmentIds.length > 0 ? treatmentIds.join(',') : undefined;

      const reqKey = `${locationId}:${tIdsStr}:${from}:${to}:${bookingId}`;
      if (lastDatesReq.current === reqKey && state.datesFetched) return;
      lastDatesReq.current = reqKey;

      dispatch({ type: 'LOADING' });
      try {
        const { data } = await bookingApi.apiBookingAvailableDatesGet(locationId, from, to, tIdsStr, bookingId);
        dispatch({ type: 'DATES_LOADED', dates: data });
      } catch (err) {
        lastDatesReq.current = '';
        dispatch({ type: 'ERROR', message: errorMessage(err, 'Failed to load available dates') });
      }
    },
    [state.datesFetched],
  );

  const loadSlots = useCallback(async (locationId: number, date: string, treatmentIds: number[]) => {
    if (treatmentIds.length === 0) return;
    dispatch({ type: 'LOADING' });
    try {
      const entries = await Promise.all(
        treatmentIds.map(async (id) => {
          const { data } = await bookingApi.apiBookingAvailableSlotsGet(locationId, String(id), date, bookingId);
          return [id, data as unknown as AvailableSlot[]] as const;
        }),
      );
      dispatch({ type: 'SLOTS_LOADED', slotsByTreatment: Object.fromEntries(entries) });
    } catch (err) {
      dispatch({ type: 'ERROR', message: errorMessage(err, 'Failed to load available slots') });
    }
  }, [bookingId]);

  const selectSlot = useCallback(
    async (treatmentId: number, slot: AvailableSlot) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const { data } = await bookingApi.apiBookingIdTreatmentsTreatmentIdSchedulePut(bookingId, treatmentId, {
          roomId: slot.roomId,
          therapistId: slot.therapistId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
        const { expiresAt } = data as unknown as ScheduleResponse;
        dispatch({ type: 'LINE_SCHEDULED', treatmentId, slot, expiresAt });
      } catch (err) {
        dispatch({ type: 'ERROR', message: errorMessage(err, 'That slot was just taken — pick another') });
      } finally {
        inFlight.current = false;
      }
    },
    [bookingId],
  );

  // Adding a treatment mid-flow re-fetches the whole booking rather than fabricating the new
  // line locally -- simplest way to pick up its name/price/sequence exactly as the server assigned
  // them, and this path isn't hot enough to be worth optimizing away the extra round trip.
  const addTreatment = useCallback(
    async (treatmentId: number) => {
      dispatch({ type: 'LOADING' });
      try {
        await bookingApi.apiBookingIdTreatmentsPost(bookingId, { treatmentId });
        const { data } = await bookingApi.apiBookingIdGet(bookingId);
        dispatch({ type: 'BOOKING_LOADED', booking: data as unknown as BookingDetails });
      } catch (err) {
        dispatch({ type: 'ERROR', message: errorMessage(err, 'Failed to add treatment') });
      }
    },
    [bookingId],
  );

  const removeTreatment = useCallback(
    (treatmentId: number) => {
      startTransition(async () => {
        applyOptimisticRemoval(treatmentId);
        try {
          await bookingApi.apiBookingIdTreatmentsTreatmentIdDelete(bookingId, treatmentId);
          dispatch({ type: 'TREATMENT_REMOVED', treatmentId });
        } catch (err) {
          dispatch({ type: 'ERROR', message: errorMessage(err, 'Failed to remove treatment') });
        }
      });
    },
    [bookingId, applyOptimisticRemoval],
  );

  const confirmAll = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    dispatch({ type: 'LOADING' });
    try {
      await bookingApi.apiBookingIdConfirmPost(bookingId);
      return true;
    } catch (err) {
      dispatch({ type: 'ERROR', message: errorMessage(err, 'A hold expired — start again') });
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [bookingId]);

  return { state: effectiveState, allCovered, loadDates, loadSlots, selectSlot, addTreatment, removeTreatment, confirmAll };
}
