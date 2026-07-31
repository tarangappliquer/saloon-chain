import { useCallback, useReducer } from 'react';
import { api, ApiError } from '../../api/client';
import type { AvailableSlot, HoldResponse } from '../../api/types';

type Step = 'treatments' | 'date' | 'slot' | 'held' | 'confirmed';

interface State {
  step: Step;
  selectedTreatmentIds: number[];
  selectedDate: string | null;
  dates: string[];
  slots: AvailableSlot[];
  hold: HoldResponse | null;
  heldSlot: AvailableSlot | null;
  error: string | null;
  loading: boolean;
}

type Action =
  | { type: 'LOADING' }
  | { type: 'ERROR'; message: string }
  | { type: 'TOGGLE_TREATMENT'; id: number }
  | { type: 'DATES_LOADED'; dates: string[] }
  | { type: 'PICK_DATE'; date: string }
  | { type: 'SLOTS_LOADED'; slots: AvailableSlot[] }
  | { type: 'HELD'; hold: HoldResponse; slot: AvailableSlot }
  | { type: 'CONFIRMED' }
  | { type: 'RESET' };

const initialState: State = {
  step: 'treatments',
  selectedTreatmentIds: [],
  selectedDate: null,
  dates: [],
  slots: [],
  hold: null,
  heldSlot: null,
  error: null,
  loading: false,
};

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
      return { ...state, selectedDate: action.date, slots: [] };
    case 'SLOTS_LOADED':
      return { ...state, loading: false, slots: action.slots, step: 'slot' };
    case 'HELD':
      return { ...state, loading: false, hold: action.hold, heldSlot: action.slot, step: 'held' };
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

export function useBookingFlow(locationId: number | null) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadDates = useCallback(async () => {
    if (!locationId || state.selectedTreatmentIds.length === 0) return;
    dispatch({ type: 'LOADING' });
    try {
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + 13 * 86_400_000).toISOString().slice(0, 10);
      const dates = await api.get<string[]>(
        `/api/booking/available-dates?locationId=${locationId}&from=${from}&to=${to}`,
      );
      dispatch({ type: 'DATES_LOADED', dates });
    } catch (err) {
      dispatch({ type: 'ERROR', message: errorMessage(err, 'Failed to load available dates') });
    }
  }, [locationId, state.selectedTreatmentIds]);

  const pickDate = useCallback(
    async (date: string) => {
      if (!locationId) return;
      dispatch({ type: 'PICK_DATE', date });
      dispatch({ type: 'LOADING' });
      try {
        const ids = state.selectedTreatmentIds.join(',');
        const slots = await api.get<AvailableSlot[]>(
          `/api/booking/available-slots?locationId=${locationId}&treatmentIds=${ids}&date=${date}`,
        );
        dispatch({ type: 'SLOTS_LOADED', slots });
      } catch (err) {
        dispatch({ type: 'ERROR', message: errorMessage(err, 'Failed to load available slots') });
      }
    },
    [locationId, state.selectedTreatmentIds],
  );

  const selectSlot = useCallback(
    async (slot: AvailableSlot) => {
      if (!locationId) return;
      dispatch({ type: 'LOADING' });
      try {
        const hold = await api.post<HoldResponse>('/api/booking/hold', {
          locationId,
          roomId: slot.roomId,
          therapistId: slot.therapistId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          treatmentIds: state.selectedTreatmentIds,
        });
        dispatch({ type: 'HELD', hold, slot });
      } catch (err) {
        dispatch({ type: 'ERROR', message: errorMessage(err, 'That slot was just taken — pick another') });
      }
    },
    [locationId, state.selectedTreatmentIds],
  );

  const confirm = useCallback(async () => {
    if (!state.hold) return;
    dispatch({ type: 'LOADING' });
    try {
      await api.post(`/api/booking/${state.hold.bookingId}/confirm`);
      dispatch({ type: 'CONFIRMED' });
    } catch (err) {
      dispatch({ type: 'ERROR', message: errorMessage(err, 'Your hold expired — start again') });
    }
  }, [state.hold]);

  const cancelHold = useCallback(async () => {
    if (!state.hold) return;
    try {
      await api.del(`/api/booking/${state.hold.bookingId}`);
    } finally {
      dispatch({ type: 'RESET' });
    }
  }, [state.hold]);

  const toggleTreatment = useCallback((id: number) => dispatch({ type: 'TOGGLE_TREATMENT', id }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return { state, toggleTreatment, loadDates, pickDate, selectSlot, confirm, cancelHold, reset };
}
