import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@saloon/ui';
import { adminCatalogApi, ApiError, getFieldError } from '../api/client';
import { TimeInput } from './TimeInput';
import { defaultWeeklySchedule, type DaySchedule } from '../lib/schedule';
import { toApiTime, validateBreakTimes } from '../lib/time';

type Step = 'info' | 'schedule';

interface InfoForm {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  timeZoneId: string;
  openTime: string;
  closeTime: string;
  breakStartTime: string;
  breakEndTime: string;
}

function emptyInfoForm(): InfoForm {
  return {
    name: '',
    address: '',
    latitude: null,
    longitude: null,
    timeZoneId: 'UTC',
    openTime: '09:00',
    closeTime: '18:00',
    breakStartTime: '',
    breakEndTime: '',
  };
}

export function AddLocationWizard({ chainId, onClose, onCreated }: { chainId: number; onClose: () => void; onCreated: (locationId: number) => void }) {
  const [step, setStep] = useState<Step>('info');
  const [form, setForm] = useState<InfoForm>(emptyInfoForm());
  // Only the Operating Days toggle here -- each day's specific hours (with effective-from history)
  // can only be scheduled after the location exists, via DayScheduleModal ("Day Hours" on the
  // locations list). Until then every open day uses form.openTime/closeTime as its default.
  const [weeklySchedule, setWeeklySchedule] = useState<DaySchedule[]>(defaultWeeklySchedule());
  const [breakStartError, setBreakStartError] = useState<string | null>(null);
  const [breakEndError, setBreakEndError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleDay(bit: number) {
    setWeeklySchedule((sched) => sched.map((day) => (day.bit === bit ? { ...day, isOpen: !day.isOpen } : day)));
  }

  function validateInfoStep(): boolean {
    setError(null);

    const breakErrors = validateBreakTimes(form.breakStartTime, form.breakEndTime);
    setBreakStartError(breakErrors.startError);
    setBreakEndError(breakErrors.endError);
    if (breakErrors.startError || breakErrors.endError) {
      setError('Please fix the validation errors below.');
      return false;
    }
    if (!form.name.trim()) {
      setError('Location name is required.');
      return false;
    }
    if (form.latitude === null || form.longitude === null) {
      setError('Enter latitude and longitude before continuing.');
      return false;
    }
    return true;
  }

  function handleNext() {
    if (validateInfoStep()) setStep('schedule');
  }

  async function handleCreate() {
    setError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const workingDaysMask = weeklySchedule.filter((d) => d.isOpen).reduce((mask, d) => mask | d.bit, 0);

      const { data } = await adminCatalogApi.apiAdminCatalogLocationsPost({
        chainId,
        name: form.name,
        address: form.address || null,
        latitude: form.latitude!,
        longitude: form.longitude!,
        openTime: toApiTime(form.openTime)!,
        closeTime: toApiTime(form.closeTime)!,
        breakStartTime: toApiTime(form.breakStartTime),
        breakEndTime: toApiTime(form.breakEndTime),
        workingDaysMask,
        timeZoneId: form.timeZoneId,
      });

      onCreated((data as unknown as { id: number }).id);
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : 'Failed to create location');
      setStep('info');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
      <Card className="w-full max-w-2xl shadow-lift border-border bg-card max-h-[90vh] overflow-y-auto">
        <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Add New Location</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Step {step === 'info' ? '1' : '2'} of 2 — {step === 'info' ? 'Location Info & TimeZone' : 'Operating Days'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            ✕
          </Button>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {error}
            </div>
          )}

          {step === 'info' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                required
                label="Location Name"
                placeholder="Downtown Saloon Branch"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                error={getFieldError(submitError, 'name')}
              />
              <Input
                label="Address"
                placeholder="123 Main St, Suite 100"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                error={getFieldError(submitError, 'address')}
              />
              <Input
                required
                label="Time Zone ID"
                placeholder="UTC or America/New_York"
                value={form.timeZoneId}
                onChange={(e) => setForm({ ...form, timeZoneId: e.target.value })}
                error={getFieldError(submitError, 'timeZoneId')}
              />
              <TimeInput
                required
                label="Default Opening Time"
                value={form.openTime}
                maxTime={form.closeTime}
                onChange={(e) => setForm({ ...form, openTime: e.target.value })}
              />
              <TimeInput
                required
                label="Default Closing Time"
                value={form.closeTime}
                minTime={form.openTime}
                onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
                error={getFieldError(submitError, 'closeTime')}
              />
              <TimeInput
                label="Break Start Time (Optional)"
                value={form.breakStartTime}
                onChange={(e) => {
                  setForm({ ...form, breakStartTime: e.target.value });
                  setBreakStartError(null);
                }}
                error={breakStartError ?? undefined}
              />
              <TimeInput
                label="Break End Time (Optional)"
                value={form.breakEndTime}
                onChange={(e) => {
                  setForm({ ...form, breakEndTime: e.target.value });
                  setBreakEndError(null);
                }}
                error={breakEndError ?? undefined}
              />
              <Input
                required
                type="number"
                step="any"
                min={-90}
                max={90}
                label="Latitude"
                placeholder="e.g. 28.613900"
                value={form.latitude ?? ''}
                onChange={(e) => setForm({ ...form, latitude: e.target.value === '' ? null : Number(e.target.value) })}
                error={getFieldError(submitError, 'latitude')}
              />
              <Input
                required
                type="number"
                step="any"
                min={-180}
                max={180}
                label="Longitude"
                placeholder="e.g. 77.209000"
                value={form.longitude ?? ''}
                onChange={(e) => setForm({ ...form, longitude: e.target.value === '' ? null : Number(e.target.value) })}
                error={getFieldError(submitError, 'longitude')}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Every open day uses the default {form.openTime} - {form.closeTime} to start. Once this location is created, use its
                "Day Hours" action to schedule different hours for specific days (with an effective-from date).
              </p>
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30 font-semibold uppercase text-muted-foreground tracking-wider">
                      <th className="px-4 py-3">Day</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {weeklySchedule.map((day) => (
                      <tr key={day.key} className={day.isOpen ? 'bg-card' : 'bg-muted/10 opacity-70'}>
                        <td className="px-4 py-3 font-bold text-foreground">{day.label}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleDay(day.bit)}
                            className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                              day.isOpen
                                ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                : 'bg-muted text-muted-foreground border border-border'
                            }`}
                          >
                            {day.isOpen ? 'Open' : 'Closed'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border/50 pt-4">
            {step === 'info' ? (
              <>
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleNext} className="font-semibold">
                  Next: Operating Days →
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep('info')} disabled={submitting}>
                  ← Back
                </Button>
                <Button onClick={handleCreate} disabled={submitting} className="font-bold">
                  {submitting ? 'Creating...' : 'Create Location'}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
