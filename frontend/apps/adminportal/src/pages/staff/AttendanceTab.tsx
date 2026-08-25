import { useEffect, useEffectEvent, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, FilterSelect, LoadingFallback, showConfirmSwal } from '@saloon/ui';
import { adminCatalogApi, adminStaffApi, ApiError } from '../../api/client';
import type { Location } from '../../api/types';
import { DateInput } from '../../components/DateInput';
import { TimeInput } from '../../components/TimeInput';

// Local shape for StaffAttendanceDto -- same workaround BookingsPage/InventoryPage use for
// generated DTOs whose id fields come back typed as the client's generic id alias instead of
// `number`, which breaks every plain Record<number, ...> lookup below.
interface StaffAttendanceRow {
  userId: number;
  staffName: string;
  staffEmail: string;
  staffRole: string;
  arrivalTime: string | null;
  leftTime: string | null;
}

export function AttendanceTab() {
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [workDate, setWorkDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [attendanceList, setAttendanceList] = useState<StaffAttendanceRow[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [arrivalTimeInputs, setArrivalTimeInputs] = useState<Record<number, string>>({});
  const [leftTimeInputs, setLeftTimeInputs] = useState<Record<number, string>>({});
  const [loggingUserId, setLoggingUserId] = useState<number | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [bulkLogging, setBulkLogging] = useState(false);

  async function loadLocations() {
    try {
      // apiAdminCatalogLocationsGet requires a chainId -- calling it bare throws client-side
      // (RequiredError) and was silently swallowed below, leaving `locations` empty forever for
      // RootSuperAdmin/SuperAdmin/Admin (no user.locationId to fall back on), so the whole
      // attendance tab looked like "no staff found" with no way to pick a location.
      const { data: chains } = await adminCatalogApi.apiAdminCatalogChainsGet();
      if (chains.length === 0) return;
      const { data } = await adminCatalogApi.apiAdminCatalogLocationsGet(Number(chains[0].id));
      const locs = data as unknown as Location[];
      setLocations(locs);
      if (!selectedLocationId && locs.length > 0) {
        setSelectedLocationId(locs[0].id);
      }
    } catch {
      // Ignore
    }
  }

  async function loadAttendance() {
    if (!selectedLocationId) return;
    setLoadingAttendance(true);
    setError(null);
    try {
      const { data } = await adminStaffApi.apiAdminStaffAttendanceGet(selectedLocationId, workDate);
      const rows = data as unknown as StaffAttendanceRow[];
      setAttendanceList(rows);

      // Initialize inputs with current time string as default for quick logging
      const nowTime = new Date().toTimeString().slice(0, 5);
      const arrivalMap: Record<number, string> = {};
      const leftMap: Record<number, string> = {};
      rows.forEach((item) => {
        arrivalMap[item.userId] = item.arrivalTime || nowTime;
        leftMap[item.userId] = item.leftTime || nowTime;
      });
      setArrivalTimeInputs(arrivalMap);
      setLeftTimeInputs(leftMap);
      setSelectedUserIds(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load staff attendance roster');
    } finally {
      setLoadingAttendance(false);
    }
  }

  const initialize = useEffectEvent(() => {
    loadLocations();
  });

  useEffect(() => {
    initialize();
  }, []);

  const handleLoadAttendance = useEffectEvent(() => {
    if (selectedLocationId) loadAttendance();
  });

  useEffect(() => {
    handleLoadAttendance();
  }, [selectedLocationId, workDate]);

  // Shared by the single-row and bulk paths -- no confirm, no loading-state toggling, just the
  // write itself, each of that row's own currently-set time-input value.
  async function logAttendanceRaw(userId: number, type: 'arrival' | 'left') {
    await adminStaffApi.apiAdminStaffAttendancePost({
      userId,
      locationId: selectedLocationId!,
      workDate,
      arrivalTime: type === 'arrival' ? arrivalTimeInputs[userId] : null,
      leftTime: type === 'left' ? leftTimeInputs[userId] : null,
    });
  }

  async function logAttendance(userId: number, type: 'arrival' | 'left') {
    if (!selectedLocationId) return;
    // Backend rejects a second write once set (see sp_Staff_LogAttendance), so a mis-click here is
    // permanent -- confirm before submitting rather than after.
    const confirmed = await showConfirmSwal({
      title: type === 'arrival' ? 'Log arrival time?' : 'Log departure time?',
      text: 'This cannot be changed once saved.',
      confirmButtonText: 'Log it',
    });
    if (!confirmed) return;
    setError(null);
    setLoggingUserId(userId);
    try {
      await logAttendanceRaw(userId, type);
      await loadAttendance();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to log attendance timestamp');
    } finally {
      setLoggingUserId(null);
    }
  }

  function toggleSelected(userId: number) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  // A row is selectable for a given action only while that action is still open on it (can't
  // bulk-log arrival for someone who already arrived, or departure for someone who hasn't).
  const arrivalEligible = attendanceList.filter((i) => !i.arrivalTime);
  const leftEligible = attendanceList.filter((i) => i.arrivalTime && !i.leftTime);
  const selectedArrivalEligible = arrivalEligible.filter((i) => selectedUserIds.has(i.userId));
  const selectedLeftEligible = leftEligible.filter((i) => selectedUserIds.has(i.userId));
  // Rows with at least one open action -- what "select all" and the per-row checkbox apply to.
  const selectableUserIds = attendanceList.filter((i) => !i.leftTime).map((i) => i.userId);

  async function bulkLogAttendance(type: 'arrival' | 'left') {
    const eligible = type === 'arrival' ? selectedArrivalEligible : selectedLeftEligible;
    if (eligible.length === 0) return;
    const confirmed = await showConfirmSwal({
      title: type === 'arrival' ? `Log arrival for ${eligible.length} staff member(s)?` : `Log departure for ${eligible.length} staff member(s)?`,
      text: 'This cannot be changed once saved. Each person is logged at their own time shown in the row.',
      confirmButtonText: 'Log it',
    });
    if (!confirmed) return;
    setError(null);
    setBulkLogging(true);
    try {
      await Promise.all(eligible.map((item) => logAttendanceRaw(item.userId, type)));
      await loadAttendance();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to log attendance for some staff members');
    } finally {
      setBulkLogging(false);
    }
  }

  return (
    <>
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-semibold text-destructive">
          {error}
        </div>
      )}

      <Card className="shadow-lg border-primary/20">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Daily Staff Roster Attendance</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Record staff arrival & departure timestamps. <strong className="text-foreground">Logged records are immutable and locked once set.</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {locations.length > 0 && (
                <FilterSelect
                  value={selectedLocationId ?? ''}
                  onChange={(e) => setSelectedLocationId(Number(e.target.value))}
                  options={locations.map((loc) => ({ value: String(loc.id), label: `📍 ${loc.name}` }))}
                  className="w-48"
                />
              )}

              <DateInput value={workDate} onChange={(e) => setWorkDate(e.target.value)} maxDate={new Date()} className="w-40" />
            </div>
          </div>
        </CardHeader>

        {selectedUserIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border/50 bg-accent/30 px-6 py-3">
            <span className="text-xs font-bold text-foreground">{selectedUserIds.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLogging || selectedArrivalEligible.length === 0}
              onClick={() => bulkLogAttendance('arrival')}
              className="text-xs font-bold"
            >
              {bulkLogging ? 'Logging...' : `Log Arrival (${selectedArrivalEligible.length})`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkLogging || selectedLeftEligible.length === 0}
              onClick={() => bulkLogAttendance('left')}
              className="text-xs font-bold"
            >
              {bulkLogging ? 'Logging...' : `Log Departure (${selectedLeftEligible.length})`}
            </Button>
            <button type="button" onClick={() => setSelectedUserIds(new Set())} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              Clear selection
            </button>
          </div>
        )}

        {loadingAttendance ? (
          <CardContent className="py-12">
            <LoadingFallback />
          </CardContent>
        ) : attendanceList.length === 0 ? (
          <CardContent className="py-12 text-center text-xs text-muted-foreground font-medium">
            No staff members found for the selected location.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground font-bold uppercase tracking-wider">
                  <th className="px-6 py-3.5 w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded-sm border-input text-primary focus:ring-primary cursor-pointer"
                      checked={selectableUserIds.length > 0 && selectableUserIds.every((id) => selectedUserIds.has(id))}
                      onChange={(e) => setSelectedUserIds(e.target.checked ? new Set(selectableUserIds) : new Set())}
                      disabled={selectableUserIds.length === 0}
                    />
                  </th>
                  <th className="px-6 py-3.5">Staff Member</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Arrival Time</th>
                  <th className="px-6 py-3.5">Left / Departure Time</th>
                  <th className="px-6 py-3.5 text-center">Availability Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {attendanceList.map((item) => (
                  <AttendanceRow
                    key={item.userId}
                    item={item}
                    arrivalInput={arrivalTimeInputs[item.userId] || ''}
                    leftInput={leftTimeInputs[item.userId] || ''}
                    isSaving={loggingUserId === item.userId}
                    selected={selectedUserIds.has(item.userId)}
                    onToggleSelected={() => toggleSelected(item.userId)}
                    onArrivalInputChange={(value) => setArrivalTimeInputs((prev) => ({ ...prev, [item.userId]: value }))}
                    onLeftInputChange={(value) => setLeftTimeInputs((prev) => ({ ...prev, [item.userId]: value }))}
                    onLog={(type) => logAttendance(item.userId, type)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

interface AttendanceRowProps {
  item: StaffAttendanceRow;
  arrivalInput: string;
  leftInput: string;
  isSaving: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onArrivalInputChange: (value: string) => void;
  onLeftInputChange: (value: string) => void;
  onLog: (type: 'arrival' | 'left') => void;
}

function AttendanceRow({ item, arrivalInput, leftInput, isSaving, selected, onToggleSelected, onArrivalInputChange, onLeftInputChange, onLog }: AttendanceRowProps) {
  const isArrived = !!item.arrivalTime;
  const isLeft = !!item.leftTime;

  return (
    <tr className="hover:bg-accent/30 transition">
      <td className="px-6 py-4">
        <input
          type="checkbox"
          className="h-4 w-4 rounded-sm border-input text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          checked={selected}
          onChange={onToggleSelected}
          disabled={isLeft}
        />
      </td>
      <td className="px-6 py-4 font-bold text-foreground">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center justify-center font-extrabold text-xs shrink-0">
            {item.staffName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <div>{item.staffName}</div>
            <div className="text-[11px] text-muted-foreground font-normal">{item.staffEmail}</div>
          </div>
        </div>
      </td>

      <td className="px-6 py-4">
        <span className="rounded-full bg-accent/60 border border-border px-2.5 py-1 text-xs font-semibold text-foreground">{item.staffRole}</span>
      </td>

      {/* Arrival Time Column */}
      <td className="px-6 py-4">
        {isArrived ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-3 py-1 text-xs font-extrabold text-emerald-800 dark:text-emerald-200">
            🔒 {item.arrivalTime?.slice(0, 5)} (Arrived)
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <TimeInput value={arrivalInput} onChange={(e) => onArrivalInputChange(e.target.value)} className="w-28 text-xs" />
            <Button size="sm" variant="outline" disabled={isSaving} onClick={() => onLog('arrival')} className="text-xs font-bold shrink-0">
              {isSaving ? 'Logging...' : 'Log Arrival'}
            </Button>
          </div>
        )}
      </td>

      {/* Departure Time Column */}
      <td className="px-6 py-4">
        {isLeft ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/20 px-3 py-1 text-xs font-extrabold text-violet-800 dark:text-violet-200">
            🔒 {item.leftTime?.slice(0, 5)} (Left)
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <TimeInput value={leftInput} onChange={(e) => onLeftInputChange(e.target.value)} disabled={!isArrived} className="w-28 text-xs" />
            <Button size="sm" variant="outline" disabled={!isArrived || isSaving} onClick={() => onLog('left')} className="text-xs font-bold shrink-0">
              {isSaving ? 'Logging...' : 'Log Departure'}
            </Button>
          </div>
        )}
      </td>

      {/* Availability Status */}
      <td className="px-6 py-4 text-center">
        {isLeft ? (
          <span className="rounded-full bg-gray-500/20 border border-gray-500/30 px-2.5 py-1 text-xs font-bold text-gray-700 dark:text-gray-300">Off Duty</span>
        ) : isArrived ? (
          <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-200">
            🟢 On Duty / Present
          </span>
        ) : (
          <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 text-xs font-bold text-amber-800 dark:text-amber-200">
            ⏳ Not Arrived Yet
          </span>
        )}
      </td>
    </tr>
  );
}
