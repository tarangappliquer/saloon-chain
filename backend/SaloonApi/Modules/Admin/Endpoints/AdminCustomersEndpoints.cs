using FluentValidation;
using SaloonApi.Modules.Identity.Application;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Admin.Endpoints;

internal static class AdminCustomersEndpoints
{
    public static void MapAdminCustomersEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/customers").RequireAuthorization("StaffAccess").WithTags("Admin Customers")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        // Backs the adminportal's emulation picker -- search only (no "list everyone" use case),
        // same StaffAccess gate as the emulate exchange itself in AuthEndpoints (any staff role can
        // be emulator-eligible, see AuthService.EmulatorEligibleRoles).
        group.MapGet("/search", async (string q, ICurrentUser currentUser, UserRepository repo) =>
        {
            int? chainId = currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin) ? currentUser.ChainId : null;
            return Results.Ok(await repo.SearchCustomersAsync(q, chainId));
        })
        .Produces<IReadOnlyList<CustomerSummaryDto>>()
        .WithDescription("Search customers by name/email for the emulation picker.");

        // Full roster (inactive included, no row cap) for the Customers management page --
        // RootSuperAdmin/SuperAdmin/Admin/Manager (Receptionist/Therapist/Other can't reach
        // adminportal at all since the portal login gate, but AdminAccess is layered here too for
        // defense in depth, same as everywhere else in this file's sibling endpoints).
        group.MapGet("", async (string? search, ICurrentUser currentUser, UserRepository repo) =>
        {
            int? chainId = currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin) ? currentUser.ChainId : null;
            return Results.Ok(await repo.GetCustomersForAdminAsync(search, chainId));
        })
        .RequireAuthorization("AdminAccess")
        .Produces<IReadOnlyList<AdminCustomerDto>>()
        .WithDescription("List customers, including inactive, for admin management.");

        // CustomerManagement, not AdminAccess -- Manager may edit/delete/view a customer but not
        // create one (see Program.cs's CustomerManagement policy).
        group.MapPost("", async (CreateCustomerRequest req, AuthService auth) =>
            Results.Ok(new IdResponse(await auth.CreateCustomerAsync(req.Name, req.Email, req.Phone))))
            .WithValidation<CreateCustomerRequest>()
            .RequireAuthorization("CustomerManagement")
            .Produces<IdResponse>()
            .WithDescription("Create a new customer account (RootSuperAdmin/SuperAdmin/Admin only).");

        group.MapPut("/{id:int}", async (int id, UpdateCustomerRequest req, UserRepository repo, SaloonApi.Modules.Payment.Application.StripeCustomerService stripeCustomerService) =>
        {
            await repo.UpdateCustomerAsync(id, req.Name, req.Phone, req.IsActive);
            var user = await repo.GetByIdAsync(id);
            if (user is not null)
            {
                await stripeCustomerService.SyncCustomerAsync(id, req.Name, user.Email, req.Phone);
            }
            return Results.NoContent();
        }).WithValidation<UpdateCustomerRequest>()
        .RequireAuthorization("AdminAccess")
        .Produces(StatusCodes.Status204NoContent)
        .WithDescription("Update a customer's name/phone/active state.");

        group.MapDelete("/{id:int}", async (int id, UserRepository repo) =>
        {
            await repo.DeleteCustomerAsync(id);
            return Results.NoContent();
        }).RequireAuthorization("AdminAccess")
        .Produces(StatusCodes.Status204NoContent)
        .WithDescription("Soft-delete a customer account.");
    }
}

// No Password field -- see CreateStaffRequest's equivalent comment in AdminStaffEndpoints.cs.
internal sealed record CreateCustomerRequest(string Name, string Email, string? Phone);
internal sealed record UpdateCustomerRequest(string Name, string? Phone, bool IsActive);

internal sealed class CreateCustomerRequestValidator : AbstractValidator<CreateCustomerRequest>
{
    public CreateCustomerRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Phone).MaximumLength(30);
    }
}

internal sealed class UpdateCustomerRequestValidator : AbstractValidator<UpdateCustomerRequest>
{
    public UpdateCustomerRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Phone).MaximumLength(30);
    }
}
