using FluentValidation;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Admin.Endpoints;

internal sealed record BlockTypeDto(
    int Id,
    string Name,
    int? ChainId,
    string? ChainName,
    int? LocationId,
    string? LocationName,
    bool IsPaid,
    int DefaultDurationMinutes,
    string ColorHex,
    bool IsActive,
    DateTime CreatedDate);

internal sealed record CreateBlockTypeRequest(
    string Name,
    int? ChainId = null,
    int? LocationId = null,
    bool IsPaid = false,
    int DefaultDurationMinutes = 30,
    string ColorHex = "#F59E0B");

internal sealed record UpdateBlockTypeRequest(
    string Name,
    bool IsPaid,
    int DefaultDurationMinutes,
    string ColorHex,
    bool IsActive);

internal static class AdminBlockTypesEndpoints
{
    public static void MapAdminBlockTypesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/scheduling/block-types")
            .WithTags("AdminScheduling")
            .RequireAuthorization("StaffAccess");

        group.MapGet("", async (int? chainId, int? locationId, SqlConnectionFactory factory, ICurrentUser currentUser, AdminDbService adminDb) =>
        {
            var effectiveChainId = chainId ?? currentUser.ChainId;
            var effectiveLocationId = locationId ?? currentUser.LocationId;

            using var db = factory.Create();
            var items = await adminDb.sp_Admin_GetBlockTypesAsync(db, effectiveChainId, effectiveLocationId);
            return Results.Ok(items);
        })
        .Produces<IReadOnlyList<BlockTypeDto>>()
        .WithDescription("Get block types (saloon level, location level, and global defaults).");

        group.MapPost("", async (CreateBlockTypeRequest req, SqlConnectionFactory factory, ICurrentUser currentUser, AdminDbService adminDb) =>
        {
            int? targetChainId = req.ChainId;
            int? targetLocationId = req.LocationId;

            if (currentUser.IsInRole(UserRole.SuperAdmin, UserRole.Admin))
            {
                targetChainId ??= currentUser.ChainId;
            }
            else if (currentUser.IsInRole(UserRole.Manager, UserRole.Receptionist))
            {
                targetLocationId ??= currentUser.LocationId;
            }

            using var db = factory.Create();
            var id = await adminDb.sp_Admin_CreateBlockTypeAsync(
                db, targetChainId, targetLocationId, req.Name, req.IsPaid, currentUser.RequireUserId());
            return Results.Ok(new IdResponse(id));
        })
        .WithValidation<CreateBlockTypeRequest>()
        .RequireAuthorization("AdminAccess")
        .Produces<IdResponse>()
        .WithDescription("Create a custom block type at saloon level or location level.");

        group.MapPut("/{id:int}", async (int id, UpdateBlockTypeRequest req, SqlConnectionFactory factory, ICurrentUser currentUser, AdminDbService adminDb) =>
        {
            using var db = factory.Create();
            await adminDb.sp_Admin_UpdateBlockTypeAsync(
                db, id, req.Name, req.IsPaid, req.IsActive, currentUser.RequireUserId());
            return Results.NoContent();
        })
        .WithValidation<UpdateBlockTypeRequest>()
        .RequireAuthorization("AdminAccess")
        .Produces(StatusCodes.Status204NoContent)
        .WithDescription("Update an existing block type.");

        group.MapDelete("/{id:int}", async (int id, SqlConnectionFactory factory, ICurrentUser currentUser, AdminDbService adminDb) =>
        {
            using var db = factory.Create();
            await adminDb.sp_Admin_DeleteBlockTypeAsync(db, id, currentUser.RequireUserId());
            return Results.NoContent();
        })
        .RequireAuthorization("AdminAccess")
        .Produces(StatusCodes.Status204NoContent)
        .WithDescription("Delete (soft delete) a custom block type.");
    }
}

internal sealed class CreateBlockTypeRequestValidator : AbstractValidator<CreateBlockTypeRequest>
{
    public CreateBlockTypeRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.DefaultDurationMinutes).GreaterThan(0).LessThanOrEqualTo(1440);
        RuleFor(x => x.ColorHex).MaximumLength(10);
    }
}

internal sealed class UpdateBlockTypeRequestValidator : AbstractValidator<UpdateBlockTypeRequest>
{
    public UpdateBlockTypeRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.DefaultDurationMinutes).GreaterThan(0).LessThanOrEqualTo(1440);
        RuleFor(x => x.ColorHex).MaximumLength(10);
    }
}
