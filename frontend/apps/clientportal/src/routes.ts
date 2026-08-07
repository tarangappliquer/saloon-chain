// Single source of truth for every URL this app navigates to. Nested under the same segments as
// the actual URL (e.g. routes.book.schedule lives under `/book/...`) so the module's shape mirrors
// the route tree instead of a flat list of unrelated string constants.
export const routes = {
  explore: '/explore',
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/verify-email',
  emulate: '/emulate',
  myBookings: '/my-bookings',
  profile: '/profile',
  venue: (locationId: number | string) => `/venue/${locationId}`,
  book: {
    root: '/book',
    new: (locationId?: number | string) => (locationId ? `/book?locationId=${locationId}` : '/book'),
    confirmed: '/book/confirmed',
    schedule: (bookingId: number | string) => `/book/${bookingId}/schedule`,
    summary: (bookingId: number | string) => `/book/${bookingId}/summary`,
    payment: (bookingId: number | string) => `/book/${bookingId}/payment`,
  },
} as const;

// Route path *patterns* -- the `:param` placeholders passed to <Route path="..."> -- kept next to
// the concrete-URL builders above so a param rename can't drift between the two. Mirrors the same
// nesting: routePatterns.book.schedule is the pattern behind routes.book.schedule(id).
export const routePatterns = {
  venue: '/venue/:locationId',
  book: {
    confirmed: 'confirmed',
    schedule: ':bookingId/schedule',
    summary: ':bookingId/summary',
    payment: ':bookingId/payment',
  },
} as const;
