import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/catalog/treatment-categories', label: 'Categories' },
  { to: '/catalog/treatments', label: 'Treatments' },
  { to: '/catalog/treatment-prices', label: 'Prices' },
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
