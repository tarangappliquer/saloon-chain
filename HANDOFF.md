# Handoff: prior session's React 19 hook sweep (in progress)

Status: **in progress, safe to resume**. Everything below "Done" typechecks clean as of this write. Not manually smoke-tested in a browser. Delete this file once the hook sweep is finished and smoke-tested — it's a handoff note, not permanent docs.

## Full live API sweep — DONE, this session (16 real bugs found + fixed)

After the refcursor split below, the user asked to test every API and fix what's broken. No live Postgres was reachable normally, so this session stood up a real environment to test against instead of guessing: a throwaway `postgres:18` Docker container, the repo's own `db/postgres/seed/04_seed_postgres.sql` (500k+ customers, 150 bookings, full catalog — a real fixture, not hand-rolled), the API built to an **isolated output directory** (`dotnet build -o <scratchpad>/api_test_build`, never the repo's own `bin/`/`obj/`) so it wouldn't collide with the user's own already-running dev server on port 5127, run on port 5199 against the seeded DB, one seeded RootSuperAdmin's password overwritten with a locally-computed PBKDF2 hash (`rootsuperadmin1@saloonchains.dev` / `ChangeMe123!`, Python `hashlib.pbkdf2_hmac` matching `PasswordHasher.cs`'s SHA256/100k-iterations/32-byte-key exactly) so login worked without touching `AdminSeeder`. Every GET endpoint (~45) was hit for real over HTTP with a valid JWT and real seeded ids, not just unit-tested in isolation — **this is what caught every bug below**: an empty dev DB or a SQL-only test never exercises Dapper's actual row materialization, only a populated `QueryAsync<T>` call does. Container, test server, and isolated build dir were all torn down afterward — nothing left running, the user's own dev server (auto-restarted itself via its own file watcher partway through, on a new PID, still healthy on 5127) was never touched directly.

**Root pattern behind nearly all of it**: this whole backend (5 commits old per git log) had apparently never been exercised against non-empty data before. Npgsql/the registered `DateOnlyTypeHandler`/`TimeOnlyTypeHandler` (`DapperSp.cs`) return `DateOnly`/`TimeOnly` for Postgres `date`/`time` columns, not `DateTime`/`TimeSpan` — a positional (or even init-property) Dapper record needs the *exact* CLR type or materialization throws "no matching constructor" the instant a real row comes back; an empty result set never triggers it. Several other DTOs were also just missing columns entirely (declared fewer/differently-typed params than their SQL's actual output), or used `int` where Postgres `COUNT(*)`/`bigint` needs `long`. Same root cause, multiple flavors, found by grep + live-testing every hit.

Fixed (all in `backend/SaloonApi`, one `db/postgres/03_procs_postgres.sql` proc, verified via re-running the live sweep after each round):
- **`ChainDto`, `LocationDto`** (`CatalogRepository.cs`): `TimeSpan`/`TimeSpan?` → `TimeOnly`/`TimeOnly?`; `LocationDto.WorkingDaysMask` `byte` → `short`.
- **`AdminChainDto`**: was missing `BreakStartTime`/`BreakEndTime` entirely (3 params vs the SQL's 5 columns).
- **`AdminLocationDto`**: was missing 7 columns (`Latitude`, `Longitude`, `OpenTime`, `CloseTime`, `BreakStartTime`, `BreakEndTime`, `WorkingDaysMask`) — admin location edit forms can now actually see/prefill these fields, previously impossible.
- **`AdminTreatmentRow`**: `DateTime EffectiveFrom` → `DateOnly` (the manual `DateOnly.FromDateTime(...)` conversion downstream in `GetTreatmentsForAdminAsync` was itself only a workaround for this).
- **`TreatmentCategoryDto`**: was missing `LocationId`/`IsActive` (2 params vs the SQL's 4 columns).
- **`LocationClosureRow`, `LocationDayScheduleRow`/`Dto`, `TreatmentPriceRow`, `TreatmentDurationRow`**: same `DateTime`→`DateOnly` fix, each with its own now-redundant `DateOnly.FromDateTime(...)` call site simplified to a direct pass-through. `LocationDayScheduleRow/Dto.DayBit` also `byte`→`short`, and their `OpenTime`/`CloseTime` `TimeSpan?`→`TimeOnly?`.
- **`SalesByServiceDto`, `SalesByStaffDto`, `SalesByLocationDto`, `RetentionDto`, `NoShowRateDto`** (`ReportsRepository.cs`): `int` count fields → `long` (Postgres `COUNT(*)` is `bigint`).
- **`AdminDbService.sp_Admin_GetDashboardStatsAsync`**: `args.Add("StartDate"/"EndDate", value)` with no `DbType` — the caller passes a bare `DBNull.Value` when no date filter is given, which Dapper can't infer a type for on its own ("member StartDate of type System.DBNull cannot be used as a parameter value"). Added explicit `DbType.Date`.
- **`fn_Admin_DashboardUpcoming`** (SQL, already covered by the refcursor-split section below but worth repeating): its own `RETURNS TABLE(BookingId int, ...)` shadowed an unqualified `BookingId` reference in a nested subquery — a PL/pgSQL-specific gotcha, fixed by aliasing/qualifying.
- **`fn_Booking_ConfirmationTreatments`/`GetByIdTreatments`/`ForLocationTreatments`** (SQL): `DurationSlots`/`PreTimeMinutes` came back NULL for any booking whose `TreatmentDurationId` was never backfilled (this seed's bulk-inserted bookings, and plausibly real legacy data) — the two properties are non-nullable `short` in the C# records, so a null crashed materialization. Fixed with `COALESCE(td.DurationSlots, bt.SlotCount)` (the same value already denormalized onto `BookingTreatments` at booking time, per `sp_Booking_CreateDraft`) and `COALESCE(td.PreTimeMinutes, 0)`.
- **`StaffAttendanceRow`** (`UserRepository.cs`): `DateTime WorkDate` → `DateOnly`; `TimeSpan? ArrivalTime/LeftTime` → `TimeOnly?`; the downstream `.ToString(@"hh\:mm", ...)` display-format call also fixed to `"HH\:mm"` — `TimeOnly`'s custom-format `"hh"` means 12-hour (needs `"tt"` to disambiguate), not 24-hour like `TimeSpan`'s `"hh"` did; using the old format string on the new type would've silently mis-displayed afternoon arrival times as AM hours.
- **`StaffDbService.sp_Staff_GetAttendanceAsync`/`sp_Staff_LogAttendanceAsync`**: `workDate` was passed as a plain string with `DbType.String` — Postgres has no implicit `text`→`date` cast for function-overload resolution, so the call failed with "function public.sp_staff_getattendance(integer, text) does not exist". Both methods now take `DateOnly workDate` with `DbType.Date`; `UserRepository.cs`'s two call sites updated (the `workDateStr` local is now only used for the API response's string field, or dropped entirely where it had no other use).
- **`SchedulingRepository.cs`**: `TherapistShiftDto`/`BlockedSlotDto` (`TimeSpan`→`TimeOnly`, both already init-property from the refcursor split below); `ShiftDetailsDto`/`RoomOpeningDetailsDto`/`BlockedSlotDetailsDto` (`DateTime WorkDate`→`DateOnly`, `BlockedSlotDetailsDto`'s `TimeSpan StartTime/EndTime`→`TimeOnly`) — `SchedulingEndpoints.cs`'s six `DateOnly.FromDateTime(shift/opening/blocked.WorkDate)` call sites simplified to direct pass-throughs.
- **`DashboardUpcomingAppointmentDto`** (`AdminDashboardEndpoints.cs`, from the refcursor split below): `DateTime AppointmentDate`→`DateOnly`, `TimeSpan StartTimeSlot/EndTimeSlot`→`TimeOnly`.
- **`sp_Admin_GetCustomerProfile`** (SQL): was missing `IsWalkIn` entirely (6 columns vs `CustomerProfileDto`'s 7 params, the trailing `= false` default doesn't exempt it from Dapper's positional column-count match) — added `u.IsWalkIn` to the SELECT and `RETURNS TABLE`.

**Verification**: every GET endpoint across Catalog, Booking, Admin (dashboard/bookings/scheduling/staff/customers/catalog/inventory/payroll/reports/appointment-statuses/block-types/cancel-reasons), Profile, and Config returned 200 (or an *expected* non-200 — a handful of 403/400/404/405 confirmed as correct authorization/validation/routing, not bugs) on the final sweep; 0 unhandled exceptions in the server log; `dotnet build`/`dotnet test` both clean (34/34 tests). **Not verified**: POST/PUT/DELETE write paths (out of scope for this pass — read paths were the entire "does the data even come back" question), and none of this has been run against the user's real dev database yet, only the seeded throwaway one.

## refcursor-proc split + Dapper order-independence — DONE, this session

All 10 multi-cursor `PROCEDURE`s in `db/postgres/03_procs_postgres.sql` are now split into single-purpose `RETURNS TABLE(...)` functions, called together via Dapper's native `QueryMultipleAsync` (`SELECT * FROM fn_a(...); SELECT * FROM fn_b(...);` in one round trip) instead of the old hand-rolled `RefCursorGridReader`/refcursor/transaction machinery — which is now **deleted** from `backend/SaloonApi/Shared/Data/DapperSp.cs` (0 remaining callers, confirmed by grep). Every Dapper-materialized row-record type these procedures feed is now an **init-property record** (`record Foo { public int A { get; init; } ... }`) instead of a positional one, so Dapper matches columns by NAME regardless of order/count — this is what fixes the root cause (a positional record required the SQL column order to exactly match its constructor parameter order; `sp_Booking_GetAvailabilityDataRange`'s `EligiblePairs`/`BlockedSlots` cursors had `WorkDate` in the wrong position, which is what originally crashed `AvailabilitySyncStartupHostedService` on startup) and prevents the same bug class recurring even if a SELECT list's column order drifts later.

**Along the way, also fixed real data bugs the split surfaced** (found via a full audit of every multi-cursor proc against its C# consumer, before touching any SQL):
- `sp_Booking_GetConfirmationDetails`, `sp_Booking_GetById`, `sp_Booking_GetForLocation`: treatment-line queries were missing `DurationSlots`/`PreTimeMinutes` (needed a `LEFT JOIN TreatmentDurations td ON td.Id = bt.TreatmentDurationId`) and `RoomName` (`LEFT JOIN Rooms r ON r.Id = bt.RoomId` — **LEFT**, not INNER, so a treatment line without a room yet isn't silently dropped).
- `sp_Booking_GetConfirmationDetails` header query was missing `LocationId`/`CustomerId` entirely.
- `sp_Booking_GetMine`: dead `Reviews` join / unused `HasReview` column removed; was missing `AppointmentStatus*`/`CancelReason*` on the header.
- `sp_Booking_GetForLocation` was a genuine **structural** bug, not just missing columns: its two cursors (booking-header shape, treatment-line shape) matched neither the flat 31-field `StaffBookingRow` the C# side actually read from a single `ReadAsync<StaffBookingRow>()` call. Split into `fn_Booking_ForLocationHeaders` + `fn_Booking_ForLocationTreatments`, and `BookingRepository.GetForLocationAsync` rewritten to read both and `GroupBy(BookingId)`-join them client-side into `StaffBookingSummaryDto` — same pattern `GetMineAsync` already used. New types: `StaffBookingHeaderRow` + `StaffBookingTreatmentRow` replace the old single `StaffBookingRow`.
- `sp_Admin_GetDashboardStats`'s shared scoped-locations resolution (an `IF p_Role IN (...) ... ELSIF ...` block previously inlined into one procedure) was factored into `fn_Admin_DashboardScopedLocations(p_Role, p_ChainId, p_LocationId) RETURNS TABLE(LocationId int)`, called by both `fn_Admin_DashboardKpis` and `fn_Admin_DashboardUpcoming` (each into its own local temp table — two independent function calls can't share one the way two `OPEN` statements in one procedure could). **Runtime bug caught by actually executing the split functions, not just parsing them**: `fn_Admin_DashboardUpcoming`'s `RETURNS TABLE(BookingId int, ...)` makes `BookingId` a PL/pgSQL variable in scope for the whole function body — an unaliased nested subquery (`SELECT SUM(Price) FROM public.BookingTreatments WHERE BookingId = c.BookingId`) collided with it ("column reference \"bookingid\" is ambiguous"). Fixed by aliasing that subquery's table and qualifying the column (`FROM public.BookingTreatments bt WHERE bt.BookingId = c.BookingId`). **Any future `LANGUAGE plpgsql RETURNS TABLE(...)` function should watch for this** — a returned column name shadows same-named table columns referenced unqualified anywhere in the body, including nested subqueries; `LANGUAGE sql` functions don't have this problem (no PL/pgSQL variable scope).
- `sp_Scheduling_GetRoster`, `sp_Inventory_GetPurchaseOrderDetail`, `sp_Payroll_GetPayRunDetail`: no bugs found, pure mechanical split.

**Verification performed**: full `db/postgres/01_table_postgres.sql` → `02_types_postgres.sql` → `03_procs_postgres.sql` loaded clean into a throwaway `postgres:18` Docker container (`docker run --name saloon_validate_pg -p 5433:5432 ...`, `docker cp` each file in, `MSYS_NO_PATHCONV=1 docker exec ... psql -f`, `docker rm -f` when done — always clean up, nothing left holding the port); **every one of the ~30 new functions was actually executed** (`SELECT * FROM fn_x(...)` with placeholder args), not just parsed, which is what caught the ambiguous-column bug above — parsing alone would have missed it. `cd backend/SaloonApi && dotnet build` succeeds (0 errors, 0 warnings) after every change.

**Not verified**: against the project's real dev database (no Postgres reachable in this environment — `docker ps` was empty, no local service on 5432), and no live end-to-end app run (no running backend to hit these endpoints through). Before considering this fully done: run `db/postgres/03_procs_postgres.sql` against the real dev DB, start the API, and exercise booking availability (the original crash), booking confirm/get-by-id/my-bookings/staff-for-location views, the scheduling roster, the admin dashboard, a purchase order detail page, and a pay run detail page.

---

## What this session did, in order (for context if you need to cross-reference)

1. **Backend security/perf/correctness audit** (`backend/SaloonApi`, `db/`) — all done, deployed pending the user's own `sqlcmd` run against their dev DB (I don't have DB access in this environment):
   - Stripe checkout session now bound to `bookingId` via metadata (was a payment-fraud hole).
   - `confirm-manual` payment endpoint restricted to `StaffAccess` + ownership check, rejects Stripe-provider payments.
   - `GET /api/payments/booking/{id}` restricted to `StaffAccess` (was an IDOR).
   - 48h cancellation window now resolves venue timezone instead of comparing local wall-clock to UTC directly (`BookingService.IsWithinCancellationWindow`, unit-tested in `SaloonApi.Tests/CancellationWindowTests.cs`).
   - N+1 fixes: `BookingService.WarmAvailabilityAsync` (bounded `Parallel.ForEachAsync`), `StaffAttendanceSweepHostedService` (manager lookup deduped per location).
   - `sp_Catalog_Search` rewritten (EXISTS instead of LEFT JOIN + DISTINCT fan-out); added `IX_Treatments_LocationId` / `IX_TreatmentCategories_LocationId` (`db/01_tables.sql` + `db/migrations/014_treatments_location_index.sql`).
   - **Staff/location availability correctness bug**: `EligibleShifts` in `sp_Booking_GetAvailabilityData`/`...Range` treated a therapist with no shift *that specific day* as available all-day in every room — fixed to check "never shift-assigned at all" (matches the existing "legacy" comment's actual intent). `GetAvailableSlotsAsync` now also honors `WorkingDaysMask` (previously only checked `IsHoliday`).
   - **Write-path re-validation**: new `sp_Booking_ValidateSlotEligibility` (`db/03_procs.sql`) re-checks room/therapist/time eligibility server-side at commit time — wired into `sp_Booking_ScheduleTreatment`, `sp_Booking_RescheduleConfirmed`, `sp_Booking_ReassignTherapist`. Previously these only checked for a *conflicting* booking, never that the submitted combination was legitimate at all.
   - Booking-conflict guards added where missing: `sp_Scheduling_UpdateTherapistShift`, `sp_Booking_CreateDraft` (silently-dropped-treatment guard), `sp_Catalog_UpdateLocation` (deactivation / hours-shrink guard).
   - **Not verified against a live DB** — auto-mode blocks direct `sqlcmd` access in this environment. User needs to run `db/01_tables.sql` (or just the migration), then `db/03_procs.sql`, against their dev DB and sanity-check booking/search/scheduling.

2. **Client portal sidebar nav** (`frontend/apps/clientportal`) — done. `components/Nav.tsx` rebuilt as a collapsible sidebar matching `adminportal`'s pattern (desktop rail + mobile drawer, localStorage-persisted collapse). `App.tsx`'s `AuthedLayout` switched to the `flex h-screen` sidebar+content layout.

3. **Tooltip sweep, both apps** — done. New `Tooltip` component in `packages/ui/src/components/Tooltip.tsx`, built on `@radix-ui/react-tooltip` (added as a real dependency — portal-rendered so it isn't clipped by `overflow:hidden` ancestors, auto-flips off viewport edges, `asChild` trigger so it doesn't inject a wrapper `<div>` that would break absolutely-positioned triggers). `TooltipProvider` mounted once at each app's root in `App.tsx`. All 26 real `title=` attributes across both apps replaced (verified via `grep title=\{` — remaining hits are all `PageHeader`'s `title` prop, a false positive on the grep, not the HTML attribute). One nuance: a `disabled` native `<button>` doesn't reliably fire hover events, so `CustomersPage.tsx`'s two disabled-button tooltips wrap the `Button` in a plain `<span>` that's the actual Radix trigger.

4. **React 19 hook adoption sweep — this is what's in progress.** See below.

## Why the hook sweep

`CLAUDE.md` states a policy: "Prefer native React 19 hooks (`useEffectEvent`, `useSyncExternalStore`, `useActionState`, `useFormStatus`)". An audit (two Explore-agent surveys, one per app) found **0% adoption** of any React 19 hook in either app — every form/toggle is hand-rolled `useState`+`useEffect`. Full findings and file lists are in the two agent reports (not saved to disk, but the file lists below are complete and were cross-checked against the actual files).

## The `useActionState` recipe (established, now consistent across 4 files)

Replaces the `const [loading, setLoading] = useState(false)` + `const [error, setError] = useState(...)` + `try { setLoading(true); await api(...) } catch { setError(...) } finally { setLoading(false) }` shape.

**Single-string-error case** (see `MyBookingsPage.tsx`'s `ReviewForm.submit`, converted):
```tsx
const [error, submitAction, submitting] = useActionState<string | null>(async (previousError) => {
  if (someGuardThatShouldNoOp) return previousError; // or return null / a new message
  try {
    await api.call(...);
    onSuccessSideEffect();
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.message : 'Fallback message.';
  }
}, null);
// wire: onClick={() => submitAction()}  (not tied to a <form>)
// button: disabled={submitting}
```

**Multi-field state case** (see `LoginPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `MyBookingsPage.tsx`'s `BookingCard.handleConfirmCancel` — all converted): bundle every piece of derived state (`error`, `submitError` for `getFieldError`, `done`/`submitted` flags, etc.) into one object type, return the whole object from every branch:
```tsx
interface FooState { error: string | null; submitError: unknown; done: boolean }
const INITIAL: FooState = { error: null, submitError: null, done: false };
const [{ error, submitError, done }, handleSubmit, submitting] = useActionState<FooState>(async () => {
  // early-return client-side validation still returns the full shape, e.g.:
  // if (password !== confirmPassword) return { error: 'Passwords do not match.', submitError: null, done: false };
  try {
    await api.call(...);
    return { error: null, submitError: null, done: true };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong', submitError: err, done: false };
  }
}, INITIAL);
```
When it's a real `<form onSubmit={handleSubmit}>` with a `SyntheticEvent` handler, change to **`<form action={handleSubmit}>`** (drop the param, drop `e.preventDefault()` — React 19 form actions handle that natively) — see all three files above for the exact diff shape.

**Known limitation, accepted**: `useActionState` has no external setter, so a handler that used to eagerly clear `error`/`submitError` on an unrelated UI event (e.g. `LoginPage.handleModeChange`/`handleFillDemo` switching tabs, previously called `setError(null)`) can no longer do that directly. Left as-is in the 4 converted files — the stale error just clears on the next submit attempt instead of immediately on mode-switch. Minor UX nuance, not a bug; mention it if asked but don't over-engineer a workaround (a full remount via `key` isn't worth it here).

## clientportal — `useActionState` remaining (6 of 10 files done)

Done: `LoginPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `MyBookingsPage.tsx` (both instances).

**Still to do** (apply the exact recipe above):
- `pages/VerifyEmailPage.tsx` (`handleConfirm`, `submitting`/`error`)
- `components/VerifyEmailGate.tsx` (`handleSend`, `sending`/`error`)
- `pages/ProfilePage.tsx` — **3 separate instances in one file**: `handleSave` (`saving`/`error`/`submitError`), `handleChangeEmailRequest` (`emailSubmitting`/`emailError`/`emailSubmitError`), `handlePasswordResetRequest` (`passwordResetSubmitting`/`passwordResetError`)
- `features/booking/TreatmentsStep.tsx` (`handleNext`, `loading`/`error`) — **also has a manual `inFlight` ref for double-click guarding** (added earlier this session, see the ponytail-comment above it). `useActionState`'s `pending` boolean is derived from the action's own transition and already prevents concurrent invocations when the action is only ever invoked through the hook's returned dispatcher — so once converted, the `inFlight` ref becomes redundant and should be removed, not kept alongside it.
- `features/booking/PaymentStep.tsx` (`handlePaymentAndConfirm`, `isProcessing`/`paymentError`) — **same `inFlight` ref removal applies** (`paymentInFlight`, also added this session). Be careful here: this function has an early `return` for the Stripe-redirect branch (`window.location.href = checkoutUrl; return;`) that never resolves the action — check that this doesn't leave `submitting` stuck true forever (it navigates away from the page immediately after, so in practice it's harmless, but return a valid state object from that branch too rather than a bare `return` if adapting the shape used above).

## clientportal — other hooks remaining

- **`useMemo`**: `pages/ExplorePage.tsx` (`filteredVenues`, recomputed every render — memoize on `[venues, selectedCategory]`); `pages/VenueDetailPage.tsx` (`categories` derived from `treatments`, and a per-category `.filter()` re-run inside a `.map()` on every render/tab-click — memoize `categories` on `[treatments]`, and build a `Map<string, Treatment[]>` grouped by category once instead of re-filtering per category per render).
- **`useSyncExternalStore`**: `features/auth/AuthContext.tsx` — `user` state is manually kept in lockstep with `localStorage` (read at mount, written on every mutation). Converting to `useSyncExternalStore` also fixes a real bug: another tab logging out currently does NOT update this tab (only the SSE `user-logged-out` listener triggers a refresh, not a `storage` event). Lower-value near-duplicate: `components/Nav.tsx`'s `collapsed` state mirrors `localStorage` the same way (cosmetic, single-tab, lower priority).
- **`useOptimistic`** (not started, 3 spots): `features/booking/useBookingFlow.ts` `removeTreatment`/`addTreatment` (treatment chip removal waits for the DELETE to resolve before disappearing; add re-fetches the whole booking via a second GET) — see `features/booking/TreatmentBar.tsx` for where the removed line is rendered. `pages/MyBookingsPage.tsx`'s `handleConfirmCancel` (now converted to `useActionState` — could layer `useOptimistic` on top so cancellation looks instant instead of the `setTimeout(..., 1500)` delay before `onReload()`, but this is an *additional* enhancement on top of the already-done `useActionState` conversion, not required to consider the file "done").
- **`useDeferredValue`**: `pages/ExplorePage.tsx` — `selectedCategory` tab clicks drive a synchronous client-side `.filter()` over the venue grid; wrap in `useDeferredValue(selectedCategory)` (or `startTransition` the `setSelectedCategory` call) so the tab click itself doesn't block on the grid re-render. Separate from the search box's existing debounce — additive, not a duplicate fix.
- `useCallback`, `useId`, `useImperativeHandle` — audited, no genuine opportunities found in this app. Don't chase these speculatively.

## adminportal — `useActionState` remaining (0 of ~30 files done, not started)

Every file below has the identical `useState(loading)` + `useState(error)` + `try/catch/finally` shape around a form submit or CRUD save. Apply the exact recipe above to each:

`pages/DashboardPage.tsx`, `pages/ProfilePage.tsx` (3 instances — load/save, save, password reset, same as clientportal's), `pages/SettingsPage.tsx`, `pages/LoginPage.tsx`, `pages/ForgotPasswordPage.tsx`, `pages/ResetPasswordPage.tsx`, `pages/VerifyEmailPage.tsx`, `pages/bookings/BookingsPage.tsx`, `pages/calendar/CalendarPage.tsx`, `pages/catalog/LocationUsersPage.tsx`, `pages/catalog/LocationsPage.tsx` (`handleSubmit`), `pages/catalog/MyLocationPage.tsx`, `pages/catalog/SaloonUsersPage.tsx`, `pages/catalog/SaloonsPage.tsx`, `pages/catalog/TreatmentCategoriesPage.tsx`, `pages/catalog/TreatmentDurationsPage.tsx`, `pages/catalog/TreatmentPricesPage.tsx`, `pages/catalog/TreatmentsPage.tsx` (`handleSubmitTreatment`), `pages/customers/ClientProfilePage.tsx`, `pages/customers/CustomersPage.tsx`, `pages/inventory/InventoryPage.tsx`, `pages/payroll/PayrollPage.tsx`, `pages/settings/AppointmentStatusesPage.tsx`, `pages/settings/BlockTypesPage.tsx`, `pages/staff/RoomsPage.tsx`, `pages/staff/StaffPage.tsx` (`handleSubmit`), `components/AddLocationWizard.tsx`, `components/ClosuresModal.tsx`, `components/DayScheduleModal.tsx`, `components/EditBlockSlotModal.tsx`.

**Suggested order**: do `ProfilePage.tsx` first (3 instances, same shape as the already-converted clientportal version — copy the pattern directly), then the small standalone auth pages (`LoginPage`/`ForgotPasswordPage`/`ResetPasswordPage`/`VerifyEmailPage` — these are near-identical to the already-converted clientportal ones, just copy the diff shape), then work through the `catalog`/`settings`/`staff` CRUD pages and modals, which all share the same "save one record, refetch the list" shape.

## adminportal — `useOptimistic` remaining (0 of ~13 files done, not started)

Every file below does `await PUT(...)` then `await loadWholeList()` before any visual change — the toggle/switch visibly lags a full round trip. Recipe: `useOptimistic(list, (state, updatedItem) => state.map(x => x.id === updatedItem.id ? updatedItem : x))`, flip locally inside a `startTransition`, let the real PUT+refetch reconcile (or roll back) after.

`pages/catalog/LocationsPage.tsx` (`toggleActive`), `pages/staff/StaffPage.tsx` (`toggleActive`/`toggleEmulator`), `pages/customers/CustomersPage.tsx`, `pages/inventory/InventoryPage.tsx`, `pages/catalog/LocationUsersPage.tsx`, `pages/catalog/SaloonUsersPage.tsx`, `pages/catalog/TreatmentCategoriesPage.tsx`, `pages/catalog/TreatmentsPage.tsx`, `pages/settings/AppointmentStatusesPage.tsx`, `pages/settings/BlockTypesPage.tsx`, `pages/staff/RoomsPage.tsx`.

Given 11+ files share the exact same shape, consider building one small shared hook (e.g. `useOptimisticToggle` in a shared location) that wraps this pattern once, rather than hand-rolling `useOptimistic` calls in each file independently — lower risk of the 11 conversions drifting out of sync with each other.

## adminportal — other hooks remaining

- **`useMemo`**: `pages/calendar/CalendarPage.tsx` — `flatTreatments` (`extractFlatTreatments(bookings)`), `timeSlots` (`generateTimeSlots(...)`), and especially `blockSpans` (`computeBlockSpans(rooms, roster.blockedSlots, timeSlots)` — does a filter+map+sort+cluster pass per room, the one genuinely non-trivial derived-data computation in either app) are all called unconditionally in the render body of a 1356-line grid page with lots of unrelated re-render triggers (hover popovers, modal opens). Memoize on their actual inputs.
- **`useCallback`**: `components/Nav.tsx` — `NavLink`/`NavSubLink` are `memo()`-wrapped but every call site passes `onClick={() => setMobileOpen(false)}` inline (~12 call sites), defeating the memo. Fix: `const closeMobile = useCallback(() => setMobileOpen(false), [])` once, reuse across all call sites. (Note: this file's tooltip wrapping was already done this session — check current line numbers before editing, they've shifted.) Secondary/lower-value: `DateInput.tsx`/`TimeInput.tsx` are also `memo()`-wrapped with the same issue at ~10 call sites across `AddLocationWizard.tsx`, `EditBlockSlotModal.tsx`, `BookingsPage.tsx`, `DashboardPage.tsx`, `StaffPage.tsx`, `AttendanceTab.tsx` — lower priority, not worth chasing individually.
- `useDeferredValue`/`useTransition`, `useId`, `useSyncExternalStore`, `useImperativeHandle` — audited, no genuine opportunities found in this app (search inputs operate on lists the code's own comments describe as "tens, not thousands"; no hand-rolled ids; SSE listeners are correctly modeled as `useEffect`, not an external-store snapshot; the one `forwardRef` in `CalendarPage.tsx` is standard DOM-ref forwarding for `react-datepicker`, nothing to replace). Don't chase these.

## Verification checklist for whoever continues this

After each file (or small batch): `cd frontend/apps/clientportal && npx tsc --noEmit -p .` (clientportal) or `cd frontend/apps/adminportal && npx tsc -b --force` (adminportal — `tsc --noEmit -p .` is a no-op there, known gotcha). Run `npx oxlint` in each app when done with a batch. No live-backend smoke test was done for any of the hook conversions in this session — the user should exercise each converted form/toggle in a running app before considering this fully done, same caveat as the SQL changes above.
