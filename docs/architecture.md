# SaloonChains — Architecture & Flow

Reference for any agent (human or AI) working in this repo. Read this before touching code —
it explains not just *what* exists but *why*, so new work extends the pattern instead of
fighting it. The product spec is [`docs/initial-project-apec.md`](initial-project-apec.md);
this document describes what's actually built against that spec, plus the conventions to
follow when building the rest.

## 1. What this repo is

A multi-tenant salon/treatment booking platform (`docs/initial-project-apec.md`) for multiple
saloon chains, each with multiple locations, rooms, therapists, and treatments. Currently
implemented: **one vertical slice, end to end** — customer registration/login, browsing
treatments, and the full booking flow (select treatments → pick date → pick slot → temporary
hold → confirm), wired through the real database, cache, and real-time layers. Nothing here is
mocked or stubbed — every piece that exists is production-shaped, just narrow in scope.

**Not built yet** (deliberately, not by oversight — see §8 for the full scope map): admin
portal UI, RBAC beyond a single "Customer" role, shift/room-assignment CRUD, analytics,
payments, SignalR. Their DB tables mostly already exist; only the application code is missing.

## 2. Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Backend | .NET 10, ASP.NET Core Minimal APIs | Modular monolith, clean-architecture-per-module |
| Data access | Dapper + `Microsoft.Data.SqlClient` | **No EF Core.** Stored procedures only — see §4 |
| Database | SQL Server | Plain `.sql` scripts in `db/`, no migration framework yet |
| Cache | Redis (`StackExchange.Redis`) | Cache-aside for availability reads only, never the correctness path |
| Real-time | Server-Sent Events (native `EventSource`) | SignalR is specified but not yet needed — see §8 |
| Auth | JWT bearer (`System.IdentityModel.Tokens.Jwt`) | No ASP.NET Identity (pulls in EF) |
| Validation | FluentValidation | Generic `IEndpointFilter`, not manual `ValidateAsync` calls — see §5 |
| Errors | `IExceptionHandler` + `ProblemDetails` | One global handler, no per-endpoint `try`/`catch` — see §5 |
| Logging | Serilog, JSON-formatted | Console + daily-rolling file (`logs/log-YYYYMMDD.json`, 31-day retention); enriched with machine name, environment, thread id, and a per-request correlation id — see §5 |
| Frontend | React 19 + Vite + TypeScript | Two separate SPAs: `adminportal` (scaffold only), `clientportal` (built) |
| Styling | Tailwind CSS 4 | `clientportal` only so far |
| Routing | `react-router-dom` | Client-side only, no SSR |
| Testing | xUnit (backend), none yet (frontend) | See §9 |

## 3. Repo layout

```text
backend/
  SaloonApi/                 -- the API project (see §5 for internal structure)
  SaloonApi.Tests/            -- xUnit tests, currently just SlotCalculatorTests.cs
frontend/
  adminportal/                -- Vite/React scaffold, UNBUILT (default template still)
  clientportal/                -- Vite/React app, BUILT (the customer booking flow)
db/
  01_tables.sql .. 06_seed.sql -- run in numeric order, see §4
  tests/test_booking_hold_conflict.sql -- manual concurrency check, see §9
docs/
  initial-project-apec.md    -- original product spec
  architecture.md            -- this file
SaloonChains.slnx             -- solution file, references backend/ and frontend/ projects
```

Both `backend/` and `frontend/` are plain folders (not solution-enforced) — the `.slnx` groups
projects into matching virtual folders, but nothing stops a project living outside this
convention. Follow it anyway: new backend projects go under `backend/`, new frontend apps
under `frontend/`.

## 4. Database — stored procedures are not optional

**Every** query and write goes through a stored procedure, called via Dapper with
`CommandType.StoredProcedure`. This is a hard project requirement (see the spec), not a style
preference. There is no inline SQL anywhere in the C# code, and there must never be — a coding
agent adding a new query writes a new `.sql` proc file first, then a thin Dapper call.

### Run order

