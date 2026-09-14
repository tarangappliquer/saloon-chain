import { useEffect, useState } from 'react';
import { Badge, Button } from '@saloon/ui';
import { adminAppointmentStatusesApi, adminBookingsApi, adminCancelReasonsApi, paymentApi, ApiError } from '../api/client';
import type { AdminBooking } from '../api/types';
import type { AppointmentStatusDto, CancelReasonDto } from '@saloon/api-client';
import { formatVenueTime, venueTimezoneTag } from '../lib/time';

interface BookingDetailPanelProps {
  booking: AdminBooking;
  chainId: number | null;
  locationId: number;
  timeZoneId?: string;
  canCancel: boolean;
  canMarkNoShow: boolean;
  onClose: () => void;
  onChanged: () => void;
}

type PaymentProviderType = 'Cash' | 'InHouse';

function hasStarted(booking: AdminBooking): boolean {
  const starts = booking.treatments.map((t) => t.startTime).filter((s): s is string => !!s).map((s) => new Date(s).getTime());
  return starts.length > 0 && Date.now() >= Math.min(...starts);
}

export function BookingDetailPanel({ booking, chainId, locationId, timeZoneId, canCancel, canMarkNoShow, onClose, onChanged }: BookingDetailPanelProps) {
  const [statuses, setStatuses] = useState<AppointmentStatusDto[]>([]);
  const [cancelReasons, setCancelReasons] = useState<CancelReasonDto[]>([]);
  const [settingStatusId, setSettingStatusId] = useState<number | 'clear' | null>(null);
  const [markingNoShow, setMarkingNoShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cancel is a two-step action -- clicking the pill just reveals the reason picker inline instead
  // of firing immediately, since a cancellation always needs one (defaults to "No Reason Provided").
  const [cancelling, setCancelling] = useState(false);
  const [showCancelPicker, setShowCancelPicker] = useState(false);
  const [cancelReasonId, setCancelReasonId] = useState<number | ''>('');

  // Sentinel used when the location has no cancel reasons configured -- the picker still offers
  // "No Reason Provided" and the cancel call sends null (CancelReasonId is nullable server-side).
  const NO_REASON_ID = 0;
  const NO_REASON_FALLBACK: CancelReasonDto = { id: NO_REASON_ID, name: 'No Reason Provided', sortOrder: 0 };
  const reasonOptions = cancelReasons.length > 0 ? cancelReasons : [NO_REASON_FALLBACK];

  // Payment collection -- only relevant once Confirmed and not already paid.
  const [paymentProvider, setPaymentProvider] = useState<PaymentProviderType>('Cash');
  const [tip, setTip] = useState('0');
  const [amountTendered, setAmountTendered] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    adminAppointmentStatusesApi
      .apiAdminAppointmentStatusesGet(chainId ?? undefined, locationId)
      .then(({ data }) => setStatuses(data.filter((s) => s.isActive)))
      .catch(() => setStatuses([]));
    adminCancelReasonsApi
      .apiAdminCancelReasonsGet()
      .then(({ data }) => {
        setCancelReasons(data);
        setCancelReasonId(data.length > 0 ? Number(data[0].id) : NO_REASON_ID);
      })
      .catch((err) => {
        setCancelReasons([]);
        setCancelReasonId(NO_REASON_ID); // fall back to "No Reason Provided" so cancel still works
        setError(err instanceof ApiError ? err.message : 'Failed to load cancellation reasons');
      });
  }, [chainId, locationId]);

  const totalAmount = booking.treatments.reduce((sum, t) => sum + (t.price || 0), 0);
  const canChangeStatus = booking.status === 'Confirmed';
  const canCancelNow = canCancel && (booking.status === 'Draft' || booking.status === 'Confirmed');
  const canMarkNoShowNow = canMarkNoShow && booking.status === 'Confirmed' && hasStarted(booking);

  const owed = totalAmount;
  const tipAmount = Number(tip) || 0;
  const tenderedAmount = Number(amountTendered) || 0;
  const changeDue = Math.max(0, tenderedAmount - (owed + tipAmount));
  const cashTenderedTooLow = paymentProvider === 'Cash' && tenderedAmount < owed + tipAmount;

  async function applyStatus(id: number | null) {
    setSettingStatusId(id ?? 'clear');
    setError(null);
    try {
      await adminBookingsApi.apiAdminBookingsIdStatusPut(booking.bookingId, { appointmentStatusId: id ?? 0 });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update appointment status');
    } finally {
      setSettingStatusId(null);
    }
  }

  async function handleConfirmCancel() {
    if (cancelReasonId === '') return;
    setCancelling(true);
    setError(null);
    try {
      // NO_REASON_ID is the local "No Reason Provided" fallback -> send null (server default).
      const reasonId = cancelReasonId === NO_REASON_ID ? 0 : cancelReasonId;
      await adminBookingsApi.apiAdminBookingsIdCancelPost(booking.bookingId, { cancelReasonId: reasonId });
      setShowCancelPicker(false);
      onChanged();
      onClose();
    } catch (err) {
      console.error(err)
      setError(err instanceof ApiError ? err.message : 'Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  }

  async function handleNoShow() {
    setMarkingNoShow(true);
    setError(null);
    try {
      await adminBookingsApi.apiAdminBookingsIdNoShowPost(booking.bookingId);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to mark booking as a no-show');
    } finally {
      setMarkingNoShow(false);
    }
  }

  // Same create-intent + confirm-manual sequence as the walk-in booking wizard -- confirm-manual is
  // what actually records the payment (see PaymentService.ProcessManualPaymentAsync).
  async function handleMarkAsPaid() {
    if (!booking.customerId || cashTenderedTooLow) return;
    setPaying(true);
    setError(null);
    try {
      const { data: intent } = await paymentApi.apiPaymentsCreateIntentPost({
        bookingId: booking.bookingId,
        provider: paymentProvider,
        customerId: booking.customerId,
        tipAmount,
      });
      await paymentApi.apiPaymentsConfirmManualPost({
        paymentId: Number(intent.paymentId),
        success: true,
        amountTendered: paymentProvider === 'Cash' ? tenderedAmount : undefined,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record payment');
    } finally {
      setPaying(false);
    }
  }

  const pillBase = 'rounded-full border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-40 disabled:cursor-not-allowed';
  const pillInactive = 'border-border text-muted-foreground hover:enabled:bg-accent';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] animate-in fade-in duration-150" onClick={onClose} />

      {/* Right slide-in panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 backdrop-blur px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-primary">Booking #{booking.bookingId}</span>
              <Badge status={booking.status} />
            </div>
            <h2 className="text-base font-extrabold text-foreground mt-0.5">{booking.customerName}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">{error}</div>}

          <div className="rounded-xl border border-border/70 bg-accent/30 p-3 text-xs space-y-1">
            <p className="text-muted-foreground">{booking.customerEmail}</p>
            <p className="text-muted-foreground flex items-center gap-1.5">
              {booking.locationName}
              <Badge variant="outline" showDot={false} title="All times below are shown in this location's own timezone">
                {venueTimezoneTag(timeZoneId)}
              </Badge>
            </p>
            <div className="flex items-center justify-between pt-1">
              <span className="font-bold text-foreground">${totalAmount.toFixed(2)}</span>
              <span className={`text-[11px] font-bold ${booking.isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {booking.isPaid ? `✓ Paid via ${booking.paymentProvider ?? 'unknown'}` : 'Payment pending'}
              </span>
            </div>
            {booking.status === 'Cancelled' && booking.cancelReasonName && (
              <p className="text-[11px] text-destructive font-semibold pt-0.5">Cancelled: {booking.cancelReasonName}</p>
            )}
          </div>

          {/* Unified status pipeline -- Confirmed / Arrived / (custom) / Complete / Cancel / No-Show,
              all one control since staff think of it as a single lifecycle, even though under the
              hood Cancel/No-Show flip Bookings.Status while the rest set AppointmentStatusId. */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Status</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={!canChangeStatus || settingStatusId !== null}
                onClick={() => applyStatus(null)}
                className={`${pillBase} ${
                  canChangeStatus && !booking.appointmentStatusId ? 'border-primary bg-primary/10 text-primary' : pillInactive
                }`}
              >
                Confirmed
              </button>
              {statuses.map((s) => {
                const active = canChangeStatus && booking.appointmentStatusId === Number(s.id);
                return (
                  <button
                    key={String(s.id)}
                    type="button"
                    disabled={!canChangeStatus || settingStatusId !== null}
                    onClick={() => applyStatus(Number(s.id))}
                    style={active ? { borderColor: s.colorHex, backgroundColor: `${s.colorHex}1a`, color: s.colorHex } : undefined}
                    className={`${pillBase} ${!active ? pillInactive : ''}`}
                  >
                    {s.name}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={!canMarkNoShowNow || markingNoShow}
                onClick={handleNoShow}
                className={`${pillBase} ${booking.status === 'NoShow' ? 'border-slate-500 bg-slate-500/10 text-slate-600 dark:text-slate-400' : pillInactive}`}
              >
                {markingNoShow ? 'Marking...' : 'No-Show'}
              </button>
              <button
                type="button"
                disabled={!canCancelNow}
                onClick={() => setShowCancelPicker((v) => !v)}
                className={`${pillBase} ${booking.status === 'Cancelled' ? 'border-destructive bg-destructive/10 text-destructive' : pillInactive}`}
              >
                Cancel
              </button>
            </div>

            {showCancelPicker && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2 mt-1.5">
                <label className="text-[11px] font-bold text-foreground">Reason for cancellation</label>
                <select
                  value={cancelReasonId}
                  onChange={(e) => setCancelReasonId(e.target.value !== '' ? Number(e.target.value) : '')}
                  className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs"
                >
                  {reasonOptions.map((r) => (
                    <option key={String(r.id)} value={String(r.id)}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowCancelPicker(false)} disabled={cancelling}>
                    Keep Booking
                  </Button>
                  <Button type="button" variant="danger" size="sm" onClick={handleConfirmCancel} disabled={cancelling || cancelReasonId === ''}>
                    {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Payment collection -- only while Confirmed and not already paid */}
          {booking.status === 'Confirmed' && !booking.isPaid && (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <span className="text-[11px] font-bold uppercase text-muted-foreground">Collect Payment</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentProvider('Cash')}
                  className={`rounded-lg border p-2 text-left text-[11px] font-bold transition ${
                    paymentProvider === 'Cash' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  💵 Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentProvider('InHouse')}
                  className={`rounded-lg border p-2 text-left text-[11px] font-bold transition ${
                    paymentProvider === 'InHouse' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  💳 Card / POS
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-semibold text-muted-foreground space-y-1">
                  <span>Tip</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tip}
                    onChange={(e) => setTip(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                  />
                </label>
                {paymentProvider === 'Cash' && (
                  <label className="text-[10px] font-semibold text-muted-foreground space-y-1">
                    <span>Amount Tendered</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountTendered}
                      onChange={(e) => setAmountTendered(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                    />
                  </label>
                )}
              </div>
              {paymentProvider === 'Cash' && amountTendered && (
                <p className="text-[11px] text-muted-foreground">Change due: ${changeDue.toFixed(2)}</p>
              )}
              {cashTenderedTooLow && amountTendered && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">Must tender at least ${(owed + tipAmount).toFixed(2)}.</p>
              )}
              <Button type="button" size="sm" className="w-full font-semibold" disabled={paying || cashTenderedTooLow} onClick={handleMarkAsPaid}>
                {paying ? 'Recording...' : 'Mark as Paid'}
              </Button>
            </div>
          )}

          {/* Treatments */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Treatments ({booking.treatments.length})</span>
            <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
              {booking.treatments.map((t, idx) => (
                <div key={idx} className="p-3 text-xs space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">{t.treatmentName}</span>
                    <span className="font-mono font-bold text-foreground">${t.price.toFixed(2)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t.roomName ? `Room: ${t.roomName}` : 'Room unassigned'} • {t.therapistName ? `Specialist: ${t.therapistName}` : 'Staff unassigned'}
                  </p>
                  {t.startTime && t.endTime && (
                    <p className="font-mono text-[11px] text-primary">
                      {formatVenueTime(t.startTime, timeZoneId)} – {formatVenueTime(t.endTime, timeZoneId)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
