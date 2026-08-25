import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { configApi } from '../../api/client';

interface PortalConfigContextValue {
  readonly adminPortalUrl: string;
  readonly refetch: () => void;
}

// Cross-portal links (e.g. EmulationBanner's "back to admin" link) are the only thing this powers --
// nothing core to the app depends on it, so a failed fetch must not block the app. Defaults to '' and
// stays that way on error; ConnectivityBanner (rendered unconditionally in App.tsx) is what tells the
// user the server is unreachable, and calls refetch() once its health check confirms recovery.
const PortalConfigContext = createContext<PortalConfigContextValue>({ adminPortalUrl: '', refetch: () => {} });

export function PortalConfigProvider({ children }: { children: ReactNode }) {
  const [adminPortalUrl, setAdminPortalUrl] = useState('');

  const fetchConfig = useCallback((signal?: AbortSignal) => {
    configApi
      .apiConfigClientportalGet({ signal })
      .then((res) => setAdminPortalUrl(res.data.adminPortalUrl))
      .catch(() => {});
  }, []);

  // AbortController tied to mount -- StrictMode's dev-only mount/cleanup/remount cycle would
  // otherwise fire this GET twice; aborting on cleanup collapses it back to one real request.
  useEffect(() => {
    const controller = new AbortController();
    fetchConfig(controller.signal);
    return () => controller.abort();
  }, [fetchConfig]);

  const refetch = useCallback(() => fetchConfig(), [fetchConfig]);

  const value = useMemo(() => ({ adminPortalUrl, refetch }), [adminPortalUrl, refetch]);

  return <PortalConfigContext value={value}>{children}</PortalConfigContext>;
}

// oxlint-disable-next-line react/only-export-components
export function usePortalConfig() {
  return use(PortalConfigContext);
}
