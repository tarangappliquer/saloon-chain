# Handoff — 2026-08-31 session

Status: **all changes build clean, 36/36 tests pass, key paths live-verified against the
remote dev DB (`Host=server` / `saloon_db`).** Deploy checklist at the bottom. Delete this
file once deployed and smoke-tested in the real app.

Test env used this session: the real remote dev DB (`ConnectionStrings__SaloonDb=Host=server;
Port=5432;Database=saloon_db;Username=dev;Password=m00ns00n`). Seeded RootSuperAdmin login is
`rootsuperadmin@saloons.local` / `admin123`. The only customer is id 9. Location 1 ("Location 1",
`TimeZoneId='UTC'`, open 09:00–18:00) has rooms r1/r2, therapists th2/th3 (TherapistProfile ids
1/2), and room-category + shift scheduling for 2026-08-31 and 2026-09-01 only.

---

## Done this session

### 1. Backend hang / ThreadPool starvation  (committed `8394947`, `1a68e0b`, `6a29995`)
- **`RedisConnectionProvider`** was taking a lock on every `GetMultiplexer()` call and holding it
  across the *synchronous* `ConnectionMultiplexer.Connect()`. A flaky Redis serialized the whole
  thread pool → API hung, and even Postgres DNS lookups failed with `EAGAIN`. Now: lock-free
  happy path, single-flight connect (Interlocked gate, no lock across `Connect()`),
  `ConnectTimeout=2000`, `AbortOnConnectFail=false`.
- **`Program.cs`** — `ThreadPool.SetMinThreads(ProcessorCount*8, ≥64)` at startup so a burst of
  synchronous `getaddrinfo` (every Npgsql open) can't collapse the pool.
- **`SqlConnectionFactory`** — caps the Npgsql connect `Timeout` at 10s.
- **`Dockerfile`** — reverted `aspnet:10.0-noble-chiseled-extra` → `aspnet:10.0` (Debian). The
  chiseled image ships no `/etc/nsswitch.conf`; under load glibc name resolution returned EAGAIN.
- Immediate mitigation applied by the user: `SALOON_DB_CONN_STRING` / `POSTGRES_HOST` now points
  at the DB **IP**, so no hostname resolution on the hot path.

### 2. BackgroundService crash-loop  (committed `de4ca0c`)
`StaffAttendanceSweepHostedService` only caught `OperationCanceled` / `InvalidOperation` /
`DbException`; a `RedisConnectionException` escaped → `BackgroundServiceFaulted` → default
`StopHost` → compose `restart: unless-stopped` crash-loop. Added a broad top-level
`catch (Exception)` guard matching the three sibling sweep services.

### 3. SSE backplane re-subscription  (committed `de4ca0c` / `8394947`)
`SseBroadcaster` only subscribed to the Redis pub/sub channel once, in the constructor — if Redis
was down at startup it fell back to local-only *forever*. Now `TryAttachSubscription(mux)` is
called from the `Publish`/`Subscribe` paths; it holds a tiny lock for a pointer compare only and
fires `SubscribeAsync` fire-and-forget (no blocking on the hot path). Re-subscribes if
`RedisConnectionProvider` hands back a new multiplexer.

### 4. Durable email outbox  (committed `fbef7c8`)
Non-alert emails (booking confirm/cancel, set/reset password, email-change verify, manager
alerts) no longer use the in-memory `Channel` queue (which dropped everything on a restart).
- New `public.EmailOutbox` table + 4 routines (`sp_EmailOutbox_Enqueue`, `fn_EmailOutbox_Claim`
  with `FOR UPDATE SKIP LOCKED`, `sp_EmailOutbox_MarkSent`, `sp_EmailOutbox_MarkFailed`) in
  `db/postgres/03_procs_postgres.sql`.  **Migration: `db/postgres/migrations/001_email_outbox.sql`.**
- `IBackgroundEmailQueue.EnqueueAsync` INSERTs a row (`EmailOutboxQueue` → `EmailOutboxDbService`).
- `EmailQueueBackgroundService` rewritten as a poll loop (`EmailOptions.OutboxPollSeconds`, default
  10) → claim batch → send → mark Sent / Failed (linear backoff, `OutboxMaxAttempts` default 5).
- `BackgroundEmailQueue.cs` deleted. Developer error alerts still send inline via
  `IDeveloperErrorNotifier` (work even when the DB is down).
- Round-trip pinned by `SaloonApi.Tests/EmailOutboxPayloadTests.cs`.

### 5. SuperAdmin can always emulate  (committed `5ae46a8`)
New `UserRole.CanAlwaysEmulate()` (`RootSuperAdmin` or `SuperAdmin`) is the single source of
truth, applied at all 4 sites that hard-coded `Role == RootSuperAdmin`
(`AuthService.EmulateCustomerAsync` / `LoginAsync` / `RefreshAsync`, `AuthEndpoints /me`).
`CustomersPage.tsx` now shows/enables the emulate button for SuperAdmin and doesn't apply the
per-customer "no bookings in your chain" restriction to them.

### 6. Calendar popup "Add appointment" gated on emulate  (committed `5ae46a8`)
`QuickActionsPopover` gained `showAddAppointment?: boolean`; `CalendarPage` passes
`canAddAppointment={!!currentUser?.canEmulate}` (that action books via customer emulation).

### 7. Calendar "cannot open room"  (committed `5ae46a8`)
`CalendarPage.tsx` — the room-category `<select>` is `disabled={categories.length === 0}` and the
category load swallowed all errors (`.catch(() => {})`). Now load errors surface in the page
banner and a "No treatment categories for this location — add one in Catalog" hint shows.

