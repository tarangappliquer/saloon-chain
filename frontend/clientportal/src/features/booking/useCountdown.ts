import { useEffect, useState } from 'react';

function remaining(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState(() => remaining(expiresAt));

  useEffect(() => {
    setSecondsLeft(remaining(expiresAt));
    if (!expiresAt) return;
    const id = setInterval(() => setSecondsLeft(remaining(expiresAt)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return secondsLeft;
}
