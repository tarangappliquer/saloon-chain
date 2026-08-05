# SaloonChains - Architecture, Logic & System Flow Reference

This document provides a comprehensive reference of system architecture, data models, business logic, and runtime flows for AI coding agents working on the SaloonChains repository.

---

## 1. System Architecture Overview

SaloonChains is a multi-tenant salon management and customer booking web platform built with a .NET 10 minimal API backend, SQL Server database with Dapper stored procedures, and a Vite/TypeScript monorepo frontend with pnpm.

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 Vite / React Frontend                  │
                  │  ┌────────────────────┐      ┌──────────────────────┐  │
                  │  │    adminportal     │      │     clientportal     │  │
                  │  └─────────┬──────────┘      └──────────┬───────────┘  │
                  └────────────┼────────────────────────────┼──────────────┘
                               │   @saloon/api-client       │
                               └──────────────┬─────────────┘
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │              SaloonApi (.NET 10 Backend)               │
                  │  ┌──────────────────┐          ┌────────────────────┐  │
                  │  │ Admin Dashboard  │          │  Payment & Stripe  │  │
                  │  └────────┬─────────┘          └─────────┬──────────┘  │
                  │           │  Booking & Scheduling        │             │
                  │           └──────────────┬───────────────┘             │
                  └──────────────────────────┼─────────────────────────────┘
                                             ▼
                  ┌────────────────────────────────────────────────────────┐
                  │          SQL Server (Dapper Stored Procs)              │
                  │       `dbo.sp_Admin_GetDashboardStats`, etc.           │
                  └────────────────────────────────────────────────────────┘
```

### Component Structure:
- **Backend**: `backend/SaloonApi/` (.NET 10 Minimal APIs, Serilog, Dapper, FluentValidation, JWT Auth, Stripe SDK).
- **Frontend Monorepo**: `frontend/`
  - `apps/adminportal`: Partner/Admin dashboard, scheduling grid, staff, catalog, and location management.
  - `apps/clientportal`: Public venue explore, multi-step booking wizard, Stripe checkout, customer profile, and booking history.
  - `packages/ui`: Shared Tailwind CSS component library (`@saloon/ui`).
  - `packages/api-client`: Auto-generated TypeScript-Axios client (`@saloon/api-client`).
- **Database Scripts**: `db/` (Schema definitions in `01_tables.sql`, `02_indexes.sql`, `03_procs.sql`, `04_seed.sql`).

---

## 2. Role-Based Access Control (RBAC) & Scoping

### User Roles:
1. `RootSuperAdmin`: System owner. Accesses data across all salon chains and locations.
2. `SuperAdmin` / `Admin`: Salon chain owner/administrator. Scoped strictly to their assigned `ChainId`.
3. `Manager` / `Receptionist`: Location manager. Scoped strictly to their assigned `LocationId`.
4. `Therapist`: Staff member providing treatments. Scoped to assigned shifts and room openings.
5. `Customer`: End-user making salon bookings.

---

## 3. Real-Time Admin Dashboard Flow

### Endpoint & Data Source:
- **Endpoint**: `GET /api/admin/dashboard?startDate={yyyy-MM-dd}&endDate={yyyy-MM-dd}`
- **Handler**: `AdminDashboardEndpoints.cs`
- **Stored Procedure**: `dbo.sp_Admin_GetDashboardStats`

### Business Logic & SQL Filtering:
1. Accepts optional `@StartDate` and `@EndDate` (defaults to current date if omitted).
2. Calculates:
   - **Today's Revenue**: Total sum of paid bookings/treatments within the selected date range.
   - **Yesterday's Revenue**: Total sum of paid bookings/treatments for the prior matching date period (used for percentage trend comparison).
   - **Appointments Today**: Total count of bookings scheduled for the selected range.
   - **Appointments In-Progress**: Count of bookings currently in active service (`InService`).
   - **Active Therapists**: Count of unique therapists assigned to active shifts on the selected date.
   - **Upcoming Appointments**: List of scheduled appointments sorted by time slot.
3. Filtering automatically adapts based on user role (`RootSuperAdmin` = no filter, `Admin`/`SuperAdmin` = `@ChainId`, `Manager` = `@LocationId`).

### UI Date Controls:
- Located inside the **Shoppey Calendar Diary** card header on `DashboardPage.tsx`.
- Supports **📅 Single Date** mode (selects a single day) and **🗓 Date Range** mode (selects Start Date and End Date).

---

## 4. Multi-Step Booking & Hold Expiry Flow

```
┌──────────────┐     ┌────────────────┐     ┌──────────────┐     ┌──────────────┐
│ Select Venue │ ──► │ Pick Treatments│ ──► │ Pick Schedule│ ──► │  Stripe Pay  │ ──► Confirmed
└──────────────┘     └────────────────┘     └──────────────┘     └──────────────┘
```

1. **Draft Creation**: `dbo.sp_Booking_CreateDraft` initializes a booking in `Draft` status.
2. **Treatment Reservation**: `dbo.sp_Booking_ScheduleTreatment` assigns a room, therapist, start time, and end time. Sets a hold timestamp `ExpiresAt` (typically 15 minutes).
3. **Background Hold Sweep**:
   - `HoldExpirySweepService` runs every 30 seconds.
   - Calls `dbo.sp_Booking_ExpireStaleHolds`.
   - Clears expired room/therapist/time holds on unconfirmed treatments so other customers can book those slots. The draft itself remains intact for re-scheduling.

---

## 5. Stripe Checkout & Session Verification Flow

```
Client Portal                   SaloonApi                     Stripe API
     │                              │                              │
     │ ──► Create Payment Intent ──►│                              │
     │     POST /api/payments/      │ ──► Create Checkout Session ─►│
     │     create-intent            │     (SuccessUrl includes     │
     │                              │      session_id)             │
     │◄── Return Checkout URL ──────│                              │
     │                              │                              │
     │ ──────► Redirect User to Stripe Checkout Page ─────────────►│
     │                                                             │
     │◄────── Redirect User to SuccessUrl ─────────────────────────│
     │        `/book/confirmed?bookingId=X&session_id=cs_test_Y`   │
     │                                                             │
     │ ──► Verify Checkout Session ─►                              │
     │     POST /api/payments/      │ ──► Get Checkout Session ───►│
     │     verify-checkout-session  │◄── Return `paid` status ─────│
     │                              │                              │
     │                              │ ──► Execute `sp_Booking_Confirm`
     │◄── Return Succeeded Result ──│     (Status = 'Confirmed')   │
