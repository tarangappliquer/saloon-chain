import { Link, useLocation } from 'react-router-dom';
import { routes } from '../routes';

const TABS = [
  { to: routes.catalog.treatmentCategories, label: 'Categories' },
  { to: routes.catalog.treatments(), label: 'Treatments' },
  { to: routes.catalog.treatmentPrices(), label: 'Prices' },
  { to: routes.catalog.treatmentDurations(), label: 'Durations' },
];

export function TreatmentCatalogTabs({ chainId, locationId }: { chainId: number | null; locationId: number | null }) {
  const location = useLocation();
  const qs = new URLSearchParams();
  if (chainId !== null) qs.set('chainId', String(chainId));
  if (locationId !== null) qs.set('locationId', String(locationId));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  return (
    <div className="flex items-center gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = location.pathname === t.to;
        return (
          <Link
            key={t.to}
            to={`${t.to}${suffix}`}
            className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
