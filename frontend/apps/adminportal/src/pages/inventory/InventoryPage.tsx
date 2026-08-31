import { useEffect, useState, useOptimistic, startTransition, type SyntheticEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, adminInventoryApi, ApiError } from '../../api/client';
import type { Chain, Location } from '../../api/types';
import type { PurchaseOrderLineDto } from '@saloon/api-client';

type Tab = 'products' | 'suppliers' | 'purchase-orders' | 'stocktakes';

// Local plain-number shapes for the generated DTOs -- the openapi-generator emits branded
// placeholder types (e.g. numeric fields typed as an empty interface named after whichever
// operation first referenced that shape) for several fields here, same as Room/Location/Chain
// elsewhere in api/types.ts. Casting responses to these avoids fighting that on every read.
interface ProductRow {
  id: number;
  locationId: number;
  supplierId: number | null;
  supplierName: string | null;
  name: string;
  sku: string | null;
  price: number;
  quantityOnHand: number;
  reorderThreshold: number;
  isActive: boolean;
}

interface SupplierRow {
  id: number;
  chainId: number;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
}

interface PurchaseOrderRow {
  id: number;
  locationId: number;
  supplierId: number;
  supplierName: string;
  status: string;
  receivedDate: string | null;
  createdDate: string;
  totalCost: number;
}

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as Tab | null;
  const tab: Tab = urlTab && ['products', 'suppliers', 'purchase-orders', 'stocktakes'].includes(urlTab) ? urlTab : 'products';

  const setTab = (newTab: Tab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', newTab);
      return next;
    });
  };

  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
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
    // Backend already clamps this to the caller's own location for Manager (see
    // AdminCatalogEndpoints.GetLocations) -- no client-side filtering needed.
    adminCatalogApi.apiAdminCatalogLocationsGet(chainId).then(({ data }) => {
      const locs = data;
      setLocations(locs);
      setLocationId(locs.length > 0 ? locs[0].id : null);
    });
  }, [chainId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Retail products, suppliers, and purchase orders."
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
              className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[160px]"
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
        {(['products', 'suppliers', 'purchase-orders', 'stocktakes'] as const).map((t) => (
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
      ) : tab === 'products' ? (
        <ProductsTab locationId={locationId} setError={setError} />
      ) : tab === 'suppliers' ? (
        <SuppliersTab chainId={chainId} setError={setError} />
      ) : tab === 'purchase-orders' ? (
        <PurchaseOrdersTab locationId={locationId} chainId={chainId} setError={setError} />
      ) : (
        <StocktakesTab locationId={locationId} setError={setError} />
      )}
    </div>
  );
}

