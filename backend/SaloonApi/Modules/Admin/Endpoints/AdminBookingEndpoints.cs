using FluentValidation;
using SaloonApi.Modules.Booking.Application;
using SaloonApi.Modules.Booking.Infrastructure;
using SaloonApi.Modules.Inventory.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Admin.Endpoints;

internal static class AdminBookingEndpoints
{
    public static void MapAdminBookingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/bookings").WithTags("Admin Bookings");

        // Therapists/Other can see their own location's schedule too, not just Admin/Manager/
        // Receptionist -- but StaffAccess only checks role membership, not *which* location, so
        // Manager/Receptionist/Therapist/Other scoping (dbo.Users.LocationId) has to be enforced
        // here or any of those roles could read another location's bookings -- including customer
        // name/email -- just by changing locationId.
        group.MapGet("", async (int locationId, DateOnly date, BookingRepository repo, ICurrentUser currentUser) =>
        {
            if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist, UserRole.Therapist, UserRole.Other) && currentUser.LocationId != locationId)
                return Results.Problem("Not authorized for this location.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await repo.GetForLocationAsync(locationId, date));
        }).RequireAuthorization("StaffAccess")
          .Produces<IReadOnlyList<AdminBookingDto>>()
          .ProducesProblem(StatusCodes.Status401Unauthorized)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a location's bookings for a given date.");

        // Manager scoping has to be checked before cancelling, not after -- sp_Booking_CancelAsAdmin
        // itself has no caller-scoping (it's the "override" proc precisely because it skips the
        // owns-this-booking check sp_Booking_Cancel does for a customer), so without this a Manager
        // could cancel any booking anywhere in the system just by guessing/incrementing the id.
        group.MapPost("/{id:int}/cancel", async (int id, BookingService bookingService, BookingRepository repo, ICurrentUser currentUser) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && await repo.GetLocationIdAsync(id) != currentUser.LocationId)
                return Results.Problem("Not authorized for this booking.", statusCode: StatusCodes.Status403Forbidden);

            await bookingService.CancelAsAdminAsync(id);
            return Results.NoContent();
        }).RequireAuthorization("AdminAccess")
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status401Unauthorized)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Cancel a customer's booking on their behalf, process refund, send email and free its slot.");

        // Drag-to-reschedule on the appointment calendar. Same Manager location-scoping as cancel
        // above -- sp_Booking_RescheduleConfirmed has no caller-scoping of its own either.
        group.MapPut("/{id:int}/treatments/{treatmentId:int}/reschedule", async (
            int id, int treatmentId, RescheduleTreatmentRequest req, BookingService bookingService, BookingRepository repo, ICurrentUser currentUser) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && await repo.GetLocationIdAsync(id) != currentUser.LocationId)
                return Results.Problem("Not authorized for this booking.", statusCode: StatusCodes.Status403Forbidden);

            await bookingService.RescheduleConfirmedAsync(id, treatmentId, req.RoomId, req.TherapistId, req.StartTime, req.EndTime);
            return Results.NoContent();
        }).RequireAuthorization("AdminAccess")
          .WithValidation<RescheduleTreatmentRequest>()
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status401Unauthorized)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .ProducesProblem(StatusCodes.Status409Conflict)
          .WithDescription("Move a Confirmed booking's treatment to a new room/therapist/time.");

        // No-show, like cancel/reschedule above, has no caller-scoping in the proc itself.
        group.MapPost("/{id:int}/no-show", async (int id, BookingService bookingService, BookingRepository repo, ICurrentUser currentUser) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && await repo.GetLocationIdAsync(id) != currentUser.LocationId)
                return Results.Problem("Not authorized for this booking.", statusCode: StatusCodes.Status403Forbidden);

            await bookingService.MarkNoShowAsync(id);
            return Results.NoContent();
        }).RequireAuthorization("AdminAccess")
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status401Unauthorized)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .ProducesProblem(StatusCodes.Status409Conflict)
          .WithDescription("Mark a Confirmed booking (past its start time) as a no-show.");

        // Retail line items on a Draft booking -- the POS/checkout extension point the roadmap
        // deferred until Inventory existed (see FRESHA_PARITY_ROADMAP.md Phase 1). Booking-owns-cart
        // scoping mirrors the schedule/reschedule routes above.
        group.MapGet("/{id:int}/products", async (int id, BookingRepository bookingRepo, InventoryRepository inventoryRepo, ICurrentUser currentUser) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && await bookingRepo.GetLocationIdAsync(id) != currentUser.LocationId)
                return Results.Problem("Not authorized for this booking.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(await inventoryRepo.GetBookingProductsAsync(id));
        }).RequireAuthorization("StaffAccess")
          .Produces<IReadOnlyList<BookingProductDto>>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("List a booking's retail product lines.");

        group.MapPost("/{id:int}/products", async (
            int id, AddBookingProductRequest req, BookingRepository bookingRepo, InventoryRepository inventoryRepo, ICurrentUser currentUser) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && await bookingRepo.GetLocationIdAsync(id) != currentUser.LocationId)
                return Results.Problem("Not authorized for this booking.", statusCode: StatusCodes.Status403Forbidden);

            return Results.Ok(new IdResponse(await inventoryRepo.AddBookingProductAsync(id, req.ProductId, req.Quantity, currentUser.UserId)));
        }).RequireAuthorization("StaffAccess")
          .WithValidation<AddBookingProductRequest>()
          .Produces<IdResponse>()
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .ProducesProblem(StatusCodes.Status409Conflict)
          .WithDescription("Add a retail product line to a Draft booking, priced at the product's current price.");

        group.MapDelete("/{id:int}/products/{productLineId:int}", async (
            int id, int productLineId, BookingRepository bookingRepo, InventoryRepository inventoryRepo, ICurrentUser currentUser) =>
        {
            if (currentUser.IsInRole(UserRole.Manager) && await bookingRepo.GetLocationIdAsync(id) != currentUser.LocationId)
                return Results.Problem("Not authorized for this booking.", statusCode: StatusCodes.Status403Forbidden);

            await inventoryRepo.RemoveBookingProductAsync(productLineId);
            return Results.NoContent();
        }).RequireAuthorization("StaffAccess")
          .Produces(StatusCodes.Status204NoContent)
          .ProducesProblem(StatusCodes.Status403Forbidden)
          .WithDescription("Remove a retail product line from a booking.");
    }
}

internal sealed record AddBookingProductRequest(int ProductId, int Quantity);

internal sealed class AddBookingProductRequestValidator : AbstractValidator<AddBookingProductRequest>
{
    public AddBookingProductRequestValidator()
    {
        RuleFor(x => x.ProductId).GreaterThan(0);
        RuleFor(x => x.Quantity).GreaterThan(0);
    }
}

internal sealed record RescheduleTreatmentRequest(int RoomId, int TherapistId, DateTime StartTime, DateTime EndTime);

internal sealed class RescheduleTreatmentRequestValidator : AbstractValidator<RescheduleTreatmentRequest>
{
    public RescheduleTreatmentRequestValidator()
    {
        RuleFor(x => x.RoomId).GreaterThan(0);
        RuleFor(x => x.TherapistId).GreaterThan(0);
        RuleFor(x => x.EndTime).GreaterThan(x => x.StartTime);
    }
}
