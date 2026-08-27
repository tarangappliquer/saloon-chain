using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;
using SaloonApi.Modules.Identity.Infrastructure;

namespace SaloonApi.Shared.Data.DbServices;

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class StaffDbService
{
    // p_WorkDate is a Postgres `date` parameter -- DbType.Date (not .String) so Npgsql sends it
    // as a date, or Postgres can't resolve the function overload at all ("function ... does not
    // exist", since text->date isn't an implicit cast Postgres will use for overload matching).
    public Task<IEnumerable<StaffAttendanceRow>> sp_Staff_GetAttendanceAsync(IDbConnection db, int locationId, DateOnly workDate)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("WorkDate", workDate, DbType.Date);
        return db.QueryAsync<StaffAttendanceRow>("SELECT * FROM public.sp_Staff_GetAttendance(@LocationId, @WorkDate)", args, commandType: CommandType.Text);
    }

    public Task sp_Staff_LogAttendanceAsync(IDbConnection db, int locationId, int userId, DateOnly workDate, TimeSpan? arrivalTime, TimeSpan? leftTime, int loggedBy)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("UserId", userId, DbType.Int32);
        args.Add("WorkDate", workDate, DbType.Date);
        args.Add("ArrivalTime", arrivalTime, DbType.Time);
        args.Add("LeftTime", leftTime, DbType.Time);
        args.Add("LoggedBy", loggedBy, DbType.Int32);
        return db.ExecuteAsync("SELECT public.sp_Staff_LogAttendance(@LocationId, @UserId, @WorkDate, @ArrivalTime, @LeftTime, @LoggedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<UnattendedPreBookingAlertDto>> sp_Staff_GetUnattendedPreBookingAlertsAsync(IDbConnection db)
    {
        return db.QueryAsync<UnattendedPreBookingAlertDto>("SELECT * FROM public.sp_Staff_GetUnattendedPreBookingAlerts()", commandType: CommandType.Text);
    }

    public Task<IEnumerable<LocationManagerDto>> sp_Staff_GetLocationManagersAsync(IDbConnection db, int locationId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<LocationManagerDto>("SELECT * FROM public.sp_Staff_GetLocationManagers(@LocationId)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<StaffUserRow>> sp_Admin_GetUsersAsync(IDbConnection db, string? role, int? chainId, int? locationId)
    {
        var args = new DynamicParameters();
        args.Add("Role", role, DbType.String);
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<StaffUserRow>("SELECT * FROM public.sp_Admin_GetUsers(@Role, @ChainId, @LocationId)", args, commandType: CommandType.Text);
    }

    public Task<ProxyAssignmentResultDto?> sp_Booking_AssignProxyTherapistAsync(IDbConnection db, int bookingTreatmentId, int proxyTherapistId, int updatedByUserId)
    {
        var args = new DynamicParameters();
        args.Add("BookingTreatmentId", bookingTreatmentId, DbType.Int32);
        args.Add("ProxyTherapistId", proxyTherapistId, DbType.Int32);
        args.Add("UpdatedBy", updatedByUserId, DbType.Int32);
        return db.QuerySingleOrDefaultAsync<ProxyAssignmentResultDto>(
            "SELECT * FROM public.sp_Booking_AssignProxyTherapist(@BookingTreatmentId, @ProxyTherapistId, @UpdatedBy)", args, commandType: CommandType.Text);
    }
}
