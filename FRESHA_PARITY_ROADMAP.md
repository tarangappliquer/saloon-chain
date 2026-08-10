# Fresha Parity Roadmap — Agent Execution Plan

Reference for AI coding agents implementing Fresha-parity features on SaloonChains. Read [ARCHITECTURE_FLOWS.md](ARCHITECTURE_FLOWS.md) and [CLAUDE.md](CLAUDE.md) first — this document assumes both and does not repeat their conventions (module layout, stored-proc-only DB access, TUS uploads, API client generation workflow, RBAC policies).

`docs/architecture.md` and `docs/initial-project-spec.md` are stale historical snapshots — do not treat them as current state. This document reflects the actual code as of 2026-08-10 (audited directly, not from docs).

---

## 0. Current state (verified against code, not docs)

Backend modules registered in `backend/SaloonApi/Program.cs`: `Identity`, `Config`, `Catalog`, `Booking`, `Payment`, `Admin`, `Scheduling`, `Profile`. DB: `db/01_tables.sql` (21 tables), `db/03_procs.sql` (~90 stored procs, all `CREATE OR ALTER`).

| Area | Status | Key files |
|---|---|---|
| Booking | Mature | `Modules/Booking/Endpoints/BookingEndpoints.cs`, `Application/SlotCalculator.cs`, `BackgroundJobs/HoldExpirySweepService.cs` |
| Scheduling (roster/rooms) | Mature, not a visual calendar | `Modules/Scheduling/Endpoints/SchedulingEndpoints.cs`, `adminportal/src/pages/scheduling/SchedulingPage.tsx` |
| Catalog / pricing | Advanced (effective-dated price + duration) | `Modules/Admin/Endpoints/AdminCatalogEndpoints.cs`, `adminportal/src/pages/catalog/*` |
| Payments | Stripe real; Cash/InHouse are stubs | `Modules/Payment/Application/PaymentService.cs`, `StripePaymentGateway.cs`, `CashPaymentGateway.cs`, `InHousePaymentGateway.cs` |
| Client/CRM | CRUD + search only | `Modules/Admin/Endpoints/AdminCustomersEndpoints.cs`, `adminportal/src/pages/customers/CustomersPage.tsx` |
| Staff/team | CRUD + role hierarchy, no pay/commission | `Modules/Admin/Endpoints/AdminStaffEndpoints.cs` |
| Inventory | Absent | — |
| Marketing (campaigns/discounts/gift cards/memberships) | Absent | — |
| Reviews | Absent — **`ExplorePage.tsx` shows fabricated ratings**, not real data | `frontend/apps/clientportal/src/pages/ExplorePage.tsx` (`rating: 4.8 + (idx % 3) * 0.1`) |
| Reporting | One dashboard endpoint only | `Modules/Admin/Endpoints/AdminDashboardEndpoints.cs`, `db/03_procs.sql:sp_Admin_GetDashboardStats` |
| Admin/multi-location, Identity/auth | Complete | — |

Full gap detail (Fresha capability vs. status vs. specific gap, all 11 areas): see the published audit artifact from this session, or re-derive via `context_search` — do not re-litigate, the table above is the condensed version.

---

## 1. Execution order and why

Order is dependency-driven, not arbitrary:

1. **POS & checkout** — no new subsystem, extends existing `PaymentService`/`IPaymentGateway`. Biggest standalone revenue gap.
2. **CRM depth & calendar UI** — later phases (marketing, reporting) need client tags/history and transaction data to work with.
3. **Inventory, team pay, reporting** — back-office layer; reports need Phase 1's transactions and Phase 2's client data to be meaningful.
4. **Marketing, gift cards, memberships** — needs a client base with history/tags to target (Phase 2) and a real payment surface to sell through (Phase 1).
5. **Marketplace & social** — distribution layer, makes sense once the product is feature-complete.

Do not start Phase 2+ work before Phase 1 is functional unless explicitly told otherwise — each phase's UI/data model assumes the prior phase's tables exist.

---

## 2. Phase 1 — POS & checkout (start here)

**Goal:** front-desk staff can check out a walk-in (services + retail) without going through the customer booking wizard, and take real cash/in-house payments, tips, splits, and partial deposits.

