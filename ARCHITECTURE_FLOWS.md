# SaloonChains - Architecture, Logic & System Flow Reference

This document provides a comprehensive reference of system architecture, data models, business logic, database procedures, real-time streaming, and runtime flows for AI coding agents working on the SaloonChains repository.

---

## 1. System Architecture Overview

SaloonChains is a multi-tenant salon management and customer booking web platform built with a .NET 10 minimal API backend, PostgreSQL 18+ database with Dapper stored procedures/functions, and a Vite/TypeScript monorepo frontend with pnpm.

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
                  │          PostgreSQL 18+ (Dapper Stored Procs)          │
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
- **Database Scripts**: `db/` (Schema definitions in `01_tables.sql`, `02_types.sql`, `03_procs.sql`, `04_seed.sql`, `migrations/`).

---

## 2. Role-Based Access Control (RBAC) & Scoping

### User Roles:
1. `RootSuperAdmin`: System owner. Accesses data across all salon chains and locations.
2. `SuperAdmin` / `Admin`: Salon chain owner/administrator. Scoped strictly to their assigned `ChainId`.
3. `Manager` / `Receptionist`: Location manager. Scoped strictly to their assigned `LocationId`.
4. `Therapist`: Staff member providing treatments. Scoped to assigned shifts and room openings.
5. `Customer`: End-user making salon bookings.

---

## 3. Open Room & Open Date Domain Rules

### Core Domain Rules:
1. **Opened Room**: A room is considered **Opened** for a shift/date if and only if:
   - **Room Status**: Room is active and not deleted (`r.IsDelete = 0 AND r.IsActive = 1`).
   - **Category Assigned**: Treatment category is assigned to the room for that shift/date (`dbo.RoomCategoryAssignments`).
   - **Therapist Assigned**: Active therapist is assigned to work that shift/date (`dbo.ShiftAssignments` + `dbo.TherapistProfile`).
2. **Opened Date**: A date is considered **Opened** for a location if and only if:
   - In at least one shift (e.g. Morning, Evening, or FullDay) on that date, at least one room is Opened (satisfying Rule 1).

### SQL Stored Procedure Enforcement:
- `dbo.sp_Booking_GetLocationOpenDates`: Joins `dbo.RoomCategoryAssignments`, `dbo.Rooms`, `dbo.ShiftAssignments`, and `dbo.TherapistProfile` to return only dates matching both category AND therapist shift criteria.
- `dbo.sp_Booking_HasLocationRoomOpenings`: Checks for active room openings backed by therapist shift assignments.
- **Weekly Mask Override**: In `BookingService.cs`, explicitly opened dates (`openDates.Contains(d)`) override the location default `WorkingDaysMask`.

---

## 4. 15-Minute Slot Calculation & Grid Math

### Slot Units:
- Every duration slot represents **15 minutes** (`slotMinutes = 15`).
- Treatment duration math across database, backend `SlotCalculator`, and frontend displays: `durationSlots * 15` minutes.

### Candidate Start Walk:
- `SlotCalculator.ComputeAvailableSlots` walks candidate start times in 15-minute increments (`00:00`, `00:15`, `00:30`, `00:45`, etc.).
- Off-interval interval overlap formula for 15-minute grid alignment:
  `slot < t.endTimeStr && nextSlot > t.startTimeStr`

---

## 5. Cascade Deletion Policy for Bookings

- Deleting a booking entry from `[dbo].[Bookings]` automatically deletes all associated child rows in `[dbo].[BookingTreatments]` and `[dbo].[Payments]` via foreign key `ON DELETE CASCADE`:
  - `CONSTRAINT FK_BookingTreatments_Bookings FOREIGN KEY (BookingId) REFERENCES dbo.Bookings(Id) ON DELETE CASCADE`
  - `CONSTRAINT FK_Payments_Bookings FOREIGN KEY (BookingId) REFERENCES dbo.Bookings(Id) ON DELETE CASCADE`
- **Transactional Procedure**: `dbo.sp_Booking_Delete` deletes booking records cleanly within a single database transaction.

---

## 6. Real-Time SSE Fan-Out Architecture

### Backend Event Broadcasting:
- **`SseBroadcaster.cs`**: Manages Server-Sent Events fan-out to connected clients.
- **Location-Wide Broadcast**: `sse.Publish(locationId, workDate, "slot-changed")` notifies both location-wide subscribers (`LocationGroup(locationId)`) and date-specific subscribers (`Group(locationId, date)`).
- **Anonymous Endpoint**: `GET /api/booking/stream?locationId={id}&date={yyyy-MM-dd}` (`date` is optional).

