import { useNavigate } from 'react-router-dom';
import { Button, Card, CardContent } from '@saloon/ui';
import { CheckCircle2 } from 'lucide-react';

export function ConfirmedStep() {
  const navigate = useNavigate();

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
