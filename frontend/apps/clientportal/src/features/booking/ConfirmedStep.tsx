import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, CardContent } from '@saloon/ui';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { bookingApi, paymentApi } from '../../api/client';

export function ConfirmedStep() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingIdStr = searchParams.get('bookingId');
  const sessionId = searchParams.get('session_id');

  const [verifying, setVerifying] = useState(Boolean(sessionId));

  useEffect(() => {
    async function verifyAndConfirm() {
      const bId = Number(bookingIdStr);
      try {
        if (sessionId && !isNaN(bId) && bId > 0) {
          await paymentApi.apiPaymentsVerifyCheckoutSessionPost({
            sessionId,
            bookingId: bId,
          });
        } else if (bookingIdStr && !isNaN(bId) && bId > 0) {
          await bookingApi.apiBookingIdConfirmPost(bId);
        }
      } catch {
        // Ignored if already confirmed or verified
      } finally {
        setVerifying(false);
      }
    }

    verifyAndConfirm();
  }, [bookingIdStr, sessionId]);

  if (verifying) {
    return (
      <div className="mx-auto mt-8 max-w-md text-center">
        <Card className="p-8">
          <CardContent className="flex flex-col items-center space-y-4 pt-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Loader2 className="h-8 w-8 animate-spin stroke-[2.5]" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">Verifying Payment...</h1>
            <p className="text-xs text-muted-foreground">Please wait while we verify your Stripe checkout status and confirm your appointment.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-8 max-w-md text-center">
      <Card className="p-8">
        <CardContent className="flex flex-col items-center space-y-4 pt-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-8 w-8 stroke-[2.5]" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">Appointment Confirmed!</h1>
          <p className="text-xs text-muted-foreground">Your booking has been saved. You can manage or view it anytime under My Bookings.</p>
          <div className="pt-4 flex gap-3 w-full justify-center">
            <Button variant="outline" onClick={() => navigate('/my-bookings')}>
              View My Bookings
            </Button>
            <Button variant="primary" onClick={() => navigate('/book')}>
              Book Another
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
