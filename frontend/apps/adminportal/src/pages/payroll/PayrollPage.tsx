import { useEffect, useState, type SyntheticEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, adminPayrollApi, ApiError } from '../../api/client';
import type { Chain, Location } from '../../api/types';
import type { PayRunLineDto } from '@saloon/api-client';

type Tab = 'commission-rules' | 'pay-runs';

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

// Same "local plain-number row shapes" workaround as InventoryPage.tsx -- see its comment.
interface TherapistRow {
  id: number;
  name: string;
  locationId: number | null;
}

interface CommissionRuleRow {
  id: number;
  locationId: number;
  therapistId: number | null;
  therapistName: string | null;
  type: string;
  rate: number;
  hourlyRate: number;
  overtimeThresholdHours: number;
  overtimeRateMultiplier: number;
}

interface PayRunRow {
  id: number;
  locationId: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  finalizedDate: string | null;
  createdDate: string;
  totalCommission: number;
}

export function PayrollPage() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('commission-rules');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminCatalogApi.apiAdminCatalogChainsGet().then(({ data }) => {
      const cs = data;
      setChains(cs);
      if (cs.length > 0) setChainId(cs[0].id);
    });
  }, []);

  useEffect(() => {
    if (chainId === null) return;
    adminCatalogApi.apiAdminCatalogLocationsGet(chainId).then(({ data }) => {
      const locs = data;
      setLocations(locs);
      setLocationId(locs.length > 0 ? locs[0].id : null);
    });
  }, [chainId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Pay"
        description="Commission rules, base wages, overtime, and pay runs."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {chains.length > 1 && (
              <select
                value={chainId ?? ''}
                onChange={(e) => setChainId(Number(e.target.value))}
                className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground"
              >
                {chains.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={locationId ?? ''}
              onChange={(e) => setLocationId(Number(e.target.value))}
              className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-40"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">{error}</div>
      )}

      <div className="flex rounded-lg border border-input overflow-hidden w-fit">
        {(['commission-rules', 'pay-runs'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-xs font-semibold capitalize transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'
              }`}
          >
            {t.replace('-', ' ')}
          </button>
        ))}
      </div>

      {locationId === null ? (
        <LoadingFallback />
      ) : tab === 'commission-rules' ? (
        <CommissionRulesTab locationId={locationId} setError={setError} />
      ) : (
        <PayRunsTab locationId={locationId} setError={setError} />
      )}
    </div>
  );
}

function CommissionRulesTab({ locationId, setError }: { locationId: number; setError: (e: string | null) => void }) {
  const [rules, setRules] = useState<CommissionRuleRow[] | null>(null);
  const [therapists, setTherapists] = useState<TherapistRow[]>([]);
  const [form, setForm] = useState({
    therapistId: '',
    type: 'Percent',
    rate: '',
    hourlyRate: '0',
    overtimeThresholdHours: '40',
    overtimeRateMultiplier: '1.5',
  });
  const [saving, setSaving] = useState(false);

  function load() {
    setRules(null);
    adminPayrollApi
      .apiAdminPayrollCommissionRulesGet(locationId)
      .then(({ data }) => setRules(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load commission rules.'));
  }

  useEffect(() => {
    load();
    adminCatalogApi.apiAdminCatalogTherapistsGet().then(({ data }) => {
      setTherapists(data.filter((t) => t.locationId === locationId));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminPayrollApi.apiAdminPayrollCommissionRulesPost({
        locationId,
        therapistId: form.therapistId ? Number(form.therapistId) : 0,
        type: form.type,
        rate: Number(form.rate),
        hourlyRate: Number(form.hourlyRate || 0),
        overtimeThresholdHours: Number(form.overtimeThresholdHours || 40),
        overtimeRateMultiplier: Number(form.overtimeRateMultiplier || 1.5),
      });
      setForm({ therapistId: '', type: 'Percent', rate: '', hourlyRate: '0', overtimeThresholdHours: '40', overtimeRateMultiplier: '1.5' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save commission rule.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    try {
      await adminPayrollApi.apiAdminPayrollCommissionRulesIdDelete(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete commission rule.');
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Set Commission & Wage Rule</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Target</label>
              <select
                value={form.therapistId}
                onChange={(e) => setForm({ ...form, therapistId: e.target.value })}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="">Location default</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Commission Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="Percent">Percent of sales</option>
                <option value="Flat">Flat per service</option>
                <option value="Hourly">Hourly rate</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Commission Rate</label>
              <Input
                placeholder={form.type === 'Percent' ? 'Rate %' : 'Amount $'}
                type="number"
                min="0"
                step="0.01"
                required
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Base Rate ($/hr)</label>
              <Input
                placeholder="Base $/hr"
                type="number"
                min="0"
                step="0.5"
                value={form.hourlyRate}
                onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">OT Threshold (hrs)</label>
              <Input
                placeholder="OT Limit (hrs)"
                type="number"
                min="0"
                step="1"
                value={form.overtimeThresholdHours}
                onChange={(e) => setForm({ ...form, overtimeThresholdHours: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">OT Multiplier</label>
              <Input
                placeholder="OT Rate (e.g. 1.5)"
                type="number"
                min="1"
                step="0.1"
                value={form.overtimeRateMultiplier}
                onChange={(e) => setForm({ ...form, overtimeRateMultiplier: e.target.value })}
              />
            </div>
            <div className="lg:col-span-6 flex justify-end">
              <Button type="submit" disabled={saving} className="font-semibold px-6">
                {saving ? 'Saving...' : 'Save Rule'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        {!rules ? (
          <LoadingFallback />
        ) : rules.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No commission rules yet -- every therapist earns default rates until set.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {rules.map((r) => (
              <div key={r.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-2">
                <div>
                  <div className="font-semibold text-foreground">{r.therapistName ?? 'Location default (everyone else)'}</div>
                  <div className="text-xs text-muted-foreground space-x-2">
                    <span>
                      {r.type === 'Percent' ? `${r.rate}% commission` : r.type === 'Hourly' ? `${money(r.rate)}/hr commission` : `${money(r.rate)} flat/service`}
                    </span>
                    <span>• Base rate: {money(r.hourlyRate)}/hr</span>
                    <span>• OT after {r.overtimeThresholdHours}h @ {r.overtimeRateMultiplier}x</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => remove(r.id)}>
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function defaultPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function PayRunsTab({ locationId, setError }: { locationId: number; setError: (e: string | null) => void }) {
  const [runs, setRuns] = useState<PayRunRow[] | null>(null);
  const [period, setPeriod] = useState(defaultPeriod());
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedLines, setExpandedLines] = useState<PayRunLineDto[]>([]);

  function load() {
    setRuns(null);
    adminPayrollApi
      .apiAdminPayrollPayRunsGet(locationId)
      .then(({ data }) => setRuns(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load pay runs.'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  async function handleCreate(e: SyntheticEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await adminPayrollApi.apiAdminPayrollPayRunsPost({ locationId, periodStart: period.start, periodEnd: period.end });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create pay run.');
    } finally {
      setCreating(false);
    }
  }

  async function finalize(id: number) {
    try {
      await adminPayrollApi.apiAdminPayrollPayRunsIdFinalizePost(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to finalize pay run.');
    }
  }

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    const { data } = await adminPayrollApi.apiAdminPayrollPayRunsIdGet(id);
    setExpandedLines(data.lines ?? []);
    setExpandedId(id);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Generate Pay Run</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Period start</label>
              <input
                type="date"
                required
                value={period.start}
                onChange={(e) => setPeriod({ ...period, start: e.target.value })}
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Period end</label>
              <input
                type="date"
                required
                value={period.end}
                onChange={(e) => setPeriod({ ...period, end: e.target.value })}
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              />
            </div>
            <Button type="submit" disabled={creating} className="font-semibold">
              {creating ? 'Generating...' : 'Generate Pay Run'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        {!runs ? (
          <LoadingFallback />
        ) : runs.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No pay runs yet.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {runs.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => toggleExpand(r.id)} className="text-left">
                    <div className="font-semibold text-foreground">
                      {r.periodStart} → {r.periodEnd}
                    </div>
                    <div className="text-xs text-muted-foreground">Total pay: {money(r.totalCommission)}</div>
                  </button>
                  <div className="flex items-center gap-2">
                    <Badge status={r.status} />
                    {r.status === 'Draft' && (
                      <Button variant="outline" size="sm" onClick={() => finalize(r.id)}>
                        Finalize
                      </Button>
                    )}
                  </div>
                </div>
                {expandedId === r.id && (
                  <div className="mt-3 overflow-x-auto border-t border-border/50 pt-3">
                    <table className="w-full text-left text-xs text-muted-foreground">
                      <thead>
                        <tr className="border-b border-border/40 font-semibold text-foreground">
                          <th className="py-1">Staff</th>
                          <th className="py-1 text-right">Gross Sales</th>
                          <th className="py-1 text-right">Hours (Reg / OT)</th>
                          <th className="py-1 text-right">Commission</th>
                          <th className="py-1 text-right">Base Wage</th>
                          <th className="py-1 text-right">OT Pay</th>
                          <th className="py-1 text-right">Total Pay</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {expandedLines.map((l) => {
                          const baseWage = (l.regularHours ?? 0) * (l.hourlyRate ?? 0);
                          return (
                            <tr key={l.id ?? l.therapistName}>
                              <td className="py-2 font-medium text-foreground">{l.therapistName}</td>
                              <td className="py-2 text-right">{money(l.grossSales ?? 0)}</td>
                              <td className="py-2 text-right">
                                {l.regularHours ?? 0}h {(l.overtimeHours ?? 0) > 0 ? `+ ${l.overtimeHours}h OT` : ''}
                              </td>
                              <td className="py-2 text-right">{money(l.commissionAmount ?? 0)}</td>
                              <td className="py-2 text-right">{money(baseWage)}</td>
                              <td className="py-2 text-right text-amber-500 font-medium">{money(l.overtimePay ?? 0)}</td>
                              <td className="py-2 text-right font-bold text-foreground">{money(l.totalPay ?? 0)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {expandedLines.length === 0 && <p className="text-xs text-muted-foreground py-2">No revenue or hours in this period.</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