Backend (`Modules/Payment/`):
- Replace `CashPaymentGateway.cs` / `InHousePaymentGateway.cs` stub logic with real reconciliation (confirm/void, drawer-agnostic ledger entry) — keep the `IPaymentGateway` interface, don't redesign it.
- Add split-payment support: a checkout can settle across >1 gateway (e.g. part card, part cash) — likely a new `CheckoutTransaction` aggregate with multiple `Payment` lines rather than the current 1 booking : 1 payment assumption. Check `PaymentService.cs` and the payment table in `db/01_tables.sql` before redesigning.
- Add tip capture (flat or %) at checkout time.
- Add deposit/partial-payment: a booking can be confirmed with a deposit amount less than full price; remaining balance collected at POS on service day.
- New stored procs in `db/03_procs.sql` for any new tables (strict requirement — no EF, no inline SQL, `CREATE OR ALTER`).
- New endpoint group for walk-in checkout (cart of services + retail items, no `BookingId` required) — retail items depend on Phase 3 inventory tables; if inventory isn't built yet, scope POS to services-only first and leave a clear extension point rather than blocking on Phase 3.

Frontend (`adminportal`):
- New POS page: cart, service/product search, tip entry, split-tender UI, receipt view. Design for speed under a receptionist's hands (large touch targets, minimal typing) per [CLAUDE.md](CLAUDE.md) UI conventions (`loading="lazy"`, `decoding="async"` on images, etc.).
- Nav entry in `Nav.tsx` (currently: Dashboard/Saloons/My Location/Bookings/Customers only).
- Generate the API client via `pnpm api` after backend endpoints exist — follow the port-cleanup policy in [CLAUDE.md](CLAUDE.md) exactly (non-default port, kill process after generation).

---

## 3. Phase 2 — CRM depth & appointment calendar

Backend (`Modules/Admin/` or new `Modules/Crm/` if it grows large):
- Client notes, tags, consultation/intake forms (structured, not free text only — Fresha forms are reusable templates), visit history query.
- Real reviews: table + endpoint + submission flow tied to a completed booking. Then **fix `ExplorePage.tsx`** to consume real data and delete the fabricated `rating: 4.8 + (idx % 3) * 0.1` / `reviewCount: 45 + (loc.id * 19) % 150` placeholder logic.

Frontend (`adminportal`):
- Client record page becomes a single scrollable profile (notes/history/forms/upcoming) instead of bare CRUD fields.
- New drag-drop day/week appointment calendar — this is a different surface from `SchedulingPage.tsx` (which manages roster/room-openings, not individual appointments). Don't retrofit `SchedulingPage.tsx`; it has a different job.

---

## 4. Phase 3 — Inventory, team pay, reporting

Backend:
- New `Modules/Inventory/` following the `Modules/Catalog/` pattern: products, stock levels, suppliers, purchase orders, stock deduction on POS sale (depends on Phase 1's checkout transaction model).
- Staff commission rules + pay runs, extending `Modules/Admin/Endpoints/AdminStaffEndpoints.cs` or a new `Modules/Payroll/`.
- Dedicated reports module beyond `AdminDashboardEndpoints.cs`: sales by service/staff/location, retention, no-show rate, CSV export. New stored procs per report, not application-layer aggregation, per the DB conventions in [ARCHITECTURE_FLOWS.md](ARCHITECTURE_FLOWS.md).

Frontend:
- Inventory nav section (adminportal).
- Reports section with real trend charts, not just today/yesterday tiles.

---

## 5. Phase 4 — Marketing, gift cards, memberships

- Discount codes, gift cards, membership/package plans.
- Automated email/SMS (birthday, lapsed-client, reminders) — needs a notification/background-job pattern; check if one exists before adding a new one (`HoldExpirySweepService.cs` and `AvailabilitySyncStartupHostedService.cs` are the existing background-job examples to follow).
- Waitlist and recurring bookings (extends `Modules/Booking/`).

## 6. Phase 5 — Marketplace & social reach

- Social login (Google/Apple/Facebook) — extends `Modules/Identity/`.
- Google/Instagram/Facebook booking channels.
- Chain-wide service-menu templates shared across locations — this is a schema change (`Modules/Catalog` currently pins a treatment to one location; verify against `db/01_tables.sql` before altering — this is a real design decision, confirm with the user before implementing).

---

## Rules for whoever picks this up

- Multi-node safety: API stays stateless, use Redis distributed locks for any new background job (per [CLAUDE.md](CLAUDE.md) Kubernetes section).
- Every new table needs a stored proc, not inline SQL or EF.
- Don't build ahead of the phase order — Phase 3 reporting assumes Phase 1 transaction data exists; building it first means reporting on nothing.
- Flag schema-changing decisions (e.g. Phase 5's chain-wide catalog templates) to the user before implementing — that's a real product/data-model tradeoff, not a mechanical build step.
