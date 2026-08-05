import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandMark, Button, Card, Input } from '@saloon/ui';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { ApiError, getFieldError } from '../api/client';
import { useAuth } from '../features/auth/AuthContext';

export function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/my-bookings', { replace: true });
    }
  }, [user, navigate]);

  if (user) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
      navigate('/my-bookings');
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  function handleModeChange(newMode: 'login' | 'register') {
    setMode(newMode);
    setName('');
    setEmail('');
    setPassword('');
    setError(null);
    setSubmitError(null);
  }

  function handleFillDemo() {
    setEmail('client@saloon.com');
    setPassword('password123');
    setError(null);
  }

  return (
    <main className="min-h-[calc(100vh-6rem)] flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 sm:p-8 shadow-lift border-border bg-card/95 backdrop-blur-md rounded-3xl">
        {/* Header / Brand Mark */}
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark
            label="ShoppeySaloon"
            subtitle={mode === 'login' ? 'Sign in to manage your appointments' : 'Register to start booking treatments'}
          />
        </div>

        {/* Segmented Mode Selector */}
        <div className="mb-6 grid grid-cols-2 gap-1 p-1 bg-muted/60 rounded-xl border border-border/60">
          <button
            type="button"
            onClick={() => handleModeChange('login')}
            className={`py-2 text-xs font-bold rounded-lg transition-all ${mode === 'login'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('register')}
            className={`py-2 text-xs font-bold rounded-lg transition-all ${mode === 'register'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <Input
              required
              label="Full Name"
              placeholder="e.g. Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={getFieldError(submitError, 'name')}
            />
          )}
          <Input
            required
            type="email"
            label="Email Address"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={getFieldError(submitError, 'email')}
          />
          <Input
            required
            type="password"
            label="Password"
            placeholder="••••••••"
            showPasswordIcon={true}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={getFieldError(submitError, 'password')}
          />

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" disabled={submitting} size="lg" className="w-full mt-2 group">
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Please wait...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                {mode === 'login' ? 'Sign in' : 'Create account'}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            )}
          </Button>
        </form>

        {/* Quick Demo Helper & Password Reset */}
        <div className="mt-6 pt-4 border-t border-border/60 flex flex-col items-center gap-3 text-center">
          {mode === 'login' && (
            <button
              type="button"
              onClick={handleFillDemo}
              className="text-xs font-semibold text-primary/80 hover:text-primary transition hover:underline flex items-center gap-1"
            >
              <Sparkles className="h-3 w-3" /> Auto-fill Demo Client Credentials
            </button>
          )}

          {mode === 'login' ? (
            <Link to="/forgot-password" className="text-xs font-semibold text-muted-foreground hover:text-primary transition">
              Forgot password?
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">
              By creating an account, you agree to our Terms of Service.
            </p>
          )}
        </div>
      </Card>
    </main>
  );
}
