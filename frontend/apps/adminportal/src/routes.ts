type Id = number | string;
type QueryParams = Record<string, Id | null | undefined>;

function withQuery(path: string, params?: QueryParams): string {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

// Single source of truth for every URL this app navigates to. Nested under the same segments as
// the actual URL (e.g. routes.catalog.locations lives under `/catalog/...`) so the module's shape
// mirrors the route tree instead of a flat list of unrelated string constants.
export const routes = {
  root: '/',
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/verify-email',
  profile: '/profile',
  myLocation: '/my-location',
  bookings: '/bookings',
  customers: '/customers',
  pos: '/pos',
  scheduling: (params?: { chainId?: Id | null; locationId?: Id | null; view?: string }) =>
    withQuery('/scheduling', params),
  catalog: {
    saloons: '/catalog/saloons',
    saloonUsers: (chainId?: Id | null) => withQuery('/catalog/saloons/users', { chainId }),
    locations: (chainId?: Id | null) => withQuery('/catalog/locations', { chainId }),
    locationUsers: (chainId?: Id | null, locationId?: Id | null) =>
      withQuery('/catalog/locations/users', { chainId, locationId }),
    treatmentCategories: '/catalog/treatment-categories',
    treatments: (chainId?: Id | null, locationId?: Id | null) =>
      withQuery('/catalog/treatments', { chainId, locationId }),
    treatmentPrices: (chainId?: Id | null, locationId?: Id | null, treatmentId?: Id | null) =>
      withQuery('/catalog/treatment-prices', { chainId, locationId, treatmentId }),
    treatmentDurations: (chainId?: Id | null, locationId?: Id | null, treatmentId?: Id | null) =>
      withQuery('/catalog/treatment-durations', { chainId, locationId, treatmentId }),
  },
  staff: {
    users: '/staff/users',
    therapists: '/staff/therapists',
    rooms: (chainId?: Id | null, locationId?: Id | null) => withQuery('/staff/rooms', { chainId, locationId }),
  },
  // Shared "← Back" target used across every catalog/staff/scheduling sub-page: Managers (who are
  // scoped to one location) go home to My Location, everyone else goes back up to the location
  // list they drilled in from (or the saloon list if no chain is selected yet).
  catalogBack(isManager: boolean, chainId?: Id | null): string {
    if (isManager) return routes.myLocation;
    return chainId ? routes.catalog.locations(chainId) : routes.catalog.saloons;
  },
} as const;
