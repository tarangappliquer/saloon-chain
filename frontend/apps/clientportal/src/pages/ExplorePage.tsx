import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@saloon/ui';
import { catalogApi } from '../api/client';
import type { Location, Treatment } from '../api/types';
import { routes } from '../routes';
import { useAuth } from '../features/auth/AuthContext';

interface VenueCardData extends Location {
  chainName: string;
  rating: number | null;
  reviewCount: number;
  imageUrl: string;
  categories: string[];
  treatmentNames: string[];
  startingPrice: number;
}

const SAMPLE_IMAGES = [
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?auto=format&fit=crop&w=800&q=80',
];

export function ExplorePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [venues, setVenues] = useState<VenueCardData[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>(['All']);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const isFirstLoad = useRef(true);
  // Per-location treatment lists rarely change -- cache across searches so re-typing a query
  // doesn't re-fetch every already-seen venue's treatments on every keystroke.
  const treatmentsCache = useRef(new Map<number, Treatment[]>());
  // Bumped on every effect run so a slow, superseded search response can't overwrite a
  // faster, newer one's results (e.g. "sp" resolving after "spa").
  const requestId = useRef(0);

  useEffect(() => {
    requestId.current += 1;
    const myRequestId = requestId.current;

    async function loadVenues() {
      setLoading(true);
      try {
        const searchRes = await catalogApi.apiCatalogSearchGet(searchQuery.trim() || undefined);
        let searchResults = searchRes.data as unknown as Array<
          Location & { chainName: string; averageRating: number | null; reviewCount: number | null }
        >;

        // Emulated staff can only ever book at their own scope (enforced server-side too, in
        // BookingEndpoints) -- Manager/Receptionist see just their one location, SuperAdmin/Admin
        // see their whole chain, RootSuperAdmin (neither id set) sees everything.
        if (user?.isEmulated) {
          if (user.emulatorLocationId) {
            searchResults = searchResults.filter((loc) => loc.id === user.emulatorLocationId);
          } else if (user.emulatorChainId) {
            searchResults = searchResults.filter((loc) => loc.chainId === user.emulatorChainId);
          }
        }

        const allCatsSet = new Set<string>();

        const venueList: VenueCardData[] = await Promise.all(
          searchResults.map(async (loc, idx) => {
            let locationCategories: string[] = [];
            let treatmentNames: string[] = [];
            let startingPrice = 25;

            try {
              let treats = treatmentsCache.current.get(loc.id);
              if (!treats) {
                const treatsRes = await catalogApi.apiCatalogTreatmentsGet(loc.id);
                treats = treatsRes.data as unknown as Treatment[];
                treatmentsCache.current.set(loc.id, treats);
              }
              if (treats && treats.length > 0) {
                locationCategories = Array.from(new Set(treats.map((t) => t.categoryName).filter(Boolean)));
                treatmentNames = treats.map((t) => t.name).filter(Boolean);
                startingPrice = Math.min(...treats.map((t) => t.price));
              }
            } catch {
              // Ignore treatment fetch error for specific location
            }

            if (locationCategories.length === 0) {
              locationCategories = ['Hair & Styling', 'Barbershop', 'Nails & Manicure'];
            }
            locationCategories.forEach((cat) => allCatsSet.add(cat));

            return {
              ...loc,
              chainName: loc.chainName || 'Shoppey Saloon Chain',
              rating: loc.averageRating,
              reviewCount: loc.reviewCount ?? 0,
              imageUrl: SAMPLE_IMAGES[(loc.id + idx) % SAMPLE_IMAGES.length],
              categories: locationCategories,
              treatmentNames: treatmentNames,
              startingPrice: startingPrice,
            };
          }),
        );

        if (requestId.current !== myRequestId) return;
        setAvailableCategories(['All', ...Array.from(allCatsSet)]);
        setVenues(venueList);
      } catch {
        if (requestId.current !== myRequestId) return;
        // Fallback demo data if API call returns empty
        setVenues([
          {
            id: 1,
            chainId: 1,
            name: 'Luxe Beauty Lounge - Downtown',
            chainName: 'Luxe Salon Chain',
            address: '123 Fashion Street, Suite 100',
            openTime: '09:00:00',
            closeTime: '20:00:00',
            workingDaysMask: 127,
            timeZoneId: 'UTC',
            rating: 4.9,
            reviewCount: 184,
            imageUrl: SAMPLE_IMAGES[0],
            categories: ['Hair & Styling', 'Nails & Manicure', 'Skincare & Facials'],
            treatmentNames: ['Signature Haircut & Blowdry', 'Gel Manicure', 'Deep Hydrating Glow Facial'],
            startingPrice: 35,
          },
          {
            id: 2,
            chainId: 1,
            name: 'The Crown Barbershop - Westside',
            chainName: 'Luxe Salon Chain',
            address: '456 Grand Avenue',
            openTime: '08:00:00',
            closeTime: '19:00:00',
            workingDaysMask: 127,
            timeZoneId: 'UTC',
            rating: 4.8,
            reviewCount: 96,
            imageUrl: SAMPLE_IMAGES[1],
            categories: ['Barbershop', 'Hair & Styling'],
            treatmentNames: ['Executive Haircut', 'Beard Trim & Shave'],
            startingPrice: 25,
          },
        ]);
        setAvailableCategories(['All', 'Hair & Styling', 'Barbershop', 'Nails & Manicure', 'Skincare & Facials']);
      } finally {
        if (requestId.current === myRequestId) setLoading(false);
      }
    }

    const delay = isFirstLoad.current ? 0 : 300;
    isFirstLoad.current = false;
    const timer = setTimeout(() => {
      loadVenues();
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [searchQuery, user?.isEmulated, user?.emulatorChainId, user?.emulatorLocationId]);

  // Deferring just the category driving this filter (not the whole venues/selectedCategory pair)
  // keeps a tab click's own highlight-state re-render immediate while the grid re-render behind it
  // is allowed to lag a frame -- separate from the already-debounced network search above.
  const deferredCategory = useDeferredValue(selectedCategory);
  const filteredVenues = useMemo(
    () =>
      venues.filter(
        (venue) =>
          deferredCategory === 'All' ||
          venue.categories.some((cat) => cat.toLowerCase().includes(deferredCategory.toLowerCase())),
      ),
    [venues, deferredCategory],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      {/* Hero Banner Header */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-r from-primary/90 via-primary/70 to-indigo-900 p-8 text-white shadow-xl sm:p-12">
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold backdrop-blur-md">
            <span>✨ Shoppey Marketplace</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Book top-rated salons & spa specialists
          </h1>
          <p className="text-sm font-medium text-white/80 sm:text-base">
            Discover premier beauty venues, compare services, pick your preferred specialist, and book instant appointments.
          </p>

          {/* Search Box */}
          <div className="pt-2">
            <div className="flex flex-col gap-2 rounded-2xl bg-white p-2 text-slate-900 shadow-2xl sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-2 px-3 py-2">
                <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search saloon, location, treatment, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>
              <button
                type="button"
                className="rounded-xl bg-primary px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-primary/90 transition"
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Decorative Background Accents */}
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 right-24 h-48 w-48 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none" />
      </div>

      {/* Category Filter Chips */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Popular Categories</h2>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          {availableCategories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all duration-150 ${active
                  ? 'bg-primary text-white shadow-md shadow-primary/25 scale-105'
                  : 'border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Venues Listing */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">Featured Venues</h2>
          <span className="text-xs font-medium text-muted-foreground">{filteredVenues.length} salons available</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-72 animate-pulse rounded-2xl border border-border bg-card/50" />
            ))}
          </div>
        ) : filteredVenues.length === 0 ? (
          <EmptyState
            title="No Venues Found"
            description="No salons or venues matched your search criteria or selected filter category."
            actionLabel="Reset Search & Filters"
            onAction={() => {
              setSearchQuery('');
              setSelectedCategory('All');
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredVenues.map((venue) => (
              <div
                key={venue.id}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
              >
                {/* Cover Image */}
                <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                  <img
                    src={venue.imageUrl}
                    alt={venue.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {venue.rating !== null && (
                    <div className="absolute top-3 right-3 rounded-full bg-card/90 px-2.5 py-1 text-xs font-bold text-foreground backdrop-blur-md flex items-center gap-1 shadow-sm">
                      <span className="text-amber-500">★</span>
                      <span>{venue.rating.toFixed(1)}</span>
                      <span className="text-muted-foreground text-[10px]">({venue.reviewCount})</span>
                    </div>
                  )}
                </div>

                {/* Details Body */}
                <div className="flex flex-1 flex-col p-5 justify-between space-y-4">
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                      {venue.chainName}
                    </span>
                    <h3 className="text-lg font-bold leading-snug text-foreground group-hover:text-primary transition">
                      {venue.name}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {venue.address ?? 'City Center Venue'}
                    </p>
                  </div>

                  {/* Categories list */}
                  <div className="flex flex-wrap gap-1">
                    {venue.categories.map((c) => (
                      <span key={c} className="rounded-md bg-accent/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {c}
                      </span>
                    ))}
                  </div>

                  {/* Bottom Footer Action */}
                  <div className="flex items-center justify-between border-t border-border pt-4">
                    <div>
                      <span className="block text-[10px] text-muted-foreground">Treatments from</span>
                      <span className="text-base font-extrabold text-foreground">${venue.startingPrice}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(routes.venue(venue.id))}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-primary/90 transition"
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
