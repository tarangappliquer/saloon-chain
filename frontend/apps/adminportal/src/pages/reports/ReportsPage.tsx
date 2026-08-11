import { useEffect, useState } from 'react';
import { Button, Card, KpiTile, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, adminReportsApi, API_BASE, ApiError, getAuthToken } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location } from '../../api/types';

type Tab = 'sales-by-service' | 'sales-by-staff' | 'sales-by-location' | 'retention' | 'no-show-rate';

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function defaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: start.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

async function downloadCsv(path: string, filename: string, setError: (e: string | null) => void) {
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` } });
    if (!res.ok) throw new Error('Export failed.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    setError('Failed to export CSV.');
  }
}

interface RevenueRow {
  bookingCount: number;
  totalRevenue: number;
}

function RevenueBarList({ rows, labelOf }: { rows: RevenueRow[]; labelOf: (r: RevenueRow) => string }) {
  const max = Math.max(...rows.map((r) => r.totalRevenue), 1);
  return (
    <div className="space-y-3">
      {rows.map((r, idx) => (
        <div key={idx}>
          <div className="flex items-baseline justify-between text-xs mb-1">
            <span className="font-medium text-foreground">{labelOf(r)}</span>
            <span className="text-muted-foreground">{money(r.totalRevenue)} · {r.bookingCount} bookings</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(r.totalRevenue / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface SalesByServiceRow extends RevenueRow {
  treatmentId: number;
  treatmentName: string;
  categoryName: string;
}
interface SalesByStaffRow extends RevenueRow {
  therapistId: number;
  therapistName: string;
}
interface SalesByLocationRow extends RevenueRow {
  locationId: number;
  locationName: string;
}
interface RetentionRow {
  totalCustomers: number;
  returningCustomers: number;
  retentionRatePercent: number;
}
interface NoShowRow {
  totalAppointments: number;
  noShowCount: number;
  noShowRatePercent: number;
}

export function ReportsPage() {
  const { user } = useAuth();
  const canSeeChainRollup = user?.role === 'RootSuperAdmin' || user?.role === 'SuperAdmin' || user?.role === 'Admin';

  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [range, setRange] = useState(defaultRange());
  const [tab, setTab] = useState<Tab>('sales-by-service');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminCatalogApi.apiAdminCatalogChainsGet().then(({ data }) => {
      const cs = data as unknown as Chain[];
      setChains(cs);
      if (cs.length > 0) setChainId(cs[0].id);
    });
  }, []);

  useEffect(() => {
    if (chainId === null) return;
    adminCatalogApi.apiAdminCatalogLocationsGet(chainId).then(({ data }) => {
      const locs = data as unknown as Location[];
      setLocations(locs);
      setLocationId(locs.length > 0 ? locs[0].id : null);
    });
  }, [chainId]);

  const tabs: Tab[] = ['sales-by-service', 'sales-by-staff', ...(canSeeChainRollup ? (['sales-by-location'] as const) : []), 'retention', 'no-show-rate'];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Sales, retention, and no-show trends."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {chains.length > 1 && (
              <select value={chainId ?? ''} onChange={(e) => setChainId(Number(e.target.value))} className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground">
                {chains.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {tab !== 'sales-by-location' && (
              <select value={locationId ?? ''} onChange={(e) => setLocationId(Number(e.target.value))} className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[160px]">
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground" />
          </div>
        }
      />

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">{error}</div>}

      <div className="flex flex-wrap rounded-lg border border-input overflow-hidden w-fit">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-xs font-semibold capitalize transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'}`}
          >
            {t.replace(/-/g, ' ')}
          </button>
        ))}
      </div>

      {locationId === null ? (
        <LoadingFallback />
      ) : tab === 'sales-by-service' ? (
        <SalesByServicePanel locationId={locationId} range={range} setError={setError} />
      ) : tab === 'sales-by-staff' ? (
        <SalesByStaffPanel locationId={locationId} range={range} setError={setError} />
      ) : tab === 'sales-by-location' ? (
        <SalesByLocationPanel chainId={chainId} range={range} setError={setError} />
      ) : tab === 'retention' ? (
        <RetentionPanel locationId={locationId} range={range} setError={setError} />
      ) : (
        <NoShowPanel locationId={locationId} range={range} setError={setError} />
      )}
    </div>
  );
}

