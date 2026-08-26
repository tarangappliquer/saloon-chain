using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Admin.Endpoints;

internal sealed record DashboardKpiDto(
    decimal TodayRevenue,
    decimal YesterdayRevenue,
    int AppointmentsToday,
    int AppointmentsInProgress,
    int ActiveTherapists);

internal sealed record DashboardUpcomingAppointmentDto(
    int BookingId,
    DateTime AppointmentDate,
    TimeSpan StartTimeSlot,
    TimeSpan EndTimeSlot,
    string CustomerName,
    string LocationName,
    string? TherapistName,
    string Status,
    decimal TotalAmount);

internal sealed record DashboardResponseDto(
    DashboardKpiDto Kpis,
    IReadOnlyList<DashboardUpcomingAppointmentDto> UpcomingAppointments);

internal static class AdminDashboardEndpoints
{
    public static void MapAdminDashboardEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/dashboard", async (ICurrentUser currentUser, SqlConnectionFactory factory, string? startDate = null, string? endDate = null) =>
        {
            using var db = factory.Create();
            string roleName = currentUser.Role?.ToString() ?? "Customer";
            int? chainId = currentUser.ChainId;
            int? locationId = currentUser.LocationId;

            using var multi = await db.QueryMultipleSpAsync("public.sp_Admin_GetDashboardStats", new
            {
                Role = roleName,
                ChainId = chainId,
                LocationId = locationId,
                StartDate = string.IsNullOrWhiteSpace(startDate) ? (object)DBNull.Value : DateTime.Parse(startDate, System.Globalization.CultureInfo.InvariantCulture).Date,
                EndDate = string.IsNullOrWhiteSpace(endDate) ? (object)DBNull.Value : DateTime.Parse(endDate, System.Globalization.CultureInfo.InvariantCulture).Date
            });

            var kpis = await multi.ReadSingleAsync<DashboardKpiDto>();
            var upcoming = (await multi.ReadAsync<DashboardUpcomingAppointmentDto>()).ToList();

            return Results.Ok(new DashboardResponseDto(kpis, upcoming));
        }).RequireAuthorization("StaffAccess")
          .Produces<DashboardResponseDto>()
          .WithTags("AdminDashboard")
          .WithDescription("Get real-time dashboard KPIs and upcoming appointments scoped by user role and chain/location.");
    }
}
