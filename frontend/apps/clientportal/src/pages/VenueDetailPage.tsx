import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { catalogApi } from '../api/client';
import type { Location, Treatment } from '../api/types';

interface Specialist {
  id: number;
  name: string;
  role: string;
  rating: number;
  avatarUrl: string;
}

const SAMPLE_SPECIALISTS: Specialist[] = [
  { id: 1, name: 'Elena Rostova', role: 'Senior Hair Stylist & Colorist', rating: 4.9, avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80' },
  { id: 2, name: 'Marcus Vance', role: 'Master Barber & Groomer', rating: 5.0, avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80' },
  { id: 3, name: 'Sophia Chen', role: 'Nail Technician & Artist', rating: 4.8, avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80' },
];

export function VenueDetailPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const [location, setLocation] = useState<Location | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [activeTab, setActiveTab] = useState<'services' | 'team' | 'reviews' | 'about'>('services');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!locationId) return;
      try {
        const treatmentsRes = await catalogApi.apiCatalogTreatmentsGet(Number(locationId));
        setTreatments(treatmentsRes.data as unknown as Treatment[]);

        // Mock location details if no dedicated get endpoint
        setLocation({
          id: Number(locationId),
          chainId: 1,
          name: Number(locationId) === 2 ? 'The Crown Barbershop - Westside' : 'Luxe Beauty Lounge - Downtown',
          address: '123 Fashion Street, Suite 100, Central City',
          openTime: '09:00:00',
          closeTime: '20:00:00',
          workingDaysMask: 127,
          timeZoneId: 'UTC',
        });
      } catch {
        setTreatments([
          { id: 101, categoryId: 1, categoryName: 'Hair & Styling', name: 'Signature Haircut & Blowdry', price: 45, durationSlots: 2 },
          { id: 102, categoryId: 1, categoryName: 'Hair & Styling', name: 'Full Balayage & Toning', price: 120, durationSlots: 4 },
          { id: 103, categoryId: 2, categoryName: 'Nails', name: 'Gel Manicure & Hand Care', price: 35, durationSlots: 2 },
          { id: 104, categoryId: 3, categoryName: 'Facial & Skincare', name: 'Deep Hydrating Glow Facial', price: 75, durationSlots: 3 },
        ]);
        setLocation({
          id: Number(locationId) || 1,
          chainId: 1,
          name: 'Luxe Beauty Lounge - Downtown',
          address: '123 Fashion Street, Suite 100',
          openTime: '09:00:00',
          closeTime: '20:00:00',
          workingDaysMask: 127,
          timeZoneId: 'UTC',
        });
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [locationId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 animate-pulse">
        <div className="h-64 rounded-3xl bg-card/60" />
        <div className="h-10 w-64 rounded-xl bg-card/60" />
      </div>
    );
  }

  // Group treatments by category
  const categories = Array.from(new Set(treatments.map((t) => t.categoryName || 'General Services')));

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      {/* Cover Banner & Salon Summary Header */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-lg">
        <div className="h-64 w-full bg-slate-900 relative">
          <img
            src="https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80"
            alt="Venue Cover"
            className="h-full w-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-linear-to-t from-slate-950 via-slate-950/40 to-transparent" />

          {/* Top Badge */}
          <div className="absolute top-4 left-4 rounded-full bg-black/60 px-3.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
            Verified Partner • ShoppeyVerified
          </div>
        </div>

        {/* Header Info Bar */}
        <div className="p-6 sm:p-8 relative space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl">
                {location?.name ?? 'Luxe Salon Venue'}
              </h1>
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <span>📍 {location?.address ?? 'Central Location'}</span>
                <span>•</span>
                <span className="text-emerald-500 font-semibold">Open today (9:00 AM - 8:00 PM)</span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/book')}
              className="rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 transition"
            >
              Book Appointment
            </button>
          </div>

          <div className="flex items-center gap-6 border-t border-border pt-4 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-foreground">
              <span className="text-amber-500 text-sm">★</span>
              <span>4.9</span>
              <span className="text-muted-foreground font-normal">(184 reviews)</span>
            </div>
            <div className="text-muted-foreground font-medium">Instant Confirmation</div>
            <div className="text-muted-foreground font-medium">Pay at venue or online</div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center border-b border-border gap-8 text-sm font-semibold">
        {(['services', 'team', 'reviews', 'about'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`pb-3 capitalize transition-all ${activeTab === tab
                ? 'border-b-2 border-primary text-primary font-bold'
                : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'services' && (
        <div className="space-y-8">
          {categories.map((cat) => {
            const catTreatments = treatments.filter((t) => (t.categoryName || 'General Services') === cat);
            return (
              <div key={cat} className="space-y-4">
                <h2 className="text-lg font-bold text-foreground border-b border-border pb-2">{cat}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {catTreatments.map((treatment) => (
                    <div
                      key={treatment.id}
                      className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs transition hover:border-primary/50"
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-foreground text-base">{treatment.name}</h3>
                          <span className="text-base font-extrabold text-foreground">${treatment.price}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Duration: {treatment.durationSlots * 15} mins • Includes consultation & finishing.
                        </p>
                      </div>

                      <div className="mt-4 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => navigate('/book')}
                          className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-bold text-primary hover:bg-primary hover:text-white transition"
                        >
                          + Select Service
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'team' && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {SAMPLE_SPECIALISTS.map((s) => (
            <div key={s.id} className="flex flex-col items-center text-center rounded-2xl border border-border bg-card p-6 space-y-3">
              <img src={s.avatarUrl} alt={s.name} className="h-20 w-20 rounded-full object-cover shadow-md" />
              <div>
                <h3 className="font-bold text-foreground">{s.name}</h3>
                <p className="text-xs text-muted-foreground">{s.role}</p>
              </div>
              <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-300">
                ★ {s.rating.toFixed(1)} Specialist
              </span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {[
            { id: 1, author: 'Sarah M.', rating: 5, date: 'Yesterday', comment: 'Amazing service! Elena did a fantastic job on my haircut and color. Highly recommend this venue!' },
            { id: 2, author: 'David K.', rating: 5, date: '3 days ago', comment: 'Clean, professional barbering environment. Marcus knows exactly what cut fits best.' },
          ].map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground">{r.author}</span>
                <span className="text-muted-foreground">{r.date}</span>
              </div>
              <div className="flex items-center gap-1 text-amber-500 text-xs">
                {'★'.repeat(r.rating)}
              </div>
              <p className="text-xs text-foreground/90">{r.comment}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'about' && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4 text-xs text-foreground">
          <h3 className="text-sm font-bold">About the Salon</h3>
          <p className="leading-relaxed text-muted-foreground">
            Luxe Salon Lounge offers premium hair styling, grooming, skin rejuvenation, and spa treatments. Equipped with state-of-the-art facilities and staffed by certified professionals.
          </p>
          <div className="border-t border-border pt-4 space-y-2">
            <h4 className="font-bold text-foreground">Opening Hours</h4>
            <p className="text-muted-foreground">Monday - Sunday: 09:00 AM - 08:00 PM</p>
          </div>
        </div>
      )}
    </div>
  );
}
