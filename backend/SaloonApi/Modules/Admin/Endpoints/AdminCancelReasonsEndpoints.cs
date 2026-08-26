using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Admin.Endpoints;

internal sealed record CancelReasonDto(int Id, string Name, short SortOrder);

internal static class AdminCancelReasonsEndpoints
{
    public static void MapAdminCancelReasonsEndpoints(this IEndpointRouteBuilder app)
    {
        // Fixed global master list (see db/01_tables.sql) -- no create/update/delete, just the read
        // every "cancel booking" UI needs to populate its reason picker.
        app.MapGet("/api/admin/cancel-reasons", async (SqlConnectionFactory factory) =>
        {
            using var db = factory.Create();
            var items = await db.QuerySpAsync<CancelReasonDto>("public.sp_Admin_GetCancelReasons");
            return Results.Ok(items);
        })
        .WithTags("AdminCancelReasons")
        .RequireAuthorization("StaffAccess")
        .Produces<IReadOnlyList<CancelReasonDto>>()
        .WithDescription("List the fixed cancellation-reason master list.");
    }
}