```text
db/01_tables.sql     -- all tables
db/02_types.sql      -- dbo.IntIdList table type (TVP for passing int lists into procs)
db/03_procs_catalog.sql
db/04_procs_booking.sql
db/05_procs_auth.sql
db/06_seed.sql        -- demo chain/location/rooms/treatments/therapists/shifts + 1 holiday
```

Re-run any proc file any time — every proc uses `CREATE OR ALTER`. Tables/seed are not
idempotent (plain `CREATE TABLE` / `INSERT`); dropping and recreating the database is the
reset path in dev.

### Schema

```text
SaloonChains → Locations → Rooms
             → TreatmentCategories → Treatments → LocationTreatments (per-location price override)
Locations → LocationHolidays        (one-off closures on top of the weekly pattern)
Locations → ShiftAssignments        (which Therapist works Morning/Evening on which WorkDate)
Rooms     → RoomCategoryAssignments (which TreatmentCategory a Room serves, per shift/date)
Customers
Bookings → BookingTreatments        (a booking = 1 room + 1 therapist + 1+ treatments back-to-back)
```

Key modeling decision: **a booking is one contiguous block** — one room, one therapist,
covering all selected treatments sequentially. This matches the spec's flow (pick multiple
treatments → get one set of available times → pick one time) and keeps slot math tractable.
If a future requirement needs split-therapist or split-room bookings, that's a real schema
change, not a tweak.

Time granularity: 5-minute slots. `Treatments.DurationSlots` is a count of 5-minute units
(e.g. `6` = 30 minutes), not a duration in minutes — this must stay consistent everywhere it's
read (`SlotCalculator`, seed data, any new treatment-duration UI).

### Every table has the same 6 audit columns

`IsDelete`, `IsActive`, `CreatedBy`, `CreatedDate`, `UpdatedBy`, `UpdatedDate` — on every table,
no exceptions. This is a project-wide convention, not something scoped to the booking flow, so a
new table added anywhere gets all 6.

- `IsDelete BIT NOT NULL DEFAULT 0` — soft-delete flag. Nothing sets it yet (no delete feature is
  built), but every `SELECT` proc already filters `WHERE IsDelete = 0` so the column is inert
  until a delete feature lands, not retrofitted then.
- `IsActive BIT NOT NULL DEFAULT 1` — a few tables (`Locations`, `Treatments`,
  `LocationTreatments`) already had this before the convention existed; it's the same column,
  not a duplicate.
- `CreatedBy`/`UpdatedBy INT NULL` — the current logged-in user's id, i.e. `ICurrentUser.CustomerId`
  (§5). **Nullable is load-bearing, not laziness**: self-registration has no logged-in user yet
  when the `Customers` row is created; the hold-expiry background sweep (`sp_Booking_ExpireStaleHolds`)
  has no HTTP request/user at all; seed-script rows have no user either. All three are NULL by
  design — NULL means "no logged-in user did this," not "forgot to set it." No FK to `Customers`:
  once RBAC lands there will be several kinds of "user" (staff roles), not just customers, so
  there's no single FK target yet.
- `CreatedDate DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()` / `UpdatedDate DATETIME2 NULL` — set
  by the column default on insert; procs that update a row set `UpdatedDate = SYSUTCDATETIME()`
  explicitly (there's no trigger-based auto-update — see `sp_Booking_Confirm`/`Cancel` for the
  pattern).

**Where `CreatedBy` is passed in from C#**: the repository reads `ICurrentUser.CustomerId`
directly and passes it as `@CreatedBy`/`@UpdatedBy` — see `CustomerRepository.CreateAsync` and
`BookingRepository.CreateHoldAsync`/`ConfirmAsync`/`CancelAsync`. Note `Bookings.CreatedBy` is
**not** the same thing as `Bookings.CustomerId`: `CustomerId` is who the booking is *for* (the
business FK), `CreatedBy` is who *created the row*. They're identical today because customers can
only book for themselves, but that stops being true the moment an admin/receptionist can book on
a customer's behalf (per spec) — `CustomerId` would be the customer, `CreatedBy` the staff member.
**When writing a new INSERT/UPDATE proc, add `@CreatedBy`/`@UpdatedBy` parameters (default `NULL`)
and thread them from the calling repository's `ICurrentUser` the same way** — don't skip this
because "it's just like the others," the whole point is that it's on every table.

