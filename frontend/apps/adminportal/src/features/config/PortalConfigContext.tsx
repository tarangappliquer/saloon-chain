import { createContext, use, useContext, type ReactNode } from 'react';
import { portalConfigRequest } from '../../api/client';

interface PortalConfigContextValue {
  readonly clientPortalUrl: string;
}

const PortalConfigContext = createContext<PortalConfigContextValue | null>(null);

// Must render inside the Suspense boundary in App.tsx -- use() suspends on portalConfigRequest
// until GET /api/config/adminportal resolves, and re-throws a failed request during render so the
// ErrorBoundary above Suspense catches it instead of the app running with no clientportal URL.
export function PortalConfigProvider({ children }: { children: ReactNode }) {
  const config = use(portalConfigRequest);
  return <PortalConfigContext.Provider value={{ clientPortalUrl: config.clientPortalUrl }}>{children}</PortalConfigContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components
export function usePortalConfig() {
  const ctx = useContext(PortalConfigContext);
  if (!ctx) throw new Error('usePortalConfig must be used within PortalConfigProvider');
  return ctx;
}