### 8. Client "no available open dates" — two root causes
**a. `sp_Booking_GetLocationOpenDates` too strict**  (committed) — required an explicit
`RoomCategoryAssignments` **and** `ShiftAssignments` row for the exact date, stricter than the
actual slot engine (`fn_Booking_AvailabilityRangeEligiblePairs`, which also accepts a floating
therapist with no shifts, and treats all rooms as open when the location has no RCA anywhere).
Rewritten to mirror the engine. **Migration: `db/postgres/migrations/002_align_location_open_dates.sql`.**

**b. Dapper `QueryAsync<DateOnly>` silently returns `DateOnly.MinValue`**  (committed `59c7f47`) —
Dapper treats `DateOnly` as a POCO for a bare column and never calls `DateOnlyTypeHandler`, so
`BookingDbService.sp_Booking_GetLocationOpenDatesAsync` got `{0001-01-01}` for every row →
`BookingService.GetAvailableDatesAsync` line ~66 (`if (!openDates.Contains(d)) continue;`) dropped
every real date → `[]`. Fixed with an `OpenDateRow { public DateOnly WorkDate }` wrapper record.
Verified live: `available-dates?treatmentIds=1` now returns `["2026-09-01"]`.
See `~/.claude/.../memory/project_dapper_dateonly_scalar.md`.

### 9. Time-slot select crashed: `DateTime Kind=Unspecified` → `TIMESTAMPTZ`  (committed `59c7f47`)
`BookingTreatments.StartTime/EndTime` are `TIMESTAMPTZ`; the client-supplied times arrived
`Kind=Unspecified` and Npgsql refuses those. Added `BookingDbService.AsUtc()` on the
`sp_Booking_ScheduleTreatment` / `sp_Booking_RescheduleConfirmed` param binds.

### 10. Client timezone header → UTC storage  (working tree — NOT yet committed)
Per decision: **server stores every timestamp UTC; clients render in their own zone.**
- `Shared/Http/RequestContext.cs` — scoped `IRequestContext` with `ClientTimeZone`
  (from `X-Timezone`, IANA id, UTC fallback), `ClientNow` / `ClientToday`, and
  `ToUtc(DateTime clientLocal)`.
- `Shared/Http/RequestContextMiddleware.cs` — reads the `X-Timezone` header. Registered scoped +
  `app.UseMiddleware<RequestContextMiddleware>()` right after `CorrelationIdMiddleware`.
- `BookingService.ScheduleTreatmentAsync` / `RescheduleConfirmedAsync` now call
  `requestContext.ToUtc(start/end)` before persisting (`AsUtc` in the DbService stays as a net).
- Both portals' `api/client.ts` request interceptors send
  `X-Timezone: Intl.DateTimeFormat().resolvedOptions().timeZone` on every call. CORS is
  `AllowAnyHeader()`, no change needed.
- **Live-verified**: `Asia/Kolkata` + naive `15:00` → stored `09:30:00Z`; `...Z` input →
  passthrough; no header → UTC.

### Sweeps run (no further bugs found)
- Reflection validator: all **58 single-result `QueryAsync<Record>` DbService paths** vs live
  `pg_get_function_result` → 0 column-name / type mismatches.
- Param-binding validator: **190 `sp_/fn_` invocations** vs `pg_get_function_arguments` → 0 real
  issues (23 flags were all OUT-param or `integer[]` artifacts).
- Only scalar `QueryAsync<value-type>` and non-UTC `DbType.DateTime`→TIMESTAMPTZ were buggy; both
  classes fully resolved (#8b, #9).

---

## Deploy checklist

1. **Run migrations against the DB** (order): `db/postgres/migrations/001_email_outbox.sql`,
   then `db/postgres/migrations/002_align_location_open_dates.sql`.
   (Or re-run the full `db/postgres/03_procs_postgres.sql` + the `EmailOutbox` block from
   `01_table_postgres.sql`.)
2. **Rebuild + redeploy the backend image** (Debian base now — was chiseled).
3. **Rebuild + redeploy both frontends** (adminportal, clientportal — `X-Timezone` interceptor,
   emulate/calendar UI changes).
4. Commit the working-tree changes for item **#10** (RequestContext + middleware + BookingService
   + both `client.ts`) — everything else is already committed.

## Follow-ups (not done — judgement calls)

- **Slot generation is still naive server-local.** `SlotCalculator` / `GetAvailableSlotsAsync` /
  `GetAvailableDatesAsync` use `DateTime.Now` and emit `Kind=Unspecified` times. This is only
  correct while the server runs UTC *and* the venue `TimeZoneId='UTC'` (current dev setup). The
  right model: generate slots as real UTC instants using `Location.TimeZoneId`, and make the
  "past slot" / "today" cutoffs UTC-absolute (or use `IRequestContext.ClientToday`/`ClientNow`).
- **`sp_Booking_HasLocationRoomOpenings`** still uses the old strict RCA⋈shift⋈therapist
  definition — only toggles "mask-only vs openDates-gated" mode, so lower priority, but it should
  match `sp_Booking_GetLocationOpenDates` for consistency.
- **DataProtection keys** log as ephemeral (`/root/.aspnet/DataProtection-Keys`) — every backend
  restart invalidates issued cookies/tokens. Mount a volume there or `PersistKeysToFileSystem`
  at `/app/uploads`.
