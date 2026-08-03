import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../features/auth/AuthContext';

// Landing spot for the redirect from adminportal's "Log in as customer" -- swaps the token in the
// URL for a real session (via GET /api/auth/me) and drops straight into the booking flow.
export function EmulatePage() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setError('Missing emulation token.');
      return;
    }

    loginWithToken(token)
      .then(() => navigate('/my-bookings', { replace: true }))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to start emulation session'));
  }, [searchParams, loginWithToken, navigate]);

  return (
    <div className="mx-auto mt-16 max-w-sm px-4 text-center">
      {error ? (
        <>
          <p className="text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="mt-4 text-sm text-purple-600 hover:underline"
          >
            Go to sign in
          </button>
        </>
      ) : (
        <p className="text-gray-500">Opening customer session…</p>
      )}
    </div>
  );
}
