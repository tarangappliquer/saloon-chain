using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Admin.Endpoints;

// Init-property, not positional -- Dapper matches these by column NAME (order/count-independent).
internal sealed record DashboardKpiDto
{
    public decimal TodayRevenue { get; init; }
    public decimal YesterdayRevenue { get; init; }
    public int AppointmentsToday { get; init; }
    public int AppointmentsInProgress { get; init; }
    public int ActiveTherapists { get; init; }
}

internal sealed record DashboardUpcomingAppointmentDto
{
    public int BookingId { get; init; }
    public DateTime StartTime { get; init; }
    public DateTime EndTime { get; init; }
    public string CustomerName { get; init; } = "";
    public string LocationName { get; init; } = "";
    public string? TherapistName { get; init; }
    public string Status { get; init; } = "";
    public decimal TotalAmount { get; init; }
    // The admin panel shows every booking time in ITS OWN location's timezone rather than
    // converting per-viewer (an admin scanning appointments across several locations/chains needs
    // an unambiguous reading of each one's actual local time) -- carried alongside StartTime/EndTime
    // so the frontend can format and tag it without a second round trip.
    public string? TimeZoneId { get; init; }
}

internal sealed record DashboardResponseDto(
    DashboardKpiDto Kpis,
    IReadOnlyList<DashboardUpcomingAppointmentDto> UpcomingAppointments);

internal static class AdminDashboardEndpoints
{
    public static void MapAdminDashboardEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/dashboard", async (ICurrentUser currentUser, SqlConnectionFactory factory, AdminDbService adminDb, string? startDate = null, string? endDate = null) =>
        {
            using var db = factory.Create();
            string roleName = currentUser.Role?.ToString() ?? "Customer";
            int? chainId = currentUser.ChainId;
            int? locationId = currentUser.LocationId;

            object start = string.IsNullOrWhiteSpace(startDate) ? (object)DBNull.Value : DateTime.Parse(startDate, System.Globalization.CultureInfo.InvariantCulture).Date;
            object end = string.IsNullOrWhiteSpace(endDate) ? (object)DBNull.Value : DateTime.Parse(endDate, System.Globalization.CultureInfo.InvariantCulture).Date;

            using var multi = await adminDb.sp_Admin_GetDashboardStatsAsync(db, roleName, chainId, locationId, start, end);

            var kpis = await multi.ReadSingleAsync<DashboardKpiDto>();
            var upcoming = (await multi.ReadAsync<DashboardUpcomingAppointmentDto>()).ToList();

            return Results.Ok(new DashboardResponseDto(kpis, upcoming));
        }).RequireAuthorization("StaffAccess")
          .Produces<DashboardResponseDto>()
          .WithTags("AdminDashboard")
          .WithDescription("Get real-time dashboard KPIs and upcoming appointments scoped by user role and chain/location.");
    }
}
