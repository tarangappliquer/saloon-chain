import { startTransition, useCallback, useEffect, useOptimistic, useState } from 'react';
import Select, { type SingleValue } from 'react-select';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminBookingsApi, adminCatalogApi, adminInventoryApi, ApiError, paymentApi } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { AdminBooking, Location, PaymentRecord } from '../../api/types';
import { type SelectOption, selectClassNames } from '../../components/reactSelectStyles';
import { DateInput } from '../../components/DateInput';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasStarted(booking: AdminBooking): boolean {
  const starts = booking.treatments.map((t) => t.startTime).filter((s): s is string => !!s).map((s) => new Date(s).getTime());
  return starts.length > 0 && Date.now() >= Math.min(...starts);
}

// Same "local plain-number row shape" workaround InventoryPage.tsx uses for the generated DTOs.
interface BookingProductRow {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ProductRow {
  id: number;
  name: string;
  price: number;
}

function RetailLines({ bookingId, locationId }: { bookingId: number; locationId: number }) {
  const [lines, setLines] = useState<BookingProductRow[] | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    adminBookingsApi.apiAdminBookingsIdProductsGet(bookingId).then(({ data }) => setLines(data as unknown as BookingProductRow[]));
  }

  useEffect(() => {
    load();
    adminInventoryApi.apiAdminInventoryProductsGet(locationId).then(({ data }) => setProducts(data as unknown as ProductRow[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, locationId]);

  async function addLine() {
    if (!productId) return;
    setSaving(true);
    setError(null);
    try {
      await adminBookingsApi.apiAdminBookingsIdProductsPost(bookingId, { productId: Number(productId), quantity: Number(quantity) });
      setProductId('');
      setQuantity('1');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add product.');
    } finally {
      setSaving(false);
    }
  }

  async function removeLine(id: number) {
    try {
      await adminBookingsApi.apiAdminBookingsIdProductsProductLineIdDelete(bookingId, id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove product.');
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Retail Items</h3>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {lines && lines.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between">
              <span>
                {l.productName} × {l.quantity}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-foreground">${l.lineTotal.toFixed(2)}</span>
                <button type="button" onClick={() => removeLine(l.id)} className="text-muted-foreground hover:text-destructive transition">
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className="flex-1 rounded-lg border border-input bg-card px-2 py-1.5 text-xs text-foreground">
          <option value="">Add a product...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (${p.price.toFixed(2)})
            </option>
          ))}
        </select>
        <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-16" />
        <Button type="button" size="sm" variant="outline" disabled={saving || !productId} onClick={addLine}>
          Add
        </Button>
      </div>
    </div>
  );
}

interface ReassignTarget {
  bookingId: number;
  treatmentId: number;
  treatmentName: string;
  currentTherapist?: string;
}

interface BookingDetailsModalProps {
  booking: AdminBooking;
  locationId: number;
  canCancel: boolean;
  canMarkNoShow: boolean;
  onClose: () => void;
  onCancel: (id: number) => Promise<void>;
  onNoShow: (id: number) => Promise<void>;
  onReassignTherapist: (target: ReassignTarget) => void;
}

function BookingDetailsModal({
  booking,
  locationId,
  canCancel,
  canMarkNoShow,
  onClose,
  onCancel,
  onNoShow,
  onReassignTherapist,
}: BookingDetailsModalProps) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [markingNoShow, setMarkingNoShow] = useState(false);

  useEffect(() => {
    async function loadPayments() {
      try {
        const { data } = await paymentApi.apiPaymentsBookingBookingIdGet(booking.id);
        setPayments(data as unknown as PaymentRecord[]);
      } catch {
        setPayments([]);
      } finally {
        setLoadingPayments(false);
      }
    }
    loadPayments();
  }, [booking.id]);

  const totalAmount = booking.treatments.reduce((sum, t) => sum + (t.price || 0), 0);
  const successfulPayment = payments.find((p) => p.status === 'Succeeded' || p.status === 'Paid');
  const refundedPayment = payments.find((p) => p.status === 'Refunded');

  async function handleConfirmCancel() {
    setCancelling(true);
    try {
      await onCancel(booking.id);
      setShowConfirmCancel(false);
      onClose();
    } catch {
      // Handled by parent
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <ConfirmDialog
        isOpen={showConfirmCancel}
        title="Cancel Customer Booking"
        description={`Are you sure you want to cancel booking #${booking.id} for ${booking.customerName}? If paid, an automated refund will be processed.`}
        confirmLabel="Yes, Cancel Booking"
        cancelLabel="Keep Booking"
        variant="danger"
        loading={cancelling}
        onConfirm={handleConfirmCancel}
        onClose={() => setShowConfirmCancel(false)}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
        <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl space-y-6 p-6 max-h-[90vh] overflow-y-auto">
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-primary">Booking #{booking.id}</span>
                <Badge status={booking.status} />
              </div>
              <h2 className="text-xl font-extrabold text-foreground mt-1">{booking.locationName}</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-[11px] text-muted-foreground uppercase font-bold block">Total Amount</span>
                <span className="font-mono text-lg font-bold text-primary">${totalAmount.toFixed(2)}</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Customer & Location Info */}
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-border/70 bg-accent/30 p-4 text-xs">
            <div>
              <span className="block text-[11px] uppercase font-bold text-muted-foreground">Customer Info</span>
              <p className="font-bold text-foreground text-sm mt-0.5">{booking.customerName}</p>
              <p className="text-muted-foreground">{booking.customerEmail}</p>
            </div>
            <div>
              <span className="block text-[11px] uppercase font-bold text-muted-foreground">Saloon & Venue</span>
              <p className="font-bold text-foreground text-sm mt-0.5">{booking.locationName}</p>
              <p className="text-muted-foreground">Shoppey Verified Venue</p>
            </div>
          </div>

          {/* Treatments List */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Treatments ({booking.treatments.length})
            </h3>
            <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
              {booking.treatments.map((t, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 text-xs">
                  <div>
                    <p className="font-bold text-foreground">{t.treatmentName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.roomName ? `Room: ${t.roomName}` : 'Room unassigned'} •{' '}
                      {t.therapistName ? `Specialist: ${t.therapistName}` : 'Staff unassigned'}
                    </p>
                    {t.startTime && t.endTime && (
                      <p className="font-mono text-[11px] text-primary">
                        {new Date(t.startTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                        {new Date(t.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                        {new Date(t.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {canMarkNoShow && booking.status === 'Confirmed' && (
                      <button
                        type="button"
                        onClick={() =>
                          onReassignTherapist({
                            bookingId: booking.id,
                            treatmentId: t.treatmentId,
                            treatmentName: t.treatmentName,
                            currentTherapist: t.therapistName ?? undefined,
                          })
                        }
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                      >
                        🔄 Assign Proxy / Alternate Specialist
                      </button>
                    )}
                  </div>
                  <span className="font-mono font-bold text-foreground text-sm">${t.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Retail line items */}
          {(booking.status === 'Draft' || booking.status === 'Confirmed') && <RetailLines bookingId={booking.id} locationId={locationId} />}

          {/* Financial & Payment Details */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment Summary</h3>
            {loadingPayments ? (
              <p className="text-xs text-muted-foreground animate-pulse">Loading payment records...</p>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Total Booking Amount</span>
                  <span className="font-mono font-bold text-foreground">${totalAmount.toFixed(2)}</span>
                </div>

                {successfulPayment ? (
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount Paid</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ${successfulPayment.amount.toFixed(2)} ({successfulPayment.currency})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Provider & Method</span>
                      <span className="font-semibold text-foreground">
                        {successfulPayment.provider} ({successfulPayment.paymentMethod})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Status</span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                        {successfulPayment.status}
                      </span>
                    </div>
                    {successfulPayment.transactionId && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Transaction ID</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{successfulPayment.transactionId}</span>
                      </div>
                    )}
                  </div>
                ) : refundedPayment ? (
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Status</span>
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        Refunded
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Refunded Amount</span>
                      <span className="font-mono font-bold text-foreground">${refundedPayment.amount.toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between pt-1">
                    <span className="text-muted-foreground">Payment Method</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">Pay at Venue (Cash/Card)</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="flex items-center gap-2">
              {canCancel && (booking.status === 'Draft' || booking.status === 'Confirmed') && (
                <Button variant="danger" size="sm" disabled={cancelling} onClick={() => setShowConfirmCancel(true)}>
                  Cancel & Refund Booking
                </Button>
              )}
              {canMarkNoShow && booking.status === 'Confirmed' && hasStarted(booking) && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={markingNoShow}
                  onClick={async () => {
                    setMarkingNoShow(true);
                    try {
                      await onNoShow(booking.id);
                      onClose();
                    } finally {
                      setMarkingNoShow(false);
                    }
                  }}
                >
                  {markingNoShow ? 'Marking...' : 'Mark No-Show'}
                </Button>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={onClose}>
              Close Details
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

interface ReassignTherapistModalProps {
  target: ReassignTarget;
  locationId: number;
  onClose: () => void;
  onSuccess: () => void;
}

function ReassignTherapistModal({ target, locationId, onClose, onSuccess }: ReassignTherapistModalProps) {
  const [therapists, setTherapists] = useState<{ id: number; name: string }[]>([]);
  const [newTherapistId, setNewTherapistId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminCatalogApi
      .apiAdminCatalogTherapistsGet()
      .then(({ data }) => {
        const list = (data as unknown as { id: number; name: string; locationId?: number }[]).filter(
          (t) => !t.locationId || t.locationId === locationId
        );
        setTherapists(list);
        if (list.length > 0) setNewTherapistId(String(list[0].id));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load therapists'))
      .finally(() => setLoading(false));
  }, [locationId]);

  async function handleReassign(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!newTherapistId) return;
    setSubmitting(true);
    setError(null);
    try {
      await adminBookingsApi.apiAdminBookingsIdTreatmentsTreatmentIdReassignTherapistPost(
        target.bookingId,
        target.treatmentId,
        { newTherapistId: Number(newTherapistId), reason: reason || null }
      );
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reassign proxy therapist');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl space-y-4 p-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-base font-extrabold text-foreground">Assign Proxy / Alternate Specialist</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Booking #{target.bookingId} • {target.treatmentName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-6"><LoadingFallback /></div>
        ) : (
          <form onSubmit={handleReassign} className="space-y-4 text-xs">
            {target.currentTherapist && (
              <div className="rounded-xl border border-border/80 bg-accent/30 p-3">
                <span className="text-[11px] font-bold uppercase text-muted-foreground block">Currently Assigned Specialist</span>
                <span className="font-semibold text-foreground text-sm">{target.currentTherapist}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Select Alternate / Proxy Specialist
              </label>
              <select
                value={newTherapistId}
                onChange={(e) => setNewTherapistId(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground font-semibold"
              >
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Reason for Reassignment (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Primary specialist on emergency leave"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !newTherapistId} size="sm" className="font-bold">
                {submitting ? 'Reassigning...' : 'Confirm Proxy Specialist'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function BookingsPage() {
  const { user } = useAuth();
  const canCancel =
    user?.role === 'RootSuperAdmin' ||
    user?.role === 'SuperAdmin' ||
    user?.role === 'Admin' ||
    user?.role === 'Manager' ||
    user?.role === 'Receptionist';
  // Matches the "AdminAccess" policy on POST /{id}/no-show -- Receptionist can cancel but not
  // mark a no-show (a back-office record correction, not a front-desk action).
  const canMarkNoShow =
    user?.role === 'RootSuperAdmin' || user?.role === 'SuperAdmin' || user?.role === 'Admin' || user?.role === 'Manager';

  const isRootSuperAdmin = user?.role === 'RootSuperAdmin';
  const [chains, setChains] = useState<{ id: number; name: string }[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [optimisticBookings, setOptimisticBookings] = useOptimistic(
    bookings,
    (state, action: { type: 'cancel' | 'noshow'; id: number }) =>
      state.map((b) => (b.id === action.id ? { ...b, status: action.type === 'cancel' ? 'Cancelled' : 'NoShow' } : b)),
  );
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null);
  const [confirmCancelBookingId, setConfirmCancelBookingId] = useState<number | null>(null);
  const [reassignTarget, setReassignTarget] = useState<ReassignTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data as unknown as { id: number; name: string }[];
        setChains(cs);
        if (cs.length > 0) setChainId(cs[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load chains'));
  }, []);

  useEffect(() => {
    if (chainId === null) return;
    adminCatalogApi
      .apiAdminCatalogLocationsGet(chainId)
      .then(({ data }) => {
        const locs = data as unknown as Location[];
        setLocations(locs);
        setLocationId(locs.length > 0 ? locs[0].id : null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load locations'));
  }, [chainId]);

  const loadBookings = useCallback(async () => {
    if (locationId === null) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminBookingsApi.apiAdminBookingsGet(locationId, date);
      setBookings(data as unknown as AdminBooking[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [locationId, date]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  async function handleCancel(id: number) {
    setError(null);
    startTransition(() => {
      setOptimisticBookings({ type: 'cancel', id });
    });
    try {
      await adminBookingsApi.apiAdminBookingsIdCancelPost(id);
      await loadBookings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to cancel booking');
      await loadBookings();
    }
  }

  async function handleNoShow(id: number) {
    setError(null);
    startTransition(() => {
      setOptimisticBookings({ type: 'noshow', id });
    });
    try {
      await adminBookingsApi.apiAdminBookingsIdNoShowPost(id);
      await loadBookings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to mark booking as a no-show');
      await loadBookings();
    }
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={confirmCancelBookingId !== null}
        title="Cancel Booking"
        description={`Are you sure you want to cancel booking #${confirmCancelBookingId}? If paid, an automated refund will be processed.`}
        confirmLabel="Yes, Cancel Booking"
        cancelLabel="Keep Booking"
        variant="danger"
        onConfirm={async () => {
          if (confirmCancelBookingId !== null) {
            await handleCancel(confirmCancelBookingId);
            setConfirmCancelBookingId(null);
          }
        }}
        onClose={() => setConfirmCancelBookingId(null)}
      />

      <PageHeader
        title="Location Bookings"
        description="Review customer appointments. Click any row to inspect complete booking, treatment, and payment details."
        action={
          <div className="flex flex-wrap items-center gap-3">
            {isRootSuperAdmin && chains.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Saloon:</span>
                <Select
                  isClearable
                  value={chains.map((c) => ({ value: String(c.id), label: c.name })).find((o) => o.value === String(chainId ?? '')) ?? null}
                  onChange={(picked: SingleValue<SelectOption>) => setChainId(Number(picked?.value ?? ''))}
                  options={chains.map((c) => ({ value: String(c.id), label: c.name }))}
                  unstyled
                  classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[160px]')}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Location:</span>
              <Select
                isClearable
                isDisabled={user?.role === 'Manager'}
                value={locations.map((l) => ({ value: String(l.id), label: l.name })).find((o) => o.value === String(locationId ?? '')) ?? null}
                onChange={(picked: SingleValue<SelectOption>) => setLocationId(Number(picked?.value ?? ''))}
                options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                unstyled
                classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[160px]')}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Date:</span>
              <DateInput
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-w-35"
              />
            </div>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {selectedBooking && locationId !== null && (
        <BookingDetailsModal
          booking={selectedBooking}
          locationId={locationId}
          canCancel={canCancel}
          canMarkNoShow={canMarkNoShow}
          onClose={() => setSelectedBooking(null)}
          onCancel={handleCancel}
          onNoShow={handleNoShow}
          onReassignTherapist={setReassignTarget}
        />
      )}

      {reassignTarget && locationId !== null && (
        <ReassignTherapistModal
          target={reassignTarget}
          locationId={locationId}
          onClose={() => setReassignTarget(null)}
          onSuccess={() => {
            loadBookings();
            setSelectedBooking(null);
          }}
        />
      )}

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Appointments ({optimisticBookings.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : optimisticBookings.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No bookings found for this location and date.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Booking Date</th>
                  <th className="px-6 py-3.5">Customer</th>
                  <th className="px-6 py-3.5">Treatments & Schedule</th>
                  <th className="px-6 py-3.5">Total Amount</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {optimisticBookings.map((b) => {
                  const firstStart = b.treatments.find((t) => t.startTime)?.startTime;
                  const formattedBookingDate = firstStart
                    ? new Date(firstStart).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                    : new Date(date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });

                  const rowTotal = b.treatments.reduce((sum, t) => sum + (t.price || 0), 0);

                  return (
                    <tr
                      key={b.id}
                      onClick={() => setSelectedBooking(b)}
                      className="hover:bg-primary/5 transition align-top cursor-pointer group"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-foreground group-hover:text-primary transition">{formattedBookingDate}</div>
                        <div className="text-muted-foreground font-mono text-[11px]">Booking #{b.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-foreground">{b.customerName}</div>
                        <div className="text-muted-foreground text-xs">{b.customerEmail}</div>
                      </td>
                      <td className="px-6 py-4">
                        <ul className="space-y-1.5">
                          {b.treatments.map((t) => (
                            <li key={t.treatmentName} className="flex flex-col">
                              <span className="font-medium text-foreground">{t.treatmentName}</span>
                              {t.startTime && t.endTime && (
                                <span className="text-muted-foreground text-xs font-mono">
                                  {new Date(t.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                                  {new Date(t.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {' · '}
                                  {t.roomName} · {t.therapistName}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono font-bold text-foreground">
                        ${rowTotal.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <Badge status={b.status} />
                      </td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setSelectedBooking(b)}>
                            View Details
                          </Button>
                          {canCancel && (b.status === 'Draft' || b.status === 'Confirmed') && (
                            <Button variant="danger" size="sm" onClick={() => setConfirmCancelBookingId(b.id)}>
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
