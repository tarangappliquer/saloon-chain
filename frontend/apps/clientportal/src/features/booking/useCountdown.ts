import { useEffect, useState } from 'react';

function remaining(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState(() => remaining(expiresAt));

  useEffect(() => {
    const initialRem = remaining(expiresAt);
    setSecondsLeft(initialRem);
    if (!expiresAt || initialRem <= 0) return;
    const id = setInterval(() => {
      const rem = remaining(expiresAt);
      setSecondsLeft(rem);
      if (rem <= 0) {
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return secondsLeft;
}
