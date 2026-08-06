import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, ConfirmDialog, LoadingFallback } from '@saloon/ui';
import { ApiError, bookingApi } from '../api/client';
import type { MyBooking } from '../api/types';
import { useAuth } from '../features/auth/AuthContext';

type Tab = 'upcoming' | 'past' | 'cancelled' | 'draft';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function isPast(b: MyBooking, now: number): boolean {
  const ends = b.treatments.map((t) => t.endTime).filter((s): s is string => !!s).map((s) => new Date(s).getTime());
  return ends.length > 0 && now > Math.max(...ends);
}

function earliestStart(b: MyBooking): number {
  const starts = b.treatments.map((t) => t.startTime).filter((s): s is string => !!s).map((s) => new Date(s).getTime());
  return starts.length ? Math.min(...starts) : Infinity;
}

function latestEnd(b: MyBooking): number {
  const ends = b.treatments.map((t) => t.endTime).filter((s): s is string => !!s).map((s) => new Date(s).getTime());
  return ends.length ? Math.max(...ends) : -Infinity;
}

function BookingCard({ b, onReload }: { b: MyBooking; onReload: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const totalCost = b.treatments.reduce((sum, t) => sum + (t.price || 0), 0);

  const startMs = earliestStart(b);
  const isWithin48h = startMs !== Infinity && startMs - Date.now() <= FORTY_EIGHT_HOURS_MS;
  const canCancel = b.status === 'Confirmed' && !isWithin48h;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleConfirmCancel() {
    setCancelling(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await bookingApi.apiBookingIdDelete(b.id);
      setActionSuccess('Booking cancelled. Full refund issued to original payment method.');
      setShowConfirmModal(false);
      timerRef.current = setTimeout(() => onReload(), 1500);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Bookings cannot be cancelled within 48 hours of appointment.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <ConfirmDialog
        isOpen={showConfirmModal}
        title="Cancel Appointment & Refund"
        description={`Are you sure you want to cancel booking #${b.id} at ${b.locationName}? A full refund of $${totalCost.toFixed(2)} will be issued to your payment method.`}
        confirmLabel="Yes, Cancel & Refund"
        cancelLabel="Keep Appointment"
        variant="danger"
        loading={cancelling}
        onConfirm={handleConfirmCancel}
        onClose={() => setShowConfirmModal(false)}
      />

      <Card hoverable className="p-6 transition-all duration-200">
        {/* Booking Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-semibold text-muted-foreground">Booking #{b.id}</span>
              <Badge status={b.status} />
              {b.isPaid || b.paymentStatus === 'Succeeded' || b.status === 'Confirmed' ? (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                  ✓ Paid
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300 border border-amber-500/20 flex items-center gap-1">
                  ⏳ Payment Pending
                </span>
              )}
              {b.paymentProvider && (
                <span className="rounded-full bg-accent/80 px-2.5 py-0.5 text-xs font-medium text-foreground border border-border">
                  💳 {b.paymentProvider === 'InHouse' ? 'POS Terminal' : b.paymentProvider === 'Cash' ? 'Cash on Arrival' : b.paymentProvider}
                </span>
              )}
            </div>
            <h2 className="font-display text-lg font-bold text-foreground mt-1">{b.locationName}</h2>
            {startMs !== Infinity ? (
              <p className="text-xs font-semibold text-primary mt-1 flex items-center gap-1.5">
                <span>📅 Date:</span>
                <span>
                  {new Date(startMs).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </p>
            ) : (
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-1">📅 Date: Unscheduled</p>
            )}
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-0 border-border/50">
            <div className="text-left sm:text-right">
              <span className="text-xs text-muted-foreground block">Total Amount</span>
              <span className="font-mono text-lg font-bold text-primary">${totalCost.toFixed(2)}</span>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-accent/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              <span>{expanded ? 'Hide Details' : `View Details (${b.treatments.length})`}</span>
              <svg
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {actionError && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
            {actionError}
          </div>
        )}

        {actionSuccess && (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-300">
            {actionSuccess}
          </div>
        )}

        {/* Accordion Content */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/70 space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Treatment Details ({b.treatments.length})
              </h3>
              {b.status === 'Confirmed' && isWithin48h && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  🔒 Non-refundable (within 48h of appointment)
                </span>
              )}
            </div>

            <ul className="space-y-2 text-sm text-foreground">
              {b.treatments.map((t, idx) => (
                <li key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border/60 bg-accent/30 p-3 gap-2">
                  <div className="space-y-1">
                    <span className="font-medium text-foreground">{t.treatmentName}</span>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span>{t.slotCount * 15} mins</span>
                      {t.startTime ? (
                        <span>
                          {new Date(t.startTime).toLocaleString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                          {t.therapistName ? ` · ${t.therapistName}` : ''}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Unscheduled</span>
                      )}
                    </div>
                  </div>
                  <span className="font-mono text-sm font-semibold text-foreground self-end sm:self-center">${t.price.toFixed(2)}</span>
                </li>
              ))}
            </ul>

            {/* Cancellation Action Footer */}
            {canCancel && (
              <div className="flex items-center justify-between border-t border-border pt-4">
                <span className="text-xs text-muted-foreground">
                  Free cancellation & full refund available until 48 hours prior.
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={cancelling}
                  onClick={() => setShowConfirmModal(true)}
                >
                  Cancel & Refund
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

export function MyBookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');

  function loadBookings() {
    bookingApi.apiBookingMineGet().then(({ data }) => setBookings(data as unknown as MyBooking[]));
  }

  useEffect(() => {
    loadBookings();
  }, []);

  if (!bookings) return <LoadingFallback />;

  const isDev = import.meta.env.DEV;
  const now = Date.now();
  const drafts = bookings.filter((b) => b.status === 'Draft');
  const cancelled = bookings.filter((b) => b.status === 'Cancelled');
  const confirmed = bookings.filter((b) => b.status === 'Confirmed');
  const upcoming = confirmed.filter((b) => !isPast(b, now)).sort((a, c) => earliestStart(a) - earliestStart(c));
  const past = confirmed.filter((b) => isPast(b, now)).sort((a, c) => latestEnd(c) - latestEnd(a));
  const shown = tab === 'draft' ? drafts : tab === 'cancelled' ? cancelled : tab === 'upcoming' ? upcoming : past;

  const tabs: [Tab, string][] = [
    ['upcoming', `Upcoming (${upcoming.length})`],
    ['past', `Past (${past.length})`],
    ['cancelled', `Cancelled (${cancelled.length})`],
  ];
  if (isDev) {
    tabs.push(['draft', `Draft (${drafts.length})`]);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-6 backdrop-blur-xs">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Welcome back{user?.name ? `, ${user.name}` : ''}!
          </h1>
          {user?.email && (
            <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
          )}
        </div>
        <Link to="/book">
          <Button variant="primary" size="md">
            Book new appointment
          </Button>
        </Link>
      </div>

      <div className="flex gap-2 border-b border-border pb-1">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              tab === id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {shown.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No {tab} bookings found.</p>
          </Card>
        ) : (
          shown.map((b) => <BookingCard key={b.id} b={b} onReload={loadBookings} />)
        )}
      </div>
    </div>
  );
}
