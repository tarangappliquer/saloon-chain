import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@saloon/ui';
import { adminCatalogApi, adminCustomersApi, bookingApi, paymentApi, ApiError } from '../api/client';
import type { CustomerSummary, Treatment } from '../api/types';

type PaymentProviderType = 'Cash' | 'InHouse';

interface AddAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  locationId: number | null;
  roomId: number;
  roomName?: string;
  workDate: string;
  startTime: string; // 'HH:mm'
  therapists: { id: number; name: string }[];
}

// Backend stores/compares StartTime/EndTime as venue-local wall-clock (see BookingRepository.cs),
// so these must NOT go through toISOString() -- that converts through UTC and shifts the wall time
// by the browser's timezone offset, causing the schedule call to collide with a different slot than
// the one shown as available (surfaces as a spurious "Slot no longer available").
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocalWallIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toIsoDateTime(workDate: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${workDate}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return toLocalWallIso(d);
}

function addMinutesIso(iso: string, minutes: number): string {
  return toLocalWallIso(new Date(new Date(iso).getTime() + minutes * 60_000));
}

type Step = 'customer' | 'booking' | 'payment';

export function AddAppointmentModal({
  isOpen,
  onClose,
  onSuccess,
  locationId,
  roomId,
  roomName,
  workDate,
  startTime,
  therapists,
}: AddAppointmentModalProps) {
  const [step, setStep] = useState<Step>('customer');

  // Step 1: the booking flow only starts once a customer is picked or created -- this is the
  // resolved customer the rest of the flow books against, distinct from search/new-walk-in inputs.
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [customerMode, setCustomerMode] = useState<'search' | 'new'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedResult, setPickedResult] = useState<CustomerSummary | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [resolvingCustomer, setResolvingCustomer] = useState(false);

  // Step 2
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [treatmentId, setTreatmentId] = useState<number | ''>('');
  const [therapistId, setTherapistId] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);

  // Step 3: the slot is claimed (5-minute hold) once step 2's Continue succeeds -- bookingId is
  // hoisted here so the payment step reuses the same draft instead of re-drafting.
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<PaymentProviderType>('Cash');
  const [tip, setTip] = useState('0');
  const [amountTendered, setAmountTendered] = useState('');
  const [paying, setPaying] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep('customer');
    setCustomer(null);
    setCustomerMode('search');
    setSearchQuery('');
    setSearchResults([]);
    setPickedResult(null);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setTreatmentId('');
    setTherapistId('');
    setBookingId(null);
    setPaymentProvider('Cash');
    setTip('0');
    setAmountTendered('');
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || locationId === null) return;
    adminCatalogApi
      .apiAdminCatalogTreatmentsGet(locationId)
      .then(({ data }) => setTreatments((data as unknown as Treatment[]).filter((t) => t.price !== null)))
      .catch(() => setTreatments([]));
  }, [isOpen, locationId]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const { data } = await adminCustomersApi.apiAdminCustomersSearchGet(searchQuery.trim());
      setSearchResults(data as unknown as CustomerSummary[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to search customers');
    } finally {
      setSearching(false);
    }
  }

  // Resolves the customer step: an existing pick just moves on, a new walk-in is created here so
  // step 2 always has a real customerId to book against.
  async function handleContinueFromCustomer() {
    setError(null);
    if (customerMode === 'search') {
      if (!pickedResult) return;
      setCustomer(pickedResult);
      setStep('booking');
      return;
    }
    if (!newName.trim()) return;
    setResolvingCustomer(true);
    try {
      const { data } = await adminCustomersApi.apiAdminCustomersPost({
        name: newName.trim(),
        email: newEmail.trim() || null,
        phone: newPhone.trim() || null,
        isWalkIn: true,
      });
      setCustomer({ id: Number(data.id), name: newName.trim(), email: newEmail.trim(), phone: newPhone.trim() || null });
      setStep('booking');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create walk-in customer');
    } finally {
      setResolvingCustomer(false);
    }
  }

  if (!isOpen) return null;

  const canContinueCustomer = customerMode === 'search' ? pickedResult !== null : newName.trim() !== '';
  const selectedTreatment = treatments.find((t) => t.id === treatmentId);
  const canSubmit = locationId !== null && customer !== null && treatmentId !== '' && therapistId !== '';

  const owed = selectedTreatment?.price ?? 0;
  const tipAmount = Number(tip) || 0;
  const tenderedAmount = Number(amountTendered) || 0;
  const changeDue = Math.max(0, tenderedAmount - (owed + tipAmount));
  const cashTenderedTooLow = paymentProvider === 'Cash' && tenderedAmount < owed + tipAmount;

  // Drafts (first time) or reuses the existing draft, then claims the room/therapist/time slot --
  // this is the same 5-minute hold sp_Booking_ScheduleTreatment always grants, so the payment step
  // has a few minutes to collect payment before the slot could be claimed by someone else.
  async function handleContinueFromBooking(e: FormEvent) {
    e.preventDefault();
    if (locationId === null || !customer || treatmentId === '' || therapistId === '' || !selectedTreatment) return;

    setSubmitting(true);
    setError(null);
    try {
      let activeBookingId = bookingId;
      if (activeBookingId === null) {
        const { data: draft } = await bookingApi.apiBookingDraftPost({ locationId, treatmentIds: [treatmentId], customerId: customer.id });
        activeBookingId = Number(draft.bookingId);
        setBookingId(activeBookingId);
      }

      const startIso = toIsoDateTime(workDate, startTime);
      const endIso = addMinutesIso(startIso, selectedTreatment.durationSlots * 15);

      await bookingApi.apiBookingIdTreatmentsTreatmentIdSchedulePut(activeBookingId, treatmentId, {
        roomId,
        therapistId,
        startTime: startIso,
        endTime: endIso,
        customerId: customer.id,
      });

      setStep('payment');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reserve the slot');
    } finally {
      setSubmitting(false);
    }
  }

  // Creating the payment intent then immediately confirming it as manually-collected is the same
  // two-call sequence clientportal's PaymentStep uses for Cash/InHouse -- confirm-manual is what
  // actually calls bookingService.ConfirmAsync server-side (see PaymentService.ProcessManualPaymentAsync).
  async function handlePayment() {
    if (bookingId === null || !customer || cashTenderedTooLow) return;
    setPaying(true);
    setError(null);
    try {
      const { data: intent } = await paymentApi.apiPaymentsCreateIntentPost({
        bookingId,
        provider: paymentProvider,
        customerId: customer.id,
        tipAmount,
      });

      await paymentApi.apiPaymentsConfirmManualPost({
        paymentId: Number(intent.paymentId),
        success: true,
        amountTendered: paymentProvider === 'Cash' ? tenderedAmount : undefined,
      });

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to collect payment');
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <Card className="w-full max-w-lg shadow-2xl border-primary/30 my-8">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Add Appointment {roomName ? `— ${roomName}` : ''}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Date: <span className="font-semibold text-foreground">{workDate}</span> &bull; Starts at:{' '}
            <span className="font-semibold text-foreground">{startTime}</span>
          </p>
        </CardHeader>

        <CardContent className="pt-6 space-y-4">
          {error && <div className="rounded-xl bg-destructive/15 border border-destructive/30 p-3 text-xs font-semibold text-destructive">{error}</div>}

          {step === 'customer' ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">Step 1 — Find or create the customer</label>
                  <div className="flex rounded-lg border border-input overflow-hidden text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setCustomerMode('search')}
                      className={`px-2.5 py-1 transition-colors ${customerMode === 'search' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'}`}
                    >
                      Find existing
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerMode('new')}
                      className={`px-2.5 py-1 transition-colors ${customerMode === 'new' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'}`}
                    >
                      New walk-in
                    </button>
                  </div>
                </div>

                {customerMode === 'search' ? (
                  pickedResult ? (
                    <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
                      <div>
                        <p className="text-xs font-bold text-foreground">{pickedResult.name}</p>
                        <p className="text-[11px] text-muted-foreground">{pickedResult.email || pickedResult.phone}</p>
                      </div>
                      <button type="button" onClick={() => setPickedResult(null)} className="text-xs font-semibold text-muted-foreground hover:text-destructive">
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5">
                        <Input
                          placeholder="Search by name, email or phone"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="flex-1"
                        />
                        <Button type="button" size="sm" variant="outline" disabled={searching || !searchQuery.trim()} onClick={handleSearch}>
                          {searching ? '...' : 'Search'}
                        </Button>
                      </div>
                      {searchResults.length > 0 && (
                        <div className="max-h-36 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
                          {searchResults.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setPickedResult(c);
                                setSearchResults([]);
                              }}
                              className="block w-full px-3 py-2 text-left text-xs hover:bg-accent transition"
                            >
                              <span className="font-bold text-foreground">{c.name}</span>{' '}
                              <span className="text-muted-foreground">{c.email || c.phone}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} className="col-span-2" />
                    <Input placeholder="Phone (optional)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                    <Input placeholder="Email (optional)" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border/60">
                <Button type="button" variant="outline" onClick={onClose} disabled={resolvingCustomer}>
                  Cancel
                </Button>
                <Button type="button" disabled={resolvingCustomer || !canContinueCustomer} className="font-semibold" onClick={handleContinueFromCustomer}>
                  {resolvingCustomer ? 'Creating...' : 'Continue'}
                </Button>
              </div>
            </div>
          ) : step === 'booking' ? (
            <form onSubmit={handleContinueFromBooking} className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Booking for</span>
                  <p className="text-xs font-bold text-foreground">{customer?.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('customer')}
                  className="text-xs font-semibold text-muted-foreground hover:text-destructive"
                >
                  Change
                </button>
              </div>

              {/* Treatment -- every treatment currently effective/priced at this location */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Treatment</label>
                <select
                  value={treatmentId}
                  onChange={(e) => setTreatmentId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select a treatment</option>
                  {treatments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — ${t.price?.toFixed(2)} ({t.durationSlots * 15} min)
                    </option>
                  ))}
                </select>
              </div>

              {/* Therapist */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Therapist</label>
                <select
                  value={therapistId}
                  onChange={(e) => setTherapistId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select a therapist</option>
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border/60">
                <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || !canSubmit} className="font-semibold">
                  {submitting ? 'Reserving...' : 'Continue to Payment'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Amount Due</span>
                  <p className="text-sm font-bold text-foreground">${(owed + tipAmount).toFixed(2)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('booking')}
                  className="text-xs font-semibold text-muted-foreground hover:text-destructive"
                >
                  Back
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPaymentProvider('Cash')}
                  className={`rounded-xl border p-3 text-left text-xs font-bold transition ${
                    paymentProvider === 'Cash'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  💵 Cash
                  <p className="mt-0.5 text-[10px] font-normal opacity-80">Collected at the counter now</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentProvider('InHouse')}
                  className={`rounded-xl border p-3 text-left text-xs font-bold transition ${
                    paymentProvider === 'InHouse'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  💳 Card / POS Terminal
                  <p className="mt-0.5 text-[10px] font-normal opacity-80">Swipe on the counter terminal</p>
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Tip (optional)</label>
                <Input type="number" min="0" step="0.01" value={tip} onChange={(e) => setTip(e.target.value)} />
              </div>

              {paymentProvider === 'Cash' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Amount Tendered</label>
                    <Input type="number" min="0" step="0.01" value={amountTendered} onChange={(e) => setAmountTendered(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Change Due</label>
                    <div className="rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold">${changeDue.toFixed(2)}</div>
                  </div>
                </div>
              )}
              {cashTenderedTooLow && amountTendered && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Amount tendered must be at least ${(owed + tipAmount).toFixed(2)}.</p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border/60">
                <Button type="button" variant="outline" onClick={onClose} disabled={paying}>
                  Cancel
                </Button>
                <Button type="button" disabled={paying || cashTenderedTooLow} className="font-semibold" onClick={handlePayment}>
                  {paying ? 'Confirming...' : 'Confirm & Collect Payment'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