### Client Portal Reactive Listener:
- **`useAvailabilityStream.ts`**: Subscribes to location-wide SSE stream.
- **`ScheduleStep.tsx`**: On receiving a `slot-changed` event, automatically re-runs `loadDates` and `loadSlots` in real time, lighting up newly opened calendar dates and updated time slots with zero manual page refreshes.

---

## 7. Multi-Treatment Selection & Validation Flow

```
┌──────────────────────────┐     ┌────────────────────────────┐     ┌────────────────────────┐
│ Multi-Treatment Selection│ ──► │ Available Dates Filtering  │ ──► │ Slot Picker Validation │
└──────────────────────────┘     └────────────────────────────┘     └────────────────────────┘
```

1. **Available Dates Multi-Treatment Verification**:
   - `GET /api/booking/available-dates?locationId=X&treatmentIds=1,2,3`: `BookingService.GetAvailableDatesAsync` verifies that **every** selected treatment has `> 0` available slots for each date in the window.
2. **Pre-Addition Popup Modal**:
   - In `ScheduleStep.tsx`, attempting to add a new treatment intercepts the action (`handleAddTreatment`). If the target treatment has 0 slots on the currently selected date, displays a validation popup offering **"Switch Date & Add Treatment"** or **"Cancel"**.
3. **Unserviceable Warning Banners**:
   - `SlotPicker.tsx` displays warning banners with inline `"Remove [Treatment]"` buttons if any selected treatment is unserviceable on the selected date.

---

## 8. Stripe Checkout & Session Verification Flow

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

1. **Checkout Redirect**: `StripePaymentGateway.cs` constructs a Stripe Checkout Session with `SuccessUrl` set to:
   `SuccessUrl = $"{baseUrl}/book/confirmed?bookingId={bookingId}&session_id={{CHECKOUT_SESSION_ID}}"`
2. **Stripe Webhooks**: `POST /api/payments/stripe-webhook` listens for asynchronous webhook events (`checkout.session.completed`, `payment_intent.succeeded`, `charge.succeeded`).
3. **Client Session Verification**:
   - `ConfirmedStep.tsx` calls `POST /api/payments/verify-checkout-session`.
   - `PaymentService.VerifyCheckoutSessionAsync` verifies payment status directly with Stripe API.
   - Invokes `dbo.sp_Booking_Confirm` to transition booking from `Draft` to `Confirmed`.

---

## 9. Mandatory Agent Policies & Rules

### Direct Axios Rule:
- **DO NOT use `axiosInstance` directly** for API calls in frontend applications.
- ALWAYS consume generated API classes from `@saloon/api-client` (e.g., `adminDashboardApi`, `bookingApi`, `catalogApi`, `paymentApi`).

### OpenAPI Generation Workflow:
When updating backend minimal APIs or regenerating `@saloon/api-client`:
1. Start the backend service on a non-default port (e.g. `--urls "http://localhost:5199"` instead of default `5127`).
2. Run `openapi-generator-cli generate` targeting that non-default port (e.g. `http://localhost:5199/openapi/v1.json`).
3. Immediately kill the backend process and release the non-default port once generation completes.

---

## 10. Admin Scheduling Modification Safeguards (/scheduling)

In `/scheduling?chainId=X&locationId=Y`, admin scheduling modifications are guarded by active booking checks to prevent invalidating customer appointments:

1. **Room Closure Safeguard (`DELETE /api/admin/scheduling/room-openings/{id}`)**:
   - Checks if any active bookings (`Confirmed` or active unexpired `Draft`) exist for that `RoomId` on `WorkDate` via `sp_Scheduling_HasRoomBookings`.
   - If bookings exist, returns `400 Bad Request` ("Cannot close room; existing bookings exist for this room.").

2. **Category Change Safeguard (`POST /api/admin/scheduling/room-openings`)**:
   - When attempting to assign a different `TreatmentCategoryId` to an existing room opening, checks `sp_Scheduling_HasRoomBookings`.
   - If bookings exist, returns `400 Bad Request` ("Cannot change category; existing bookings exist for this room.").

3. **Therapist Removal Safeguard (`DELETE /api/admin/scheduling/therapist-shifts/{id}`)**:
   - Checks if active bookings exist for that therapist or room on that date/shift via `sp_Scheduling_HasShiftBookings`.
   - If bookings exist, returns `400 Bad Request` ("Cannot remove therapist; existing bookings exist for this shift.").
