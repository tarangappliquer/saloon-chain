import { useEffect, useState } from 'react';

const POLL_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 5_000;

async function pingServer(apiBase: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// Sticky banner shown when either the browser has no internet or the API is unreachable --
// distinguishes the two so a customer isn't told "we're having trouble" for their own dropped
// wifi. Polls GET {apiBase}/health (ASP.NET's built-in health-check middleware, see Program.cs)
// with a plain fetch rather than the generated api-client, since this lives in the shared @saloon/ui
// package and has no per-app axios instance to reuse.
export function ConnectivityBanner({ apiBase }: { apiBase: string }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [serverUp, setServerUp] = useState(true);
  const isDown = !online || !serverUp;
  const message = online
    ? "We're having trouble connecting to our servers. Hang tight, we're on it."
    : "You're offline. Please check your internet connection.";

  // Keeps showing the last message while collapsing so the banner doesn't go blank mid-animation --
  // isDown flips to false a render before the height/opacity transition finishes.
  const [shownMessage, setShownMessage] = useState(message);
  useEffect(() => {
    if (isDown) setShownMessage(message);
  }, [isDown, message]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    // Skips the network call while the tab is backgrounded -- one client polling every 30s is
    // already cheap for the server, but most tabs sit hidden most of the time, so this cuts total
    // request volume a lot for free. Page Visibility API also gives us an immediate re-check the
    // moment a tab comes back to the front, so returning users aren't stuck on a stale banner.
    const check = async () => {
      if (document.hidden) return;
      const up = await pingServer(apiBase);
      if (!cancelled) setServerUp(up);
    };
    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true;
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
          className={`flex items-center justify-center gap-2 border-b border-red-900/30 bg-red-800 px-4 py-2 text-center text-xs font-semibold text-red-50 shadow-sm transition-all duration-300 dark:bg-red-900 ${
            isDown ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
          }`}
        >
          <span className="flex h-2 w-2 shrink-0 rounded-full bg-red-300 animate-pulse" />
          {shownMessage}
        </div>
      </div>
    </div>
  );
}
