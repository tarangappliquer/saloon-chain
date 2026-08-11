import { useEffect, useState, type FormEvent } from 'react';
import Select, { type MultiValue } from 'react-select';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@saloon/ui';
import { adminSchedulingApi, schedulingApi, ApiError } from '../api/client';
import { DateInput } from './DateInput';
import type { BlockTypeDto } from '@saloon/api-client';
import type { BlockedSlot } from '../api/types';
import { type SelectOption, selectClassNames } from './reactSelectStyles';

interface EditBlockSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  chainId: number | null;
  locationId: number | null;
  roomId: number;
  roomName?: string;
  workDate: string;
  startTime: string;
  maxMinutes?: number;
  existingBlock?: BlockedSlot | null;
  therapists?: { id: number; name: string }[];
}

const DURATION_OPTIONS = [
  { label: '15 Minutes', value: 15 },
  { label: '30 Minutes', value: 30 },
  { label: '45 Minutes', value: 45 },
  { label: '60 Minutes (1 Hour)', value: 60 },
  { label: '90 Minutes (1.5 Hours)', value: 90 },
  { label: '120 Minutes (2 Hours)', value: 120 },
];

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60).toString().padStart(2, '0');
  const mm = (total % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function computeMinutesDiff(startStr: string, endStr: string): number {
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  return Math.max(15, (eh * 60 + em) - (sh * 60 + sm));
}

function computeRecurringDates(
  startDateStr: string,
  frequency: 'never' | 'daily' | 'weekly' | 'monthly' | 'custom',
  customIntervalDays: number,
  endsType: 'never' | 'date' | 'count',
  endDateStr: string,
  occurrencesCount: number,
): string[] {
  if (frequency === 'never') return [startDateStr];

  const dates: string[] = [];
  const maxLimit = endsType === 'count' ? Math.min(100, Math.max(1, occurrencesCount)) : 30;
  const current = new Date(startDateStr);

  while (dates.length < maxLimit) {
    const dStr = current.toISOString().slice(0, 10);
    if (endsType === 'date' && endDateStr && dStr > endDateStr) break;

    dates.push(dStr);

    if (frequency === 'daily') {
      current.setDate(current.getDate() + 1);
    } else if (frequency === 'weekly') {
      current.setDate(current.getDate() + 7);
    } else if (frequency === 'monthly') {
      current.setMonth(current.getMonth() + 1);
    } else if (frequency === 'custom') {
      current.setDate(current.getDate() + Math.max(1, customIntervalDays));
    }
  }

  return dates;
}

export function EditBlockSlotModal({
  isOpen,
  onClose,
  onSuccess,
  chainId,
  locationId,
  roomId,
  roomName,
  workDate,
  startTime,
  maxMinutes = 480,
  existingBlock,
  therapists = [],
}: EditBlockSlotModalProps) {
  const [blockTypes, setBlockTypes] = useState<BlockTypeDto[]>([]);
  const [selectedBlockTypeId, setSelectedBlockTypeId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [selectedTherapistIds, setSelectedTherapistIds] = useState<number[]>([]);

  // Recurrence state
  const [frequency, setFrequency] = useState<'never' | 'daily' | 'weekly' | 'monthly' | 'custom'>('never');
  const [customIntervalDays, setCustomIntervalDays] = useState(1);
  const [endsType, setEndsType] = useState<'never' | 'date' | 'count'>('never');
  const [endDate, setEndDate] = useState('');
  const [occurrencesCount, setOccurrencesCount] = useState(5);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminSchedulingApi
      .apiAdminSchedulingBlockTypesGet(chainId ?? undefined, locationId ?? undefined)
      .then(({ data }) => setBlockTypes(data.filter((b) => b.isActive)))
      .catch(() => setBlockTypes([]));
  }, [chainId, locationId]);

  useEffect(() => {
    if (existingBlock) {
      setReason(existingBlock.reason || '');
      setSelectedBlockTypeId(existingBlock.blockTypeId ?? null);
      const computedMins = computeMinutesDiff(existingBlock.startTime.slice(0, 5), existingBlock.endTime.slice(0, 5));
      setDurationMinutes(computedMins);
    } else {
      setSelectedBlockTypeId(null);
      setReason('');
      setDurationMinutes(Math.min(30, maxMinutes));
    }
    setFrequency('never');
    setEndsType('never');
    setError(null);
  }, [existingBlock, maxMinutes]);

  if (!isOpen) return null;

  function handleSelectBlockType(typeIdStr: string) {
    const typeId = typeIdStr ? Number(typeIdStr) : null;
    setSelectedBlockTypeId(typeId);
    if (typeId) {
      const bt = blockTypes.find((b) => b.id === typeId);
      if (bt) {
        setReason(bt.name);
        setDurationMinutes(Math.min(Number(bt.defaultDurationMinutes), maxMinutes));
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason or select a Block Type.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const endTime = addMinutesToTime(startTime, durationMinutes);

      if (existingBlock) {
        // Update existing block
        await schedulingApi.apiAdminSchedulingBlockedSlotsIdPut(Number(existingBlock.id), {
          startTime,
          endTime,
          reason: reason.trim(),
          blockTypeId: selectedBlockTypeId ?? undefined,
        });
      } else {
        // Create new block slot (with optional recurrence)
        const targetDates = computeRecurringDates(
          workDate,
          frequency,
          customIntervalDays,
          endsType,
          endDate,
          occurrencesCount,
        );

        for (const dStr of targetDates) {
          await schedulingApi.apiAdminSchedulingBlockedSlotsPost({
            roomId,
            workDate: dStr,
            startTime,
            endTime,
            reason: reason.trim(),
            blockTypeId: selectedBlockTypeId ?? undefined,
          });
        }
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save block slot');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnblock() {
    if (!existingBlock) return;
    setError(null);
    setDeleting(true);
    try {
      await schedulingApi.apiAdminSchedulingBlockedSlotsIdDelete(existingBlock.id);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove block slot');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <Card className="w-full max-w-lg shadow-2xl border-primary/30 my-8">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>
            {existingBlock ? `Edit Blocked Slot #${existingBlock.id}` : `Block Time Slot (${roomName || `Room #${roomId}`})`}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Date: <span className="font-semibold text-foreground">{workDate}</span> &bull; Starts at:{' '}
            <span className="font-semibold text-foreground">{startTime}</span>
          </p>
        </CardHeader>

        <CardContent className="pt-6 space-y-4">
          {error && <div className="rounded-xl bg-destructive/15 border border-destructive/30 p-3 text-xs font-semibold text-destructive">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 1. Block Type Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Block Type Category</label>
              <select
                value={selectedBlockTypeId ?? ''}
                onChange={(e) => handleSelectBlockType(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
              >
                <option value="">Custom Reason / Manual Block</option>
                {blockTypes.map((b) => (
                  <option key={String(b.id)} value={Number(b.id)}>
                    {b.name} ({b.isPaid ? 'Paid 💰' : 'Unpaid ⏸️'} &bull; {Number(b.defaultDurationMinutes)} mins)
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Reason Input */}
            <Input
              required
              label="Block Description / Reason"
              placeholder="e.g. Lunch Break, Staff Meeting"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            {/* 3. Duration Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Time Duration (Minutes)</span>
                <span className="text-[11px] text-muted-foreground font-normal">Max available: {maxMinutes} min</span>
              </label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value} disabled={d.value > maxMinutes && !existingBlock}>
                    {d.label} {d.value > maxMinutes && !existingBlock ? '(Exceeds free slot)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Applicable Team Member */}
            {therapists.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Applicable Team Member</label>
                <Select
                  isMulti
                  value={therapists
                    .filter((t) => selectedTherapistIds.includes(t.id))
                    .map((t) => ({ value: String(t.id), label: t.name }))}
                  onChange={(picked: MultiValue<SelectOption>) =>
                    setSelectedTherapistIds(picked.map((o) => Number(o.value)))
                  }
                  options={therapists.map((t) => ({ value: String(t.id), label: t.name }))}
                  placeholder="All Staff / Room Default"
                  unstyled
                  classNames={selectClassNames('rounded-xl border border-input bg-background px-3 py-2 text-xs min-h-9')}
                />
              </div>
            )}

            {/* 5. Recurrence Frequency (Only for new block slots) */}
            {!existingBlock && (
              <>
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-semibold text-foreground">Recurrence Frequency</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as any)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
                  >
                    <option value="never">Don't repeat</option>
                    <option value="daily">Every day</option>
                    <option value="weekly">Every week</option>
                    <option value="monthly">Every month</option>
                    <option value="custom">Custom interval</option>
                  </select>
                </div>

                {frequency === 'custom' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Repeat Every (Days)</label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={customIntervalDays}
                      onChange={(e) => setCustomIntervalDays(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                )}

                {/* 6. Ends Condition */}
                {frequency !== 'never' && (
                  <div className="space-y-3 rounded-xl border border-border bg-accent/30 p-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Recurrence Ends</label>
                      <select
                        value={endsType}
                        onChange={(e) => setEndsType(e.target.value as any)}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
                      >
                        <option value="never">Never (Up to 30 occurrences)</option>
                        <option value="date">On specific date</option>
                        <option value="count">After number of occurrences</option>
                      </select>
                    </div>

                    {endsType === 'date' && (
                      <DateInput
                        label="End Date"
                        value={endDate || workDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    )}

                    {endsType === 'count' && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground">Number of Occurrences</label>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={occurrencesCount}
                          onChange={(e) => setOccurrencesCount(Math.max(1, Number(e.target.value)))}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-border/60">
              {existingBlock ? (
                <Button type="button" variant="danger" disabled={deleting || submitting} onClick={handleUnblock}>
                  {deleting ? 'Removing...' : 'Unblock Slot'}
                </Button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2.5">
                <Button type="button" variant="outline" onClick={onClose} disabled={submitting || deleting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || deleting} className="font-semibold">
                  {submitting ? 'Saving...' : existingBlock ? 'Update Block Slot' : 'Save Block Slot'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