```

### Key Workflow Details:
1. **Checkout Redirect**: `StripePaymentGateway.cs` constructs a Stripe Checkout Session with `SuccessUrl` set to:
   `SuccessUrl = $"{baseUrl}/book/confirmed?bookingId={bookingId}&session_id={{CHECKOUT_SESSION_ID}}"`
2. **Stripe Webhooks**: `POST /api/payments/stripe-webhook` listens for asynchronous webhook events (`checkout.session.completed`, `payment_intent.succeeded`, `charge.succeeded`). Disables API version mismatch strict exceptions using `throwOnApiVersionMismatch: false` in `EventUtility.ConstructEvent`.
3. **Client Session Verification**:
   - When returning to `/book/confirmed?bookingId=X&session_id=cs_test_Y`, `ConfirmedStep.tsx` displays a **Verifying Payment** state.
   - Calls `POST /api/payments/verify-checkout-session` (`paymentApi.apiPaymentsVerifyCheckoutSessionPost`).
   - `PaymentService.VerifyCheckoutSessionAsync` fetches the session directly from Stripe API via `SessionService.GetAsync(sessionId)`.
   - If session payment status is `paid`:
     - Updates payment record status to `Succeeded`.
     - Invokes `dbo.sp_Booking_Confirm` to transition booking from `Draft` to `Confirmed`.
   - `ConfirmedStep.tsx` renders the **Appointment Confirmed!** view.

---

## 6. Mandatory Agent Policies & Rules

### Direct Axios Rule:
- **DO NOT use `axiosInstance` directly** for API calls in frontend applications.
- ALWAYS consume generated API classes from `@saloon/api-client` (e.g., `adminDashboardApi`, `bookingApi`, `catalogApi`, `paymentApi`).

### OpenAPI Generation Workflow:
When updating backend minimal APIs or regenerating `@saloon/api-client`:
1. Start backend service on a non-default port (e.g. `dotnet run --urls "http://localhost:5199"`).
2. Run `npx @openapitools/openapi-generator-cli generate -i http://localhost:5199/openapi/v1.json -g typescript-axios -o ./packages/api-client/src` from `frontend/`.
3. Immediately kill the background process (`taskkill /F /PID <pid>`) and release port `5199`.

---
