import { useEffect, useState, useSyncExternalStore, useEffectEvent } from 'react';

const POLL_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 5_000;

// `signal` lets a caller cancel early (e.g. StrictMode's dev-only mount/cleanup/remount cycle) --
// merged with our own timeout so either one can abort the fetch.
async function pingServer(apiBase: string, signal: AbortSignal): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort);
  try {
    const res = await fetch(`${apiBase}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
  }
}

// Sticky banner shown when either the browser has no internet or the API is unreachable --
// distinguishes the two so a customer isn't told "we're having trouble" for their own dropped
// wifi. Polls GET {apiBase}/health (ASP.NET's built-in health-check middleware, see Program.cs)
// with a plain fetch rather than the generated api-client, since this lives in the shared @saloon/ui
// package and has no per-app axios instance to reuse.
function subscribeOnlineStatus(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getOnlineStatusSnapshot() {
  return navigator.onLine;
}

export function ConnectivityBanner({ apiBase, onServerUp }: { apiBase: string; onServerUp?: () => void }) {
  const online = useSyncExternalStore(subscribeOnlineStatus, getOnlineStatusSnapshot);
  const [serverUp, setServerUp] = useState(true);
  const isDown = !online || !serverUp;
  const message = online
    ? "We're having trouble connecting to our servers. Hang tight, we're on it."
    : "You're offline. Please check your internet connection.";

  const [shownMessage, setShownMessage] = useState(message);
  useEffect(() => {
    if (isDown) setShownMessage(message);
  }, [isDown, message]);

  const handleServerUpEvent = useEffectEvent(() => {
    onServerUp?.();
  });

  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    const check = async () => {
      if (document.hidden) return;
      const up = await pingServer(apiBase, controller.signal);
      if (controller.signal.aborted) return;
      setServerUp((prev) => {
        if (up && !prev) {
          handleServerUpEvent();
        }
        return up;
      });
    };
    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      controller.abort();
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [apiBase, online]);

  // Always mounted (never `return null`) so hiding animates instead of popping -- a CSS grid track
  // collapsing 1fr -> 0fr transitions smoothly, unlike height:auto, and needs no JS unmount timer.
  return (
    <div
      className="sticky top-0 z-50 grid transition-[grid-template-rows] duration-300 ease-in-out"
      style={{ gridTemplateRows: isDown ? '1fr' : '0fr' }}
    >
      <div className="overflow-hidden">
        <div
          className={`flex items-center justify-center gap-2 border-b border-red-900/30 bg-red-800 px-4 py-2 text-center text-xs font-semibold text-red-50 shadow-sm transition-all duration-300 dark:bg-red-900 ${isDown ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
            }`}
        >
          <span className="flex h-2 w-2 shrink-0 rounded-full bg-red-300 animate-pulse" />
          {shownMessage}
        </div>
      </div>
    </div>
  );
}
