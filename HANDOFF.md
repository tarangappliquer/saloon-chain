# Handoff: Effective-dated scheduling (LocationDaySchedule / TreatmentPrices / TreatmentDurations)

Status: **feature complete** -- DB deployed, backend builds clean, OpenAPI client regenerated, frontend wired and typechecks clean (`tsc -b --force`, 0 errors). Not yet manually exercised in a browser. Delete this file once someone has smoke-tested it end to end -- it's a handoff note, not permanent docs.

## What changed and why

Three tables already used an "effective-dated" pattern (a new row supersedes the old one from `EffectiveFrom` onward, forever): `LocationDaySchedule` (per-day open/close hours), `TreatmentPrices`, `TreatmentDurations`. The user asked for two extensions:

1. **`LocationDaySchedule` needed an "Open/Closed" concept**, not just re-timed hours -- a day should be schedulable as fully closed (e.g. "Bopal closed every Sunday from next month"), not just given different hours.
2. **All three tables needed date-range support**, not just open-ended `EffectiveFrom`: a change can now be scheduled for a **single date**, a **bounded date range**, or **open-ended** (the original behavior). Convention (explicit from the user):
   - `EffectiveTo == EffectiveFrom` → single date
   - `EffectiveTo > EffectiveFrom` → date range
   - `EffectiveTo IS NULL` → open-ended (stays in effect until superseded)
   - **Resolution priority when multiple rows match a date**: single date > date range > open-ended, then most recent `EffectiveFrom` wins. Implemented via `ORDER BY CASE WHEN EffectiveTo = EffectiveFrom THEN 1 WHEN EffectiveTo IS NOT NULL THEN 2 ELSE 3 END, EffectiveFrom DESC` everywhere these tables are resolved.

## Done (DB + backend) -- deployed to the live dev DB already

