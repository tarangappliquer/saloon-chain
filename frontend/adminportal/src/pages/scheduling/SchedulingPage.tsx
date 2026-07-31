import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Chain, Location, Room, Roster, ShiftType, Therapist, TreatmentCategory } from '../../api/types';

const SHIFT_TYPES: ShiftType[] = ['Morning', 'Evening'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyShiftForm() {
  return { therapistId: '', shiftType: 'Morning' as ShiftType, startTime: '09:00', endTime: '13:30' };
}

function emptyRoomForm() {
  return { roomId: '', treatmentCategoryId: '', shiftType: 'Morning' as ShiftType };
}

export function SchedulingPage() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [date, setDate] = useState(today());

  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [categories, setCategories] = useState<TreatmentCategory[]>([]);
  const [roster, setRoster] = useState<Roster>({ therapistShifts: [], roomOpenings: [] });

  const [shiftForm, setShiftForm] = useState(emptyShiftForm());
  const [roomForm, setRoomForm] = useState(emptyRoomForm());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittingShift, setSubmittingShift] = useState(false);
  const [submittingRoom, setSubmittingRoom] = useState(false);

  useEffect(() => {
    api
      .get<Chain[]>('/api/admin/catalog/chains')
      .then((cs) => {
        setChains(cs);
        if (cs.length > 0) setChainId(cs[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load chains'));
    api.get<Therapist[]>('/api/admin/catalog/therapists').then(setTherapists).catch(() => {});
  }, []);

  useEffect(() => {
    if (chainId === null) return;
    api
      .get<Location[]>(`/api/admin/catalog/locations?chainId=${chainId}`)
      .then((locs) => {
        setLocations(locs);
        setLocationId(locs.length > 0 ? locs[0].id : null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load locations'));
    api
      .get<TreatmentCategory[]>(`/api/admin/catalog/treatment-categories?chainId=${chainId}`)
      .then(setCategories)
      .catch(() => {});
  }, [chainId]);

  useEffect(() => {
    if (locationId === null) return;
    api.get<Room[]>(`/api/admin/catalog/rooms?locationId=${locationId}`).then(setRooms).catch(() => {});
  }, [locationId]);

  async function loadRoster() {
    if (locationId === null) return;
    setLoading(true);
    setError(null);
    try {
      setRoster(await api.get<Roster>(`/api/admin/scheduling/roster?locationId=${locationId}&date=${date}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load roster');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, date]);

  async function handleAssignShift(e: FormEvent) {
    e.preventDefault();
    if (locationId === null || !shiftForm.therapistId) return;
    setError(null);
    setSubmittingShift(true);
    try {
      await api.post('/api/admin/scheduling/therapist-shifts', {
        locationId,
        therapistId: Number(shiftForm.therapistId),
        shiftType: shiftForm.shiftType,
        workDate: date,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
      });
      setShiftForm(emptyShiftForm());
      await loadRoster();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign shift');
    } finally {
      setSubmittingShift(false);
    }
  }

  async function handleRemoveShift(id: number) {
    setError(null);
    try {
      await api.del(`/api/admin/scheduling/therapist-shifts/${id}`);
      await loadRoster();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove shift');
    }
  }

  async function handleOpenRoom(e: FormEvent) {
    e.preventDefault();
    if (!roomForm.roomId || !roomForm.treatmentCategoryId) return;
    setError(null);
    setSubmittingRoom(true);
    try {
      await api.post('/api/admin/scheduling/room-openings', {
        roomId: Number(roomForm.roomId),
        treatmentCategoryId: Number(roomForm.treatmentCategoryId),
        shiftType: roomForm.shiftType,
        workDate: date,
      });
      setRoomForm(emptyRoomForm());
      await loadRoster();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to open room');
    } finally {
      setSubmittingRoom(false);
    }
  }

  async function handleCloseRoom(id: number) {
    setError(null);
    try {
      await api.del(`/api/admin/scheduling/room-openings/${id}`);
      await loadRoster();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to close room');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Scheduling</h1>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <label>
          Chain{' '}
          <select
            value={chainId ?? ''}
            onChange={(e) => setChainId(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
          >
            {chains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Location{' '}
          <select
            value={locationId ?? ''}
            onChange={(e) => setLocationId(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date{' '}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          <section>
            <h2 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">Therapist Shifts</h2>
            <form onSubmit={handleAssignShift} className="mb-3 flex flex-wrap gap-2">
              <select
                required
                value={shiftForm.therapistId}
                onChange={(e) => setShiftForm({ ...shiftForm, therapistId: e.target.value })}
                className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="" disabled>
                  Therapist
                </option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                value={shiftForm.shiftType}
                onChange={(e) => setShiftForm({ ...shiftForm, shiftType: e.target.value as ShiftType })}
                className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
              >
                {SHIFT_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                required
                type="time"
                value={shiftForm.startTime}
                onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
              />
              <input
                required
                type="time"
                value={shiftForm.endTime}
                onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
              />
              <button
                type="submit"
                disabled={submittingShift}
                className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-40"
              >
                Assign
              </button>
            </form>
            {roster.therapistShifts.length === 0 ? (
              <p className="text-gray-500">No therapists scheduled for this date.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {roster.therapistShifts.map((s) => (
                  <li key={s.id} className="flex items-center justify-between border-b border-gray-100 py-2 dark:border-gray-900">
                    <span>
                      {s.therapistName} &middot; {s.shiftType} ({s.startTime}-{s.endTime})
                    </span>
                    <button type="button" onClick={() => handleRemoveShift(s.id)} className="text-red-600 hover:underline">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">Room Openings</h2>
            <form onSubmit={handleOpenRoom} className="mb-3 flex flex-wrap gap-2">
              <select
                required
                value={roomForm.roomId}
                onChange={(e) => setRoomForm({ ...roomForm, roomId: e.target.value })}
                className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="" disabled>
                  Room
                </option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select
                required
                value={roomForm.treatmentCategoryId}
                onChange={(e) => setRoomForm({ ...roomForm, treatmentCategoryId: e.target.value })}
                className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="" disabled>
                  Treatment category
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={roomForm.shiftType}
                onChange={(e) => setRoomForm({ ...roomForm, shiftType: e.target.value as ShiftType })}
                className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
              >
                {SHIFT_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={submittingRoom}
                className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-40"
              >
                Open
              </button>
            </form>
            {roster.roomOpenings.length === 0 ? (
              <p className="text-gray-500">No rooms opened for this date.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {roster.roomOpenings.map((r) => (
                  <li key={r.id} className="flex items-center justify-between border-b border-gray-100 py-2 dark:border-gray-900">
                    <span>
                      {r.roomName} &middot; {r.categoryName} ({r.shiftType})
                    </span>
                    <button type="button" onClick={() => handleCloseRoom(r.id)} className="text-red-600 hover:underline">
                      Close
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
