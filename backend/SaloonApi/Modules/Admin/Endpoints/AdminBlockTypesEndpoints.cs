using System.Data;
using Dapper;
using FluentValidation;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
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

        group.MapGet("", async (int? chainId, int? locationId, SqlConnectionFactory factory, ICurrentUser currentUser) =>
        {
            var effectiveChainId = chainId ?? currentUser.ChainId;
            var effectiveLocationId = locationId ?? currentUser.LocationId;

            using var db = factory.Create();
            var items = await db.QuerySpAsync<BlockTypeDto>("dbo.sp_Admin_GetBlockTypes", new
            {
                ChainId = effectiveChainId,
                LocationId = effectiveLocationId
            });
            return Results.Ok(items);
        })
        .Produces<IReadOnlyList<BlockTypeDto>>()
        .WithDescription("Get block types (saloon level, location level, and global defaults).");

        group.MapPost("", async (CreateBlockTypeRequest req, SqlConnectionFactory factory, ICurrentUser currentUser) =>
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
            var p = new DynamicParameters();
            p.Add("@Name", req.Name);
            p.Add("@ChainId", targetChainId);
            p.Add("@LocationId", targetLocationId);
            p.Add("@IsPaid", req.IsPaid);
            p.Add("@DefaultDurationMinutes", req.DefaultDurationMinutes);
            p.Add("@ColorHex", string.IsNullOrWhiteSpace(req.ColorHex) ? "#F59E0B" : req.ColorHex);
            p.Add("@CreatedBy", currentUser.UserId);
            p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);

            await db.ExecuteSpAsync("dbo.sp_Admin_CreateBlockType", p);
            var id = p.Get<int>("@Id");
            return Results.Ok(new IdResponse(id));
        })
        .WithValidation<CreateBlockTypeRequest>()
        .RequireAuthorization("AdminAccess")
        .Produces<IdResponse>()
        .WithDescription("Create a custom block type at saloon level or location level.");

        group.MapPut("/{id:int}", async (int id, UpdateBlockTypeRequest req, SqlConnectionFactory factory, ICurrentUser currentUser) =>
        {
            using var db = factory.Create();
            await db.ExecuteSpAsync("dbo.sp_Admin_UpdateBlockType", new
            {
                Id = id,
                Name = req.Name,
                IsPaid = req.IsPaid,
                DefaultDurationMinutes = req.DefaultDurationMinutes,
                ColorHex = string.IsNullOrWhiteSpace(req.ColorHex) ? "#F59E0B" : req.ColorHex,
                IsActive = req.IsActive,
                UpdatedBy = currentUser.UserId
            });
            return Results.NoContent();
        })
        .WithValidation<UpdateBlockTypeRequest>()
        .RequireAuthorization("AdminAccess")
        .Produces(StatusCodes.Status204NoContent)
        .WithDescription("Update an existing block type.");

        group.MapDelete("/{id:int}", async (int id, SqlConnectionFactory factory, ICurrentUser currentUser) =>
        {
            using var db = factory.Create();
            await db.ExecuteSpAsync("dbo.sp_Admin_DeleteBlockType", new
            {
                Id = id,
                UpdatedBy = currentUser.UserId
            });
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