`Locations.WorkingDaysMask` is a `TINYINT` bitmask, `bit0 = Monday .. bit6 = Sunday`. Converting
a `DayOfWeek` to a bit: `((int)dayOfWeek + 6) % 7` (see `BookingService.GetAvailableDatesAsync`).

### Stored procedures (by file)

`03_procs_catalog.sql`: `sp_Catalog_GetChains`, `sp_Catalog_GetLocations`,
`sp_Catalog_GetTreatments`, `sp_Catalog_GetLocationHolidays`.

`04_procs_booking.sql` — the correctness-critical ones:

- `sp_Booking_GetAvailabilityData` — **pure read**. Given a location, treatment-id list (TVP),
  and date, returns 4 result sets: location hours + `IsHoliday` flag, the requested treatments'
  duration/category, eligible (room, therapist) pairs for that date's shifts, and existing
  bookings that day. No slot math happens in SQL — see §6.
- `sp_Booking_CreateHold` — **the correctness boundary**. Wraps `sp_getapplock` (keyed on
  `room+date`) inside a transaction, re-checks room/therapist overlap under the lock, then
  inserts the booking as `Held` with a 5-minute `ExpiresAt`. This is what actually prevents a
  double-booking under concurrent requests — nothing upstream of this (not the availability
  read, not Redis) is trusted for correctness.
- `sp_Booking_Confirm`, `sp_Booking_Cancel` — status transitions, ownership-checked.
- `sp_Booking_ExpireStaleHolds` — called by a background sweep every 30s; flips expired `Held`
  rows to `Expired`, returns affected `(LocationId, RoomId, WorkDate)` for cache/SSE invalidation.
- `sp_Booking_GetMine` — customer's bookings + their treatments (2 result sets).

`05_procs_auth.sql`: `sp_Auth_CreateCustomer`, `sp_Auth_GetCustomerByEmail`.

Application-level errors (slot taken, hold expired, email already registered, etc.) are raised
via `THROW 50000`–`50999` inside the proc. Endpoints don't catch these themselves — they bubble
up to the global exception handler (`Shared/ErrorHandling/AppExceptionHandler.cs`, see §5), which
checks `SqlException.Number` via `SqlExceptionExtensions.IsApplicationError()` and turns it into a
409 ProblemDetails response. Anything outside that range is a real bug and 500s (logged, message
not leaked to the client).

**Gotcha worth knowing**: `EXEC proc @param = <expr>` in T-SQL only accepts a literal or a
variable — not a function call like `CONCAT(...)` — inline. Assign to a `DECLARE`d variable
first when writing manual `.sql` test/seed scripts. (This doesn't affect Dapper calls from C#,
which pass parameters directly, never as inline `EXEC` text.)

## 5. Backend structure — `backend/SaloonApi`

```text
SaloonApi/
  Program.cs                 -- composition root: DI, auth, CORS, endpoint mapping
  AssemblyInfo.cs             -- [assembly: InternalsVisibleTo("SaloonApi.Tests")]
  Shared/                    -- kernel, no business logic
    Data/SqlConnectionFactory.cs   -- reads ConnectionStrings:SaloonDb
    Data/DapperSp.cs                -- QuerySpAsync/ExecuteSpAsync/etc — ALL db calls go through these
    Data/SqlExceptionExtensions.cs -- IsApplicationError()
    Caching/IAvailabilityCache.cs + RedisAvailabilityCache.cs
    Realtime/SseBroadcaster.cs     -- in-process pub/sub for SSE groups
    Auth/JwtOptions.cs, TokenService.cs, PasswordHasher.cs
    Auth/ICurrentUser.cs, CurrentUser.cs, CurrentUserMiddleware.cs -- see below
    ErrorHandling/AppExceptionHandler.cs -- global IExceptionHandler, see below
    Validation/ValidationFilter.cs        -- generic FluentValidation endpoint filter, see below
  Modules/
    Identity/    Application/AuthService.cs · Infrastructure/CustomerRepository.cs · Endpoints/AuthEndpoints.cs
    Catalog/     Infrastructure/CatalogRepository.cs · Endpoints/CatalogEndpoints.cs   (read-only)
    Booking/     Application/SlotCalculator.cs, BookingService.cs
                 Infrastructure/BookingRepository.cs
                 BackgroundJobs/HoldExpirySweepService.cs
                 Endpoints/BookingEndpoints.cs
```