- `db/01_tables.sql`: `LocationDaySchedule` gained `IsClosed BIT`, `EffectiveTo DATE NULL`, `OpenTime`/`CloseTime` are now nullable (null when `IsClosed=1`). `TreatmentPrices`/`TreatmentDurations` each gained `EffectiveTo DATE NULL`. New CHECK constraints: `CK_LocationDaySchedule_Times` (closed OR both times set + CloseTime>OpenTime), `CK_LocationDaySchedule_DateRange`, `CK_TreatmentPrices_DateRange`, `CK_TreatmentDurations_DateRange` (all: `EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom`).
- `db/migrations/012_effective_date_ranges.sql`: idempotent migration covering all of the above. **Already run** against the dev DB (`sqlcmd -S server -d SaloonChainsDb -U dev -P m00ns00n -C -I`).
- `db/03_procs.sql`: every resolution site for these 3 tables (12 `TOP 1 ... ORDER BY EffectiveFrom DESC` subqueries across booking/catalog procs, plus `sp_Booking_GetAvailabilityData`/`sp_Booking_GetAvailabilityDataRange`'s `LocationDaySchedule` lookups) updated with the `EffectiveTo` range filter and the 3-tier priority `ORDER BY`. A day marked `IsClosed` now rolls into the existing `IsHoliday` flag (single-date path) or is dropped from the resolved-hours result set entirely (range path) -- no new "closed" flag needed in the booking C# layer, it reuses the holiday short-circuit that already existed. `sp_Catalog_AddLocationDaySchedule`/`AddTreatmentPrice`/`AddTreatmentDuration`/`Get*` procs all take/return `EffectiveTo` (and `IsClosed` for day-schedule) now. **Already deployed** in full.
- Backend C# (`CatalogRepository.cs`, `AdminCatalogEndpoints.cs`): DTOs/requests/validators updated to match (`LocationDayScheduleRequest` gained `IsClosed`/`EffectiveTo`, `OpenTime`/`CloseTime` now nullable; `TreatmentPriceRequest`/`TreatmentDurationRequest` gained `EffectiveTo`). Validators enforce the single/range/open-ended `EffectiveTo >= EffectiveFrom` rule and the closed-day time requirement. **Builds clean** (`dotnet build`, 0 errors).
- OpenAPI client (`frontend/packages/api-client/src`) **already regenerated** against the updated backend (ran on scratch port 5199 per repo policy, port released afterward) -- `LocationDayScheduleDto`/`Request`, `TreatmentPriceDto`/`Request`, `TreatmentDurationDto`/`Request` all have the new fields (`isClosed`, `effectiveTo`, nullable `openTime`/`closeTime`). No need to regenerate again unless the backend contract changes further.
- `frontend/apps/adminportal/src/api/types.ts`: `LocationDaySchedule`, `TreatmentPrice`, `TreatmentDuration` interfaces updated to match (done).
- `frontend/apps/adminportal/src/lib/effectiveDate.ts` (**new, done**): shared helpers --
  - `type EffectiveMode = 'from' | 'range' | 'single'`
  - `resolveEffectiveTo(mode, fromDate, toDate): string | null`
  - `describeEffectiveWindow(effectiveFrom, effectiveTo): string`

## Frontend UI wiring -- done

- **`frontend/apps/adminportal/src/components/EffectiveDateFields.tsx`** (new): shared form fragment -- mode toggle buttons (Effective From / Date Range / Single Date) + one or two `DateInput`s from `./DateInput`. Props: `{ mode, onModeChange, fromDate, onFromDateChange, toDate, onToDateChange, minDate?, fromError?, toError? }`. Used by all 3 places below instead of duplicating the JSX.

- **`frontend/apps/adminportal/src/components/DayScheduleModal.tsx`** (rewritten): added an "Closed all day" checkbox (hides the Open/Close `<input type="time">` fields when checked -- those remain plain HTML inputs, not the shared `TimeInput` component; that's a separate pre-existing inconsistency, left alone) and swapped the single `effectiveFrom` date input for `<EffectiveDateFields>`. `handleAdd`'s POST body sends `isClosed` and `effectiveTo: resolveEffectiveTo(form.mode, form.effectiveFrom, form.effectiveTo)`. Display rows (`current`/`upcoming`) use a local `formatWindowHours` helper (shows "Closed" when `isClosed`) and `describeEffectiveWindow` for the date range text.

- **`frontend/apps/adminportal/src/pages/catalog/TreatmentPricesPage.tsx`**: `priceForm` gained `mode`/`effectiveTo` state, `<EffectiveDateFields>` replaced the single `DateInput` in the "Schedule New Price" card, `handleSubmitPrice` passes `effectiveTo: resolveEffectiveTo(...)` to `apiAdminCatalogTreatmentsIdPricesPost`. Price history rows use `describeEffectiveWindow(p.effectiveFrom, p.effectiveTo)`.

- **`frontend/apps/adminportal/src/pages/catalog/TreatmentDurationsPage.tsx`**: identical treatment, for `durationForm`/`handleSubmitDuration`/`apiAdminCatalogTreatmentsIdDurationsPost` and the duration history list.

Verified with `cd frontend/apps/adminportal && npx tsc -b --force` -- 0 errors (`tsc --noEmit -p .` is a no-op in this app, must use `-b --force`, per this session's established gotcha).

## Suggested next step for whoever picks this up

Nothing is outstanding in code. What's missing is a manual smoke test in a browser: open a location's "Day Hours" modal and schedule (a) a single-date closure, (b) a date-range hours override, (c) an open-ended change; confirm the booking calendar actually reflects a closed/re-timed day on the right dates. Same for Treatment Prices/Durations -- schedule a range-bounded price and confirm it applies only within that window (and that the treatment falls back to the next-most-specific price once the range lapses, per the "no fallback below the oldest open-ended row" caveat below).

**One risk worth knowing**: `TreatmentPrices`/`TreatmentDurations` resolution is `CROSS APPLY` (not `OUTER APPLY`) -- a treatment with zero currently-matching price/duration rows silently disappears from catalog/booking listings rather than erroring. Today that can't happen because the first price/duration row is always open-ended (`EffectiveTo NULL`, created by `sp_Catalog_CreateTreatment`). If an admin now schedules a bounded (single-date/range) row and lets it lapse *without* a fallback open-ended row still covering that date, the treatment will vanish from listings on that date with no obvious error. This wasn't guarded against (out of scope for what was asked), just flagging it as a footgun for admins scheduling bounded price/duration windows.

## Follow-up fix: LocationHolidays unique-constraint bug (unrelated feature, found live)

Live error hit: `Violation of UNIQUE KEY constraint 'UQ_LocationHolidays_Location_Date'` when re-closing a date that had been closed then reopened. Root cause: `sp_Admin_DeleteLocationClosure` soft-deletes (`IsDelete=1`, row stays), but `UQ_LocationHolidays_Location_Date` was a plain (unfiltered) `UNIQUE` constraint, so the soft-deleted row still occupied that `(LocationId, HolidayDate)` slot forever. Fixed in `db/01_tables.sql` + `db/migrations/013_location_holidays_filtered_unique.sql` (drops the constraint, adds a filtered `WHERE IsDelete = 0` unique index instead, matching the `UQ_LocationDaySchedule_*`/`UQ_TreatmentPrices_*` convention). **Deployed already.** The `ClosuresModal` "Edit" flow (delete-then-recreate) made this bug much easier to hit since it now routinely re-inserts the exact dates it just soft-deleted, but the bug predates that -- any admin re-closing a previously-reopened date would have hit it.

## Other context worth knowing

- Real dev DB creds are in `.NET user-secrets` (`dotnet user-secrets list` from `backend/SaloonApi/`), not `appsettings.json`. `sqlcmd` needs `-I` (QUOTED_IDENTIFIER ON) or filtered-index/CHECK-constraint-touching statements fail with error 1934.
- This session's earlier work (already done, unrelated to this handoff's feature): removed the Mappls/Leaflet map integration entirely (manual lat/lng inputs only, no geocoding), fixed Redis to point at `127.0.0.1:6379`, added per-location/per-chain closures with booking-conflict checks, fixed pay-run duplicate/overlap prevention, refactored break-time-validation/time-conversion duplication across `SettingsPage.tsx`/`LocationsPage.tsx`/`MyLocationPage.tsx`/`SaloonsPage.tsx`/`AddLocationWizard.tsx` into `frontend/apps/adminportal/src/lib/time.ts`, and changed the Settings "Locations & Opening Hours" tab from a location dropdown to a list+detail layout.