function SalesByServicePanel({ locationId, range, setError }: { locationId: number; range: { from: string; to: string }; setError: (e: string | null) => void }) {
  const [rows, setRows] = useState<SalesByServiceRow[] | null>(null);

  useEffect(() => {
    setRows(null);
    adminReportsApi
      .apiAdminReportsSalesByServiceGet(locationId, range.from, range.to)
      .then(({ data }) => setRows(data as unknown as SalesByServiceRow[]))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load report.'));
  }, [locationId, range, setError]);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCsv(`/api/admin/reports/sales-by-service?locationId=${locationId}&from=${range.from}&to=${range.to}&format=csv`, 'sales-by-service.csv', setError)}
        >
          Export CSV
        </Button>
      </div>
      {!rows ? <LoadingFallback /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No Confirmed sales in this range.</p> : (
        <RevenueBarList rows={rows} labelOf={(r) => `${(r as SalesByServiceRow).treatmentName} (${(r as SalesByServiceRow).categoryName})`} />
      )}
    </Card>
  );
}

function SalesByStaffPanel({ locationId, range, setError }: { locationId: number; range: { from: string; to: string }; setError: (e: string | null) => void }) {
  const [rows, setRows] = useState<SalesByStaffRow[] | null>(null);

  useEffect(() => {
    setRows(null);
    adminReportsApi
      .apiAdminReportsSalesByStaffGet(locationId, range.from, range.to)
      .then(({ data }) => setRows(data as unknown as SalesByStaffRow[]))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load report.'));
  }, [locationId, range, setError]);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCsv(`/api/admin/reports/sales-by-staff?locationId=${locationId}&from=${range.from}&to=${range.to}&format=csv`, 'sales-by-staff.csv', setError)}
        >
          Export CSV
        </Button>
      </div>
      {!rows ? <LoadingFallback /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No Confirmed sales in this range.</p> : (
        <RevenueBarList rows={rows} labelOf={(r) => (r as SalesByStaffRow).therapistName} />
      )}
    </Card>
  );
}

function SalesByLocationPanel({ chainId, range, setError }: { chainId: number | null; range: { from: string; to: string }; setError: (e: string | null) => void }) {
  const [rows, setRows] = useState<SalesByLocationRow[] | null>(null);

  useEffect(() => {
    if (chainId === null) return;
    setRows(null);
    adminReportsApi
      .apiAdminReportsSalesByLocationGet(chainId, range.from, range.to)
      .then(({ data }) => setRows(data as unknown as SalesByLocationRow[]))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load report.'));
  }, [chainId, range, setError]);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => chainId !== null && downloadCsv(`/api/admin/reports/sales-by-location?chainId=${chainId}&from=${range.from}&to=${range.to}&format=csv`, 'sales-by-location.csv', setError)}
        >
          Export CSV
        </Button>
      </div>
      {!rows ? <LoadingFallback /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No Confirmed sales in this range.</p> : (
        <RevenueBarList rows={rows} labelOf={(r) => (r as SalesByLocationRow).locationName} />
      )}
    </Card>
  );
}

function RetentionPanel({ locationId, range, setError }: { locationId: number; range: { from: string; to: string }; setError: (e: string | null) => void }) {
  const [data, setData] = useState<RetentionRow | null>(null);

  useEffect(() => {
    setData(null);
    adminReportsApi
      .apiAdminReportsRetentionGet(locationId, range.from, range.to)
      .then(({ data }) => setData(data as unknown as RetentionRow))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load report.'));
  }, [locationId, range, setError]);

  if (!data) return <LoadingFallback />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <KpiTile title="Customers in range" value={data.totalCustomers} />
      <KpiTile title="Returning customers" value={data.returningCustomers} />
      <KpiTile title="Retention rate" value={`${data.retentionRatePercent}%`} changeType={data.retentionRatePercent >= 40 ? 'positive' : 'neutral'} />
    </div>
  );
}

function NoShowPanel({ locationId, range, setError }: { locationId: number; range: { from: string; to: string }; setError: (e: string | null) => void }) {
  const [data, setData] = useState<NoShowRow | null>(null);

  useEffect(() => {
    setData(null);
    adminReportsApi
      .apiAdminReportsNoShowRateGet(locationId, range.from, range.to)
      .then(({ data }) => setData(data as unknown as NoShowRow))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load report.'));
  }, [locationId, range, setError]);

  if (!data) return <LoadingFallback />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <KpiTile title="Appointments in range" value={data.totalAppointments} />
      <KpiTile title="No-shows" value={data.noShowCount} />
      <KpiTile title="No-show rate" value={`${data.noShowRatePercent}%`} changeType={data.noShowRatePercent > 10 ? 'negative' : 'positive'} />
    </div>
  );
}