### The module pattern — follow this for every new module

Each module under `Modules/` is a self-contained vertical slice with (at most) 4 folders:

- **Infrastructure/** — one `*Repository` class per module. Constructor-injects
  `SqlConnectionFactory`. Every method opens its own `using var db = factory.Create()` and calls
  exactly one stored procedure via the `DapperSp` extensions (`QuerySpAsync`,
  `QuerySingleSpAsync`, `QueryMultipleSpAsync`, `ExecuteSpAsync`). Returns DTO records defined in
  the same file, named `<Thing>Row` for raw SP output or `<Thing>Dto` for API-facing shapes.
- **Application/** — orchestration only where a module needs more than "call one proc and
  return it" (Catalog doesn't have this folder — it's pure passthrough). `BookingService` is the
  example: it composes repository calls, cache reads/invalidation, and SSE notification. Pure,
  non-DB algorithms live here too and get unit tests (`SlotCalculator`).
- **Endpoints/** — one static class with one `Map<Module>Endpoints(this IEndpointRouteBuilder)`
  extension method, called from `Program.cs`. Request/response DTOs are `sealed record`s defined
  at the bottom of the same file. Routes are grouped under `/api/<module-lowercase>`. A DTO that
  needs validation gets a `sealed class <Dto>Validator : AbstractValidator<Dto>` right below it in
  the same file (see AuthEndpoints.cs, BookingEndpoints.cs), and the route adds
  `.WithValidation<Dto>()` — no manual `ValidateAsync` calls in handlers, see below.
- **BackgroundJobs/** — only Booking has this. A `BackgroundService` that resolves scoped
  services via `IServiceScopeFactory` (never inject a scoped service into a singleton
  `BackgroundService` directly).

Registration in `Program.cs`: repositories and services are `AddScoped`; `SqlConnectionFactory`,
`TokenService`, `IAvailabilityCache`, `SseBroadcaster` are `AddSingleton`; background jobs are
`AddHostedService`.

**To add a new module** (e.g. an admin-side Scheduling module for shift CRUD): write the SP(s)
in a new `db/0N_procs_<module>.sql`, add a `Modules/<Module>/Infrastructure/<Module>Repository.cs`
calling them via `DapperSp`, add `Endpoints/<Module>Endpoints.cs`, register in `Program.cs`. Only
add an `Application/` service if there's real orchestration beyond "call the proc."

### Auth

JWT bearer only — no cookies (explicit product decision). `POST /api/auth/register` and
`/api/auth/login` return `{ customerId, name, email, token }`; every other endpoint requires
`Authorization: Bearer <token>`. Passwords are PBKDF2-hashed (`Rfc2898DeriveBytes`, 100k
iterations) — no ASP.NET Identity, no third-party hash library, stdlib only.

**Reading the current user**: inject `ICurrentUser` (`Shared/Auth/ICurrentUser.cs`), not
`ClaimsPrincipal`/`HttpContext` directly — that keeps identity-dependent logic usable from
services, not just endpoint handlers. It's populated once per request by
`CurrentUserMiddleware : IMiddleware` (`Shared/Auth/CurrentUserMiddleware.cs`), which must run
after `app.UseAuthentication()` (`context.User`'s claims aren't populated before that — see the
pipeline order note above) and reads `ClaimTypes.NameIdentifier`/`ClaimTypes.Email` off it into
the scoped `CurrentUser` concrete type. `ICurrentUser.CustomerId` is nullable (the type has to
make sense for anonymous routes too, e.g. the SSE stream); call `RequireCustomerId()` — which
throws if there's no authenticated customer — from handlers that only ever run behind
`.RequireAuthorization()` (see `BookingEndpoints.cs`). DI wiring: `CurrentUser` is `AddScoped`,
and `ICurrentUser` is registered to resolve to that same scoped instance
(`AddScoped<ICurrentUser>(sp => sp.GetRequiredService<CurrentUser>())`) so the middleware's writes
and a handler's reads see one instance per request.

There is currently exactly one role: implicit "Customer." When RBAC lands (Super
Admin/Admin/Manager/Receptionist/Therapist/Customer per spec), it plugs in as claims on the same
JWT plus `[Authorize(Policy = ...)]` — no auth mechanism change needed.

### Error handling & validation

Two cross-cutting concerns, both wired once in `Program.cs` and never touched per-endpoint:

- **Errors**: `AppExceptionHandler : IExceptionHandler` (`Shared/ErrorHandling/`) is the only place
  exceptions are caught. Registered via `AddExceptionHandler<AppExceptionHandler>()` +
  `AddProblemDetails()` + `app.UseExceptionHandler()` (mapped first in the pipeline, before CORS/
  auth). It writes RFC7807 `ProblemDetails` through `IProblemDetailsService`: known application
  errors (`SqlException` in the 50000–50999 range, see §4) become 409s with the proc's own
  message; anything else becomes a generic 500 and gets logged with the exception and request
  path. **Endpoint handlers do not `try`/`catch` `SqlException` themselves** — that used to be
  copy-pasted into every write endpoint and is gone now that the global handler covers it.
- **Validation**: FluentValidation, wired through a generic `ValidationFilter<T> : IEndpointFilter`
  (`Shared/Validation/ValidationFilter.cs`) plus a `.WithValidation<T>()` extension on
  `RouteHandlerBuilder`. The filter resolves `IValidator<T>` from DI for whichever route parameter
  matches `T`, runs it, and short-circuits with `Results.ValidationProblem(...)` (400) before the
  handler body runs if invalid. Validators are registered once via
  `AddValidatorsFromAssemblyContaining<Program>()` — a new `AbstractValidator<TDto>` just needs to
  exist in the assembly, no manual registration. **To validate a new request DTO**: add the
  validator class next to the DTO (see `RegisterRequestValidator` in `AuthEndpoints.cs`,
  `HoldRequestValidator` in `BookingEndpoints.cs`), chain `.WithValidation<TDto>()` onto the
  `Map*` call. Don't call `IValidator<T>.ValidateAsync` by hand in a handler — use the filter.

### Observability & reverse-proxy pipeline order

Logging is Serilog, configured once in `Program.cs`: `Enrich.FromLogContext()` (required — see
below) plus `WithMachineName()`/`WithEnvironmentName()`/`WithThreadId()`, writing JSON
(`Serilog.Formatting.Json.JsonFormatter`) to both the console and a daily-rolling file
(`logs/log-.json`, `RollingInterval.Day`, 31-day retention via `retainedFileCountLimit`). `logs/`
is gitignored.

`Shared/Observability/CorrelationIdMiddleware.cs` reads `X-Correlation-Id` off the incoming
request (trusting it only if present and ≤100 chars, else generating a GUID), pushes it into
Serilog's `LogContext` for the duration of the request, and echoes it back on the response. Every
log line for a request — from routing through the handler to the exception handler — carries it,
which is what makes `Enrich.FromLogContext()` non-optional: without it the pushed property is a
no-op.

Pipeline order in `Program.cs` matters and mirrors *why* each piece is early:

1. `UseForwardedHeaders` — must be first; everything after it (exception handler, HTTPS
   redirection, auth) needs the real scheme/client IP already substituted from `X-Forwarded-*`,
   not the reverse proxy's. `KnownIPNetworks`/`KnownProxies` are cleared (the default only trusts
   a loopback proxy) — safe *only* because the app is assumed to never be directly
   internet-reachable, i.e. the proxy in front is the sole entry point. If that assumption ever
   stops holding, this needs a real allowlist instead of trusting any caller.
2. `UseMiddleware<CorrelationIdMiddleware>` — before the exception handler, so even a request
   that 500s gets a correlated log trail.
3. `UseExceptionHandler` (§ above) — before everything else that could throw.
4. `UseHttpsRedirection` / `UseCors` / `UseAuthentication` → `UseMiddleware<CurrentUserMiddleware>()`
   (needs `context.User` populated, so it can't go earlier) → `UseAuthorization`.

## 6. The booking flow — the core of this codebase

This is the part every other feature will eventually connect to. Read it end to end before
touching booking code.

```text
1. GET  /api/catalog/chains, /locations, /treatments   -- browse (Catalog module, pure reads)
2. GET  /api/booking/available-dates?locationId&from&to
        -> BookingService.GetAvailableDatesAsync: WorkingDaysMask filtered by LocationHolidays
3. GET  /api/booking/available-slots?locationId&treatmentIds&date
        -> BookingService.GetAvailableSlotsAsync:
             - Redis cache-aside read (key avail:{locationId}:{date})
             - on miss: sp_Booking_GetAvailabilityData (raw data only)
             - SlotCalculator.ComputeAvailableSlots (pure C#, see below)
             - cache the result, 60s TTL
4. POST /api/booking/hold  {locationId, roomId, therapistId, startTime, endTime, treatmentIds}
        -> sp_Booking_CreateHold: sp_getapplock(room+date) -> re-check overlap -> insert Held row
        -> cache invalidated for that (locationId, date); SSE "slot-changed" published
        -> client gets { bookingId, expiresAt } (5-minute hold)
5. POST /api/booking/{id}/confirm   -> sp_Booking_Confirm (Held & not expired & owned -> Confirmed)
   DELETE /api/booking/{id}         -> sp_Booking_Cancel  (explicit cancel)
   [30s background sweep]           -> sp_Booking_ExpireStaleHolds (Held & past ExpiresAt -> Expired)
   -- all three invalidate cache + publish SSE for the affected (locationId, date)
6. GET  /api/booking/mine           -> sp_Booking_GetMine
```

### Why slot math is in C#, not T-SQL

`SlotCalculator.ComputeAvailableSlots` (`Modules/Booking/Application/SlotCalculator.cs`) is a
**pure function**: given opening hours, total requested duration, eligible (room, therapist,
shift-window) pairs, and existing bookings, it walks 5-minute candidate start times and returns
the free ones. It has no DB access and no side effects — the SP `sp_Booking_GetAvailabilityData`
only fetches the raw inputs. This split exists specifically so the one genuinely non-trivial
algorithm in the codebase is unit-testable (`SaloonApi.Tests/SlotCalculatorTests.cs`, 6 cases:
exact-fit boundary, too-short window, multi-treatment duration summing, same-room conflict,
same-therapist-different-room conflict, no-eligible-pairs). **Any change to slot logic must keep
this split** — don't move filtering back into SQL for convenience.

### Why concurrency correctness lives in SQL, not Redis or C sharp

`sp_Booking_CreateHold` is the only place a `Held` row gets created, and it does so inside a
transaction holding an app lock scoped to `room+date`, re-checking for overlap *after* acquiring
the lock. This means two simultaneous requests for the same slot are serialized by SQL Server
itself — the second one fails the overlap check and the proc `THROW`s 50002. Redis is never
consulted for this decision; it's a read-through cache only, invalidated on every write, and if
it were wrong or unavailable the worst case is a slower/duplicate `available-slots` read, never
a double-booking. If you're tempted to add a Redis-based lock for "performance," don't — the app
lock is already cheap (keyed narrowly, held only for the transaction) and the two-tier design
(cache for reads, DB lock for writes) is deliberate.

### Real-time: SSE, not SignalR (for now)

`GET /api/booking/stream?locationId&date` is an anonymous SSE endpoint
(`SaloonApi/Modules/Booking/Endpoints/BookingEndpoints.cs`, mapped directly on the root
`IEndpointRouteBuilder`, bypassing the module's `RequireAuthorization()` group — `EventSource`
can't send an `Authorization` header, and the event payload carries no customer data, just
"something changed here, refetch"). `SseBroadcaster` (`Shared/Realtime/SseBroadcaster.cs`) is an
in-process `ConcurrentDictionary` of subscribers grouped by `"{locationId}:{date}"` — **it does
not span multiple API instances**. The spec calls for SignalR too; that's intentionally not
built yet because nothing currently needs its bidirectional/authenticated capabilities — the
natural place for it is an admin-side "live room monitor" dashboard, which doesn't exist until
the admin portal does. Don't add a SignalR hub speculatively; add it when a feature actually
needs push-to-a-specific-authenticated-admin semantics that SSE can't give you. If SSE ever
needs to span multiple instances, the fix is a Redis pub/sub backplane behind the same
`SseBroadcaster` interface, not a rewrite.

## 7. Frontend — `frontend/clientportal`

```text
src/
  api/client.ts    -- fetch wrapper: adds Authorization header, throws ApiError on !ok
  api/types.ts      -- TypeScript mirrors of the backend DTOs (camelCase — ASP.NET Core's
                        default JSON policy is camelCase, matches these 1:1)
  features/auth/AuthContext.tsx      -- React context, token in localStorage
  features/booking/
    useBookingFlow.ts       -- useReducer state machine: treatments -> date -> slot -> held -> confirmed
    useAvailabilityStream.ts -- EventSource wrapper, triggers slot refetch on "slot-changed"
    useCountdown.ts           -- hold-expiry countdown for the UI
    TreatmentPicker.tsx, DatePicker.tsx, SlotPicker.tsx, BookingSummary.tsx
  pages/LoginPage.tsx, BookPage.tsx, MyBookingsPage.tsx
  App.tsx   -- react-router-dom routes, RequireAuth wrapper redirecting to /login
```

`useBookingFlow(locationId)` is the state machine to extend if the booking UX changes — it's a
single `useReducer` with explicit action types (`TOGGLE_TREATMENT`, `PICK_DATE`, `HELD`,
`CONFIRMED`, etc.), not scattered `useState` calls. `BookPage.tsx` wires it together with the
catalog fetches (chain → location → treatments) and the SSE hook (auto-refetches slots when
another customer's action changes availability for the currently-viewed location+date).

No state management library (Redux/Zustand) — the reducer covers it. No component library —
Tailwind utility classes directly. `react-router-dom` is the one real dependency added beyond
the Vite/React/Tailwind scaffold, because there are genuinely multiple routed pages.

`frontend/adminportal` is still the unmodified Vite template — nothing has been built there yet.
When it is, it should reuse `clientportal`'s `api/client.ts` pattern and the same booking
concepts, but will need its own flow (location/customer picker before treatment selection, per
the spec's admin booking flow) — don't try to force-share components across the two apps until
there's a real duplication problem; there's no shared package/workspace tooling set up for that
yet.

## 8. Scope map — what's built vs. deliberately deferred

| Area | Status | Where it plugs in when built |
| --- | --- | --- |
| Customer auth (register/login) | ✅ Built | `Modules/Identity` |
| Catalog browsing | ✅ Built (read-only) | `Modules/Catalog` |
| Booking flow (hold → confirm) | ✅ Built | `Modules/Booking` |
| Location holidays | ✅ Built | `LocationHolidays` table, checked in `BookingService` |
| Admin portal UI | ❌ Not started | `frontend/adminportal` (still default template) |
| RBAC (6 roles) | ❌ Not started | Extend JWT claims + `[Authorize(Policy=...)]`; no mechanism change needed |
| Emulation (admin-as-customer) | ❌ Not started | Likely a second claim/token-exchange endpoint in `Identity` |
| Shift/room-assignment CRUD | ❌ Not started | Tables exist (`ShiftAssignments`, `RoomCategoryAssignments`), seeded manually via `06_seed.sql` — needs a `Scheduling` module for admin CRUD |
| Analytics/reports | ❌ Not started | New module, reads via new SPs — no existing code to extend |
| Payments | ❌ Not started (explicitly future, per spec) | — |
| SignalR | ❌ Not started | See §6 — add when an admin-facing authenticated push feature exists |
| Multi-instance SSE | ❌ Not needed yet | Redis pub/sub backplane behind `SseBroadcaster` when scaling past 1 instance |

## 9. Running & verifying locally

**Database**: run `db/01_tables.sql` through `db/06_seed.sql` in order against a SQL Server
instance (LocalDB works fine for dev: `sqlcmd -S "(localdb)\MSSQLLocalDB" -d <db> -i <file> -C`).
Update `backend/SaloonApi/appsettings.json` → `ConnectionStrings:SaloonDb` to match.

**Redis**: required — `ConnectionStrings:Redis` in the same `appsettings.json`. Any local Redis
(Docker, WSL, Memurai) works; there's nothing SQL-Server-specific about it.

**Backend**: `dotnet run --project backend/SaloonApi` (or via the solution). Dev URL
`http://localhost:5127` (see `backend/SaloonApi/Properties/launchSettings.json`). OpenAPI JSON is
mapped via `app.MapOpenApi()` and the Scalar UI via `app.MapScalarApiReference()` — both
Development-only (`Program.cs`); check the console output on startup for the exact Scalar route.

**Frontend**: `npm run dev` inside `frontend/clientportal` (port `58569`, set in
`vite.config.ts`). CORS origins are whitelisted explicitly in `appsettings.json` →
`Cors:AllowedOrigins` — add a port here if you change the Vite dev port.

**Tests**: `dotnet test backend/SaloonApi.Tests` — currently `SlotCalculatorTests` (6 cases, no
DB/Redis required, pure logic). `db/tests/test_booking_hold_conflict.sql` is a manual
concurrency check — seeds a hold, attempts a second overlapping hold, asserts it's rejected; run
it with `sqlcmd` after the numbered scripts.

When adding a feature with any non-trivial logic (a branch, a loop, a money/security path),
leave a test behind at the same tier this codebase already uses: pure C# algorithms get an
xUnit test next to `SlotCalculatorTests.cs`; concurrency/constraint behavior that only SQL
Server can prove gets a script in `db/tests/`.

## 10. Conventions checklist for new work

- New query or write → new stored procedure first (`db/0N_procs_<module>.sql`, `CREATE OR ALTER`),
  then a Dapper call through `DapperSp` extensions. Never inline SQL in C#.
- New table → all 6 audit columns (`IsDelete`, `IsActive`, `CreatedBy`, `CreatedDate`, `UpdatedBy`,
  `UpdatedDate`, §4), no exceptions. New `SELECT` proc → filter `WHERE IsDelete = 0`. New
  INSERT/UPDATE proc → `@CreatedBy`/`@UpdatedBy INT = NULL` params, sourced from the calling
  repository's `ICurrentUser.CustomerId`.
- New module → `Infrastructure/` (+`Application/` only if there's real orchestration) +
  `Endpoints/`, registered in `Program.cs`, following the pattern in §5.
- Passing a list of IDs into a proc → use the `dbo.IntIdList` TVP and `.AsIntIdList()`
  (`Shared/Data/DapperSp.cs`), not a comma-joined string parsed in SQL.
- Application-level rejections from a proc → `THROW 50000`–`50999`; let it bubble up, don't catch
  `SqlException` in the endpoint — `AppExceptionHandler` (§5) turns it into a 409 globally.
- New request DTO that needs validation → add an `AbstractValidator<TDto>` next to it and chain
  `.WithValidation<TDto>()` onto the route (§5) — don't call `ValidateAsync` by hand in a handler.
- Anything touching booking concurrency → the correctness check belongs in the SP under the app
  lock, not in C#, not in Redis.
- Don't add a dependency (state library, component kit, SignalR, ORM) speculatively — every
  dependency currently in the repo was added because a concrete, present feature needed it. Add
  the next one the same way.
