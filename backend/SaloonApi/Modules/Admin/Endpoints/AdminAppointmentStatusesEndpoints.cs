using System.Data;
using Dapper;
using FluentValidation;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Validation;

namespace SaloonApi.Modules.Admin.Endpoints;

internal sealed record AppointmentStatusDto(
    int Id,
    string Name,
    int? ChainId,
    string? ChainName,
    int? LocationId,
    string? LocationName,
    string ColorHex,
    short SortOrder,
    bool IsSystem,
    bool IsActive,
    DateTime CreatedDate);

internal sealed record CreateAppointmentStatusRequest(
    string Name,
    int? ChainId = null,
    int? LocationId = null,
    string ColorHex = "#3B82F6",
    short SortOrder = 0);

internal sealed record UpdateAppointmentStatusRequest(
    string Name,
    string ColorHex,
    short SortOrder,
    bool IsActive);

internal static class AdminAppointmentStatusesEndpoints
{
    public static void MapAdminAppointmentStatusesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/appointment-statuses")
            .WithTags("AdminAppointmentStatuses")
            .RequireAuthorization("StaffAccess");

        group.MapGet("", async (int? chainId, int? locationId, SqlConnectionFactory factory, ICurrentUser currentUser) =>
        {
            var effectiveChainId = chainId ?? currentUser.ChainId;
            var effectiveLocationId = locationId ?? currentUser.LocationId;

            using var db = factory.Create();
            var items = await db.QuerySpAsync<AppointmentStatusDto>("public.sp_Admin_GetAppointmentStatuses", new
            {
                ChainId = effectiveChainId,
                LocationId = effectiveLocationId
            });
            return Results.Ok(items);
        })
        .Produces<IReadOnlyList<AppointmentStatusDto>>()
        .WithDescription("Get appointment progress statuses (saloon level, location level, and global defaults).");

        group.MapPost("", async (CreateAppointmentStatusRequest req, SqlConnectionFactory factory, ICurrentUser currentUser) =>
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
            p.Add("p_Name", req.Name);
            p.Add("p_ChainId", targetChainId);
            p.Add("p_LocationId", targetLocationId);
            p.Add("p_ColorHex", string.IsNullOrWhiteSpace(req.ColorHex) ? "#3B82F6" : req.ColorHex);
            p.Add("p_SortOrder", req.SortOrder);
            p.Add("p_CreatedBy", currentUser.UserId);
            p.Add("p_Id", dbType: DbType.Int32, direction: ParameterDirection.Output);

            await db.ExecuteSpAsync("public.sp_Admin_CreateAppointmentStatus", p);
            var id = p.Get<int>("p_Id");
            return Results.Ok(new IdResponse(id));
        })
        .WithValidation<CreateAppointmentStatusRequest>()
        .RequireAuthorization("AdminAccess")
        .Produces<IdResponse>()
        .WithDescription("Create a custom appointment status at saloon level or location level.");

        group.MapPut("/{id:int}", async (int id, UpdateAppointmentStatusRequest req, SqlConnectionFactory factory, ICurrentUser currentUser) =>
        {
            using var db = factory.Create();
            await db.ExecuteSpAsync("public.sp_Admin_UpdateAppointmentStatus", new
            {
                Id = id,
                Name = req.Name,
                ColorHex = string.IsNullOrWhiteSpace(req.ColorHex) ? "#3B82F6" : req.ColorHex,
                SortOrder = req.SortOrder,
                IsActive = req.IsActive,
                UpdatedBy = currentUser.UserId
            });
            return Results.NoContent();
        })
        .WithValidation<UpdateAppointmentStatusRequest>()
        .RequireAuthorization("AdminAccess")
        .Produces(StatusCodes.Status204NoContent)
        .WithDescription("Update an existing appointment status.");

        group.MapDelete("/{id:int}", async (int id, SqlConnectionFactory factory, ICurrentUser currentUser) =>
        {
            using var db = factory.Create();
            await db.ExecuteSpAsync("public.sp_Admin_DeleteAppointmentStatus", new
            {
                Id = id,
                UpdatedBy = currentUser.UserId
            });
            return Results.NoContent();
        })
        .RequireAuthorization("AdminAccess")
        .Produces(StatusCodes.Status204NoContent)
        .WithDescription("Delete (soft delete) a custom appointment status.");
    }
}

internal sealed class CreateAppointmentStatusRequestValidator : AbstractValidator<CreateAppointmentStatusRequest>
{
    public CreateAppointmentStatusRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(50);
        RuleFor(x => x.ColorHex).MaximumLength(10);
    }
}

internal sealed class UpdateAppointmentStatusRequestValidator : AbstractValidator<UpdateAppointmentStatusRequest>
{
    public UpdateAppointmentStatusRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(50);
        RuleFor(x => x.ColorHex).MaximumLength(10);
    }
}