function ProductsTab({ locationId, setError }: { locationId: number; setError: (e: string | null) => void }) {
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [optimisticProducts, setOptimisticProducts] = useOptimistic(
    products,
    (state, action: { type: 'toggle' | 'delete'; id: number }) => {
      if (!state) return state;
      if (action.type === 'delete') return state.filter((p) => p.id !== action.id);
      if (action.type === 'toggle') return state.map((p) => (p.id === action.id ? { ...p, isActive: !p.isActive } : p));
      return state;
    },
  );
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [form, setForm] = useState({ name: '', sku: '', price: '', quantityOnHand: '0', reorderThreshold: '5', supplierId: '' });
  const [saving, setSaving] = useState(false);

  function load() {
    setProducts(null);
    adminInventoryApi
      .apiAdminInventoryProductsGet(locationId)
      .then(({ data }) => setProducts(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load products.'));
  }

  useEffect(() => {
    load();
    adminInventoryApi.apiAdminInventorySuppliersGet(undefined).then(({ data }) => setSuppliers(data)).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminInventoryApi.apiAdminInventoryProductsPost({
        locationId,
        supplierId: form.supplierId ? Number(form.supplierId) : 0,
        name: form.name,
        sku: form.sku || '',
        price: Number(form.price),
        quantityOnHand: Number(form.quantityOnHand),
        reorderThreshold: Number(form.reorderThreshold),
      });
      setForm({ name: '', sku: '', price: '', quantityOnHand: '0', reorderThreshold: '5', supplierId: '' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create product.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: ProductRow) {
    setError(null);
    startTransition(() => {
      setOptimisticProducts({ type: 'toggle', id: p.id });
    });
    try {
      await adminInventoryApi.apiAdminInventoryProductsIdPut(p.id, {
        supplierId: p.supplierId ?? 0,
        name: p.name,
        sku: p.sku ?? '',
        price: p.price,
        reorderThreshold: p.reorderThreshold,
        isActive: !p.isActive,
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update product.');
      load();
    }
  }

  async function remove(id: number) {
    setError(null);
    startTransition(() => {
      setOptimisticProducts({ type: 'delete', id });
    });
    try {
      await adminInventoryApi.apiAdminInventoryProductsIdDelete(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete product.');
      load();
    }
  }

  const lowStockCount = products ? products.filter((p) => p.quantityOnHand <= p.reorderThreshold).length : 0;

  return (
    <div className="space-y-6">
      {lowStockCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-500 text-xs font-semibold">
          <span>⚠️ {lowStockCount} retail product{lowStockCount > 1 ? 's are' : ' is'} at or below reorder threshold.</span>
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Add Product</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <Input placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="col-span-2" />
            <Input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            <Input placeholder="Price" type="number" step="0.01" min="0" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <Input placeholder="Stock" type="number" min="0" value={form.quantityOnHand} onChange={(e) => setForm({ ...form, quantityOnHand: e.target.value })} />
            <Input placeholder="Reorder at" type="number" min="0" value={form.reorderThreshold} onChange={(e) => setForm({ ...form, reorderThreshold: e.target.value })} />
            <select
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground col-span-2"
            >
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={saving} className="font-semibold">
              {saving ? 'Adding...' : 'Add Product'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-x-auto">
        {!optimisticProducts ? (
          <LoadingFallback />
        ) : optimisticProducts.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No products yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="p-3">Name</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Price</th>
                <th className="p-3">Stock</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {optimisticProducts.map((p) => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="p-3 font-medium text-foreground">{p.name}</td>
                  <td className="p-3 text-muted-foreground">{p.sku ?? '—'}</td>
                  <td className="p-3">{money(p.price)}</td>
                  <td className="p-3">
                    <span className={p.quantityOnHand <= p.reorderThreshold ? 'font-semibold text-destructive' : ''}>{p.quantityOnHand}</span>
                    {p.quantityOnHand <= p.reorderThreshold && <span className="ml-2 text-[10px] text-destructive">LOW STOCK</span>}
                  </td>
                  <td className="p-3">
                    <Badge status={p.isActive ? 'Active' : 'Inactive'} />
                  </td>
                  <td className="p-3 text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => toggleActive(p)}>
                      {p.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => remove(p.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function SuppliersTab({ chainId, setError }: { chainId: number | null; setError: (e: string | null) => void }) {
  const [suppliers, setSuppliers] = useState<SupplierRow[] | null>(null);
  const [form, setForm] = useState({ name: '', contactEmail: '', contactPhone: '' });
  const [saving, setSaving] = useState(false);

  function load() {
    setSuppliers(null);
    adminInventoryApi
      .apiAdminInventorySuppliersGet(chainId ?? undefined)
      .then(({ data }) => setSuppliers(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load suppliers.'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId]);

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminInventoryApi.apiAdminInventorySuppliersPost({
        name: form.name,
        contactEmail: form.contactEmail || '',
        contactPhone: form.contactPhone || '',
        chainId: chainId ?? undefined,
      });
      setForm({ name: '', contactEmail: '', contactPhone: '' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create supplier.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    try {
      await adminInventoryApi.apiAdminInventorySuppliersIdDelete(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete supplier.');
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Add Supplier</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <Input placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Contact email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            <Input placeholder="Contact phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            <Button type="submit" disabled={saving} className="font-semibold">
              {saving ? 'Adding...' : 'Add Supplier'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        {!suppliers ? (
          <LoadingFallback />
        ) : suppliers.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No suppliers yet.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {suppliers.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-semibold text-foreground">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{[s.contactEmail, s.contactPhone].filter(Boolean).join(' · ') || 'No contact info'}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => remove(s.id)}>
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

interface DraftLine {
  productId: string;
  quantity: string;
  unitCost: string;
}

function PurchaseOrdersTab({ locationId, chainId, setError }: { locationId: number; chainId: number | null; setError: (e: string | null) => void }) {
  const [orders, setOrders] = useState<PurchaseOrderRow[] | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ productId: '', quantity: '1', unitCost: '' }]);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedLines, setExpandedLines] = useState<PurchaseOrderLineDto[]>([]);

  function load() {
    setOrders(null);
    adminInventoryApi
      .apiAdminInventoryPurchaseOrdersGet(locationId)
      .then(({ data }) => setOrders(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load purchase orders.'));
  }

  useEffect(() => {
    load();
    adminInventoryApi.apiAdminInventorySuppliersGet(chainId ?? undefined).then(({ data }) => setSuppliers(data)).catch(() => { });
    adminInventoryApi.apiAdminInventoryProductsGet(locationId).then(({ data }) => setProducts(data)).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, chainId]);

  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminInventoryApi.apiAdminInventoryPurchaseOrdersPost({
        locationId,
        supplierId: Number(supplierId),
        lines: lines
          .filter((l) => l.productId)
          .map((l) => ({ productId: Number(l.productId), quantity: Number(l.quantity), unitCost: Number(l.unitCost) })),
      });
      setSupplierId('');
      setLines([{ productId: '', quantity: '1', unitCost: '' }]);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create purchase order.');
    } finally {
      setSaving(false);
    }
  }

  async function receive(id: number) {
    try {
      await adminInventoryApi.apiAdminInventoryPurchaseOrdersIdReceivePost(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to receive purchase order.');
    }
  }

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    const { data } = await adminInventoryApi.apiAdminInventoryPurchaseOrdersIdGet(id);
    setExpandedLines(data.lines ?? []);
    setExpandedId(id);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>New Purchase Order</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
              className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground w-full max-w-xs"
            >
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 items-center">
                  <select
                    value={line.productId}
                    onChange={(e) => updateLine(idx, { productId: e.target.value })}
                    className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground col-span-2"
                  >
                    <option value="">Select product...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Input type="number" min="1" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                  <div className="flex gap-2">
                    <Input type="number" min="0" step="0.01" placeholder="Unit cost" value={line.unitCost} onChange={(e) => updateLine(idx, { unitCost: e.target.value })} />
                    <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))} disabled={lines.length === 1}>
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, { productId: '', quantity: '1', unitCost: '' }])}>
                + Add Line
              </Button>
            </div>

            <Button type="submit" disabled={saving} className="font-semibold">
              {saving ? 'Creating...' : 'Create Purchase Order'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        {!orders ? (
          <LoadingFallback />
        ) : orders.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No purchase orders yet.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {orders.map((po) => (
              <div key={po.id} className="p-4">
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => toggleExpand(po.id)} className="text-left">
                    <div className="font-semibold text-foreground">{po.supplierName}</div>
                    <div className="text-xs text-muted-foreground">{money(po.totalCost)} · {new Date(po.createdDate).toLocaleDateString()}</div>
                  </button>
                  <div className="flex items-center gap-2">
                    <Badge status={po.status} />
                    {po.status === 'Ordered' && (
                      <Button variant="outline" size="sm" onClick={() => receive(po.id)}>
                        Mark Received
                      </Button>
                    )}
                  </div>
                </div>
                {expandedId === po.id && (
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground border-t border-border/50 pt-3">
                    {expandedLines.map((l) => (
                      <li key={l.id ?? l.productName}>
                        {l.productName} — {l.quantityOrdered} × {money(l.unitCost ?? 0)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StocktakesTab({ locationId, setError }: { locationId: number; setError: (e: string | null) => void }) {
  const [products, setProducts] = useState<ProductRow[] | null>(null);

  function load() {
    setProducts(null);
    adminInventoryApi
      .apiAdminInventoryProductsGet(locationId)
      .then(({ data }) => setProducts(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load stock audit.'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-foreground">Stocktake & Inventory Audit</h2>
          <p className="text-xs text-muted-foreground">Verify physical stock counts against recorded quantities on hand.</p>
        </div>
        <Button size="sm" variant="outline" onClick={load}>
          Refresh Audit
        </Button>
      </div>

      {products === null ? (
        <LoadingFallback />
      ) : products.length === 0 ? (
        <EmptyState title="No Inventory Items" description="No products available for stock count at this location." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">On Hand</th>
                <th className="px-4 py-3">Reorder Point</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p) => {
                const isLow = p.quantityOnHand <= p.reorderThreshold;
                return (
                  <tr key={p.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">{p.sku || '--'}</td>
                    <td className="px-4 py-3 font-bold">{p.quantityOnHand}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.reorderThreshold}</td>
                    <td className="px-4 py-3">
                      {isLow ? (
                        <Badge variant="danger">Low Stock Alert</Badge>
                      ) : (
                        <Badge variant="secondary">In Stock</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
