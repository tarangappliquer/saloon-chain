import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CreditCard, Banknote, Terminal, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import type { AxiosResponse, AxiosError } from 'axios';
import { axiosInstance } from '../../api/client';
import { BookingSummary } from './BookingSummary';
import { useBookingFlow } from './useBookingFlow';

export type PaymentProviderType = 'Stripe' | 'Cash' | 'InHouse';

interface CreatePaymentIntentResponse {
  paymentId: number;
  bookingId: number;
  amount: number;
  currency: string;
  provider: PaymentProviderType;
  status: string;
  clientSecret: string | null;
  transactionId: string | null;
  publishableKey: string | null;
}

export function PaymentStep() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const flow = useBookingFlow(Number(bookingId));
  const { state, allCovered } = flow;
  const { booking } = state;

  const [selectedProvider, setSelectedProvider] = useState<PaymentProviderType>('Stripe');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null);

  useEffect(() => {
    if (state.restoring) return;
    if (!allCovered) navigate(`/book/${bookingId}/schedule`, { replace: true });
  }, [state.restoring, allCovered, navigate, bookingId]);

  useEffect(() => {
    if (selectedProvider === 'Stripe' && bookingId && !stripeClientSecret) {
      setIsProcessing(true);
      setPaymentError(null);
      axiosInstance
        .post<CreatePaymentIntentResponse>('/api/payments/create-intent', {
          bookingId: Number(bookingId),
          provider: 'Stripe',
        })
        .then((res: AxiosResponse<CreatePaymentIntentResponse>) => {
          setStripeClientSecret(res.data.clientSecret);
          setStripePublishableKey(res.data.publishableKey);
        })
        .catch((err: AxiosError<{ title?: string }>) => {
          setPaymentError(err.response?.data?.title ?? err.message ?? 'Failed to initialize payment.');
        })
        .finally(() => setIsProcessing(false));
    }
  }, [selectedProvider, bookingId, stripeClientSecret]);

  async function handlePaymentAndConfirm() {
    setIsProcessing(true);
    setPaymentError(null);
    try {
      if (selectedProvider === 'Stripe') {
        const res = await axiosInstance.post<CreatePaymentIntentResponse>('/api/payments/create-intent', {
          bookingId: Number(bookingId),
          provider: 'Stripe',
        });
        
        await axiosInstance.post('/api/payments/confirm-manual', {
          paymentId: res.data.paymentId,
          success: true,
          transactionId: res.data.transactionId ?? `stripe_tx_${Date.now()}`,
        });

        const confirmed = await flow.confirmAll();
        if (confirmed) navigate('/book/confirmed');
      } else if (selectedProvider === 'Cash') {
        const res = await axiosInstance.post<CreatePaymentIntentResponse>('/api/payments/create-intent', {
          bookingId: Number(bookingId),
          provider: 'Cash',
        });

        await axiosInstance.post('/api/payments/confirm-manual', {
          paymentId: res.data.paymentId,
          success: true,
          transactionId: res.data.transactionId,
        });

        const confirmed = await flow.confirmAll();
        if (confirmed) navigate('/book/confirmed');
      } else if (selectedProvider === 'InHouse') {
        const res = await axiosInstance.post<CreatePaymentIntentResponse>('/api/payments/create-intent', {
          bookingId: Number(bookingId),
          provider: 'InHouse',
        });

        await axiosInstance.post('/api/payments/confirm-manual', {
          paymentId: res.data.paymentId,
          success: true,
          transactionId: res.data.transactionId,
        });

        const confirmed = await flow.confirmAll();
        if (confirmed) navigate('/book/confirmed');
      }
    } catch (err: unknown) {
      const error = err as AxiosError<{ title?: string }>;
      setPaymentError(error.response?.data?.title ?? error.message ?? 'Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  if (!booking || !allCovered) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md">
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
          <CreditCard className="w-7 h-7 text-indigo-400" /> Select Payment Method
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          Choose your preferred payment method to finalize appointment confirmation.
        </p>

        {paymentError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{paymentError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Stripe Option */}
          <button
            type="button"
            onClick={() => setSelectedProvider('Stripe')}
            className={`flex flex-col items-start p-5 rounded-xl border text-left transition-all duration-200 ${
              selectedProvider === 'Stripe'
                ? 'bg-indigo-600/15 border-indigo-500 ring-2 ring-indigo-500/30 text-white'
                : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/80 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-3">
              <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                <CreditCard className="w-6 h-6" />
              </div>
              {selectedProvider === 'Stripe' && <CheckCircle2 className="w-5 h-5 text-indigo-400" />}
            </div>
            <span className="font-semibold text-lg text-white">Stripe Pay</span>
            <span className="text-xs text-slate-400 mt-1">Credit / Debit Card online processing</span>
            <div className="flex items-center gap-2 mt-3">
              <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-indigo-500/20 text-indigo-300 rounded">
                Instant Online
              </span>
              {stripePublishableKey && (
                <span className="text-[10px] text-slate-400 font-mono" title={stripePublishableKey}>
                  Key Ready
                </span>
              )}
            </div>
          </button>

          {/* Cash Option */}
          <button
            type="button"
            onClick={() => setSelectedProvider('Cash')}
            className={`flex flex-col items-start p-5 rounded-xl border text-left transition-all duration-200 ${
              selectedProvider === 'Cash'
                ? 'bg-emerald-600/15 border-emerald-500 ring-2 ring-emerald-500/30 text-white'
                : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/80 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                <Banknote className="w-6 h-6" />
              </div>
              {selectedProvider === 'Cash' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            </div>
            <span className="font-semibold text-lg text-white">Cash on Arrival</span>
            <span className="text-xs text-slate-400 mt-1">Pay with cash at the saloon front desk</span>
            <span className="mt-3 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-emerald-500/20 text-emerald-300 rounded">
              Pay at Salon
            </span>
          </button>

          {/* InHouse Terminal Option */}
          <button
            type="button"
            onClick={() => setSelectedProvider('InHouse')}
            className={`flex flex-col items-start p-5 rounded-xl border text-left transition-all duration-200 ${
              selectedProvider === 'InHouse'
                ? 'bg-amber-600/15 border-amber-500 ring-2 ring-amber-500/30 text-white'
                : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/80 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-3">
              <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400">
                <Terminal className="w-6 h-6" />
              </div>
              {selectedProvider === 'InHouse' && <CheckCircle2 className="w-5 h-5 text-amber-400" />}
            </div>
            <span className="font-semibold text-lg text-white">InHouse Terminal</span>
            <span className="text-xs text-slate-400 mt-1">Card swipe/tap on counter POS terminal</span>
            <span className="mt-3 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-amber-500/20 text-amber-300 rounded">
              POS Terminal
            </span>
          </button>
        </div>

        {/* Selected Provider Detail */}
        <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800/80 mb-6">
          {selectedProvider === 'Stripe' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-200">Stripe Card Checkout</h4>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> 256-bit Encrypted
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Card Details</label>
                    <div className="p-3 rounded-md bg-slate-950 border border-slate-700 text-sm text-slate-200 flex items-center justify-between">
                      <span className="font-mono text-slate-300">•••• •••• •••• 4242</span>
                      <span className="text-xs text-slate-500 font-mono">12/28</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedProvider === 'Cash' && (
            <div className="text-sm text-slate-300 space-y-2">
              <h4 className="font-medium text-white">Pay on Arrival Instructions</h4>
              <p className="text-slate-400 text-xs leading-relaxed">
                Your appointment will be reserved. Please present your booking confirmation at the front desk and pay via cash prior to your treatment.
              </p>
            </div>
          )}

          {selectedProvider === 'InHouse' && (
            <div className="text-sm text-slate-300 space-y-2">
              <h4 className="font-medium text-white">InHouse POS Terminal Instructions</h4>
              <p className="text-slate-400 text-xs leading-relaxed">
                Your appointment will be reserved. Upon arrival at the saloon counter, receptionist will initiate payment on the card reader terminal.
              </p>
            </div>
          )}
        </div>

        <BookingSummary
          lines={booking.treatments}
          onConfirm={handlePaymentAndConfirm}
          onEdit={() => navigate(`/book/${bookingId}/schedule`)}
          loading={state.loading || isProcessing}
        />
      </div>
    </div>
  );
}
