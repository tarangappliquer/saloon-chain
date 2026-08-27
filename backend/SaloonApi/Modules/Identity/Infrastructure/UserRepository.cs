using System.Globalization;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Identity.Infrastructure;

internal sealed record UserRecord(
    int Id, string Name, string Email, byte[] PasswordHash, byte[] PasswordSalt,
    UserRole Role, int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator, string? StripeCustomerId,
    string? PhotoPath, bool IsEmailVerified);

internal sealed record StaffUserDto(
    int Id, string Name, string Email, string? Phone, UserRole Role,
    int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator, bool IsActive, DateOnly? JoiningDate, DateTime CreatedDate);

internal sealed record CustomerSummaryDto(int Id, string Name, string Email, string? Phone, bool CanEmulate = true, bool IsWalkIn = false);

internal sealed record AdminCustomerDto(int Id, string Name, string Email, string? Phone, bool IsActive, DateTime CreatedDate, bool CanEmulate = true, bool IsWalkIn = false);

internal sealed record AdminCustomersPageDto(
    IReadOnlyList<AdminCustomerDto> Items, string? NextCursorName, int? NextCursorId, bool HasMore);

internal sealed record CustomerProfileDto(int Id, string Name, string Email, string? Phone, bool IsActive, DateTime CreatedDate, bool IsWalkIn = false);

internal sealed record CustomerNoteDto(
    int Id, string Note, int? ChainId, string? ChainName, int? LocationId, string? LocationName,
    DateTime CreatedDate, string? CreatedByName);

internal sealed record CustomerTagDto(int Id, string Tag, int? ChainId, string? ChainName, int? LocationId, string? LocationName);

internal sealed record StaffAttendanceDto(
    int UserId, string StaffName, string StaffEmail, string StaffRole,
    int? AttendanceId, int LocationId, string WorkDate,
    string? ArrivalTime, string? LeftTime, DateTime? LoggedDate, int? LoggedByUserId);

internal sealed record UnattendedPreBookingAlertDto(
    int BookingId, int LocationId, string LocationName, int BookingTreatmentId,
    string TreatmentName, DateTime StartTime, DateTime EndTime,
    int TherapistId, string AssignedStaffName, string? AssignedStaffEmail,
    string CustomerName, int LeadTimeMinutes);

internal sealed record LocationManagerDto(int UserId, string Name, string Email, string Role);

internal sealed record ProxyAssignmentResultDto(
    int BookingTreatmentId, int BookingId, int LocationId, string LocationName,
    string TreatmentName, DateTime StartTime, DateTime EndTime,
    int OriginalTherapistId, string OriginalTherapistName,
    int ProxyTherapistId, string ProxyTherapistName, string ProxyTherapistEmail, string CustomerName);

internal sealed record StaffUserRow(
    int Id, string Name, string Email, string? Phone, string Role,
    int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator, bool IsActive, DateOnly? JoiningDate, DateTime CreatedDate);

// WorkDate/ArrivalTime/LeftTime are Postgres date/time columns -- DateOnly/TimeOnly? (via the
// registered DateOnlyTypeHandler/TimeOnlyTypeHandler), not DateTime/TimeSpan?, or this record
// can't be positionally materialized once a row actually comes back (see ChainDto above).
internal sealed record StaffAttendanceRow(
    int UserId, string StaffName, string StaffEmail, string StaffRole,
    int? AttendanceId, int LocationId, DateOnly WorkDate,
    TimeOnly? ArrivalTime, TimeOnly? LeftTime, DateTime? LoggedDate, int? LoggedByUserId);

internal sealed record UserRow(
    int Id, string Name, string Email, byte[] PasswordHash, byte[] PasswordSalt,
    string Role, int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator, string? StripeCustomerId,
    string? PhotoPath, bool IsEmailVerified);

internal sealed class UserRepository(
    SqlConnectionFactory factory, ICurrentUser currentUser, StaffDbService staffDb, AuthDbService authDb, AdminDbService adminDb)
{
    public async Task<IReadOnlyList<StaffAttendanceDto>> GetStaffAttendanceAsync(int locationId, DateOnly workDate)
    {
        using var db = factory.Create();
        var workDateStr = workDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var rows = await staffDb.sp_Staff_GetAttendanceAsync(db, locationId, workDate);
        return rows.Select(r => new StaffAttendanceDto(
            r.UserId, r.StaffName, r.StaffEmail, r.StaffRole,
            r.AttendanceId, locationId, workDateStr,
            r.ArrivalTime?.ToString(@"HH\:mm", CultureInfo.InvariantCulture), r.LeftTime?.ToString(@"HH\:mm", CultureInfo.InvariantCulture), r.LoggedDate, r.LoggedByUserId
        )).ToList();
    }

    public async Task LogStaffAttendanceAsync(int locationId, int userId, DateOnly workDate, TimeSpan? arrivalTime, TimeSpan? leftTime, int loggedByUserId)
    {
        using var db = factory.Create();
        await staffDb.sp_Staff_LogAttendanceAsync(db, locationId, userId, workDate, arrivalTime, leftTime, loggedByUserId);
    }

    public async Task<IReadOnlyList<LocationManagerDto>> GetLocationManagersAsync(int locationId)
    {
        using var db = factory.Create();
        return (await staffDb.sp_Staff_GetLocationManagersAsync(db, locationId)).ToList();
    }

    public async Task<IReadOnlyList<UnattendedPreBookingAlertDto>> GetUnattendedPreBookingAlertsAsync()
    {
        using var db = factory.Create();
        return (await staffDb.sp_Staff_GetUnattendedPreBookingAlertsAsync(db)).ToList();
    }

    public async Task<ProxyAssignmentResultDto?> AssignProxyTherapistAsync(int bookingTreatmentId, int proxyTherapistId, int updatedByUserId)
    {
        using var db = factory.Create();
        return await staffDb.sp_Booking_AssignProxyTherapistAsync(db, bookingTreatmentId, proxyTherapistId, updatedByUserId);
    }

    public async Task<int> CreateAsync(
        string name, string email, byte[] hash, byte[] salt, string? phone,
        UserRole role = UserRole.Customer, int? chainId = null, int? locationId = null, int? therapistId = null,
        bool isEmulator = false, DateOnly? joiningDate = null, bool isEmailVerified = false, bool isWalkIn = false)
    {
        using var db = factory.Create();
        return await authDb.sp_Auth_CreateUserAsync(
            db, name, email, hash, salt, phone, role.ToString(), chainId, locationId, therapistId, isEmulator, joiningDate, isWalkIn, currentUser.UserId, isEmailVerified);
    }

    public async Task<UserRecord?> GetByEmailAsync(string email)
    {
        using var db = factory.Create();
        var row = await authDb.sp_Auth_GetUserByEmailAsync(db, email);
        return row is null ? null : ToRecord(row);
    }

    public async Task<UserRecord?> GetByIdAsync(int id)
    {
        using var db = factory.Create();
        var row = await authDb.sp_Auth_GetUserByIdAsync(db, id);
        return row is null ? null : ToRecord(row);
    }

    public async Task<UserRecord?> GetStaffByIdAsync(int id)
    {
        using var db = factory.Create();
        var row = await adminDb.sp_Admin_GetUserByIdAsync(db, id);
        return row is null ? null : ToRecord(row);
    }

    public async Task<IReadOnlyList<CustomerSummaryDto>> SearchCustomersAsync(string search, int? chainId = null, int? locationId = null)
    {
        using var db = factory.Create();
        var rows = await adminDb.sp_Admin_SearchCustomersAsync(db, search, chainId, locationId);
        return rows.ToList();
    }

    public async Task<AdminCustomersPageDto> GetCustomersForAdminAsync(
        string? search, int? chainId = null, int? locationId = null, int pageSize = 50, string? cursorName = null, int? cursorId = null)
    {
        using var db = factory.Create();
        var rows = (await adminDb.sp_Admin_GetCustomersAsync(db, search, chainId, locationId, pageSize, cursorName, cursorId)).ToList();

        var last = rows.Count > 0 ? rows[^1] : null;
        return new AdminCustomersPageDto(rows, last?.Name, last?.Id, rows.Count == pageSize);
    }

    public async Task<CustomerProfileDto?> GetCustomerProfileAsync(int customerId)
    {
        using var db = factory.Create();
        return await adminDb.sp_Admin_GetCustomerProfileAsync(db, customerId);
    }

    public async Task<IReadOnlyList<CustomerNoteDto>> GetCustomerNotesAsync(int customerId, int? chainId, int? locationId)
    {
        using var db = factory.Create();
        var rows = await adminDb.sp_CustomerNote_GetForCustomerAsync(db, customerId, chainId, locationId);
        return rows.ToList();
    }

    public async Task<int> AddCustomerNoteAsync(int customerId, int? chainId, int? locationId, string note)
    {
        using var db = factory.Create();
        return await adminDb.sp_CustomerNote_CreateAsync(db, customerId, chainId, locationId, note, currentUser.RequireUserId());
    }

    public async Task DeleteCustomerNoteAsync(int noteId)
    {
        using var db = factory.Create();
        await adminDb.sp_CustomerNote_DeleteAsync(db, noteId, currentUser.RequireUserId());
    }

    public async Task<IReadOnlyList<CustomerTagDto>> GetCustomerTagsAsync(int customerId, int? chainId, int? locationId)
    {
        using var db = factory.Create();
        var rows = await adminDb.sp_CustomerTag_GetForCustomerAsync(db, customerId, chainId, locationId);
        return rows.ToList();
    }

    public async Task<int> AddCustomerTagAsync(int customerId, int? chainId, int? locationId, string tag)
    {
        using var db = factory.Create();
        return await adminDb.sp_CustomerTag_AddAsync(db, customerId, chainId, locationId, tag, currentUser.RequireUserId());
    }

    public async Task DeleteCustomerTagAsync(int tagId)
    {
        using var db = factory.Create();
        await adminDb.sp_CustomerTag_DeleteAsync(db, tagId, currentUser.RequireUserId());
    }

    public async Task<bool> HasCustomerBookingInChainAsync(int customerId, int chainId)
    {
        using var db = factory.Create();
        return await authDb.sp_User_HasCustomerBookingInChainAsync(db, customerId, chainId);
    }

    public async Task<bool> IsLocationInChainAsync(int locationId, int chainId)
    {
        using var db = factory.Create();
        return await authDb.sp_User_IsLocationInChainAsync(db, locationId, chainId);
    }

    public async Task<bool> ExistsWithRoleAsync(UserRole role)
    {
        using var db = factory.Create();
        return await authDb.sp_User_ExistsWithRoleAsync(db, role.ToString());
    }

    public async Task UpdateCustomerAsync(int id, string name, string? phone, bool isActive)
    {
        using var db = factory.Create();
        await adminDb.sp_Admin_UpdateCustomerAsync(db, id, name, phone, isActive, currentUser.RequireUserId());
    }

    public async Task DeleteCustomerAsync(int id)
    {
        using var db = factory.Create();
        await adminDb.sp_Admin_DeleteCustomerAsync(db, id, currentUser.RequireUserId());
    }

    public async Task UpdatePasswordAsync(int userId, byte[] hash, byte[] salt)
    {
        using var db = factory.Create();
        await authDb.sp_Auth_UpdatePasswordAsync(db, userId, hash, salt);
    }

    public async Task<IReadOnlyList<StaffUserDto>> GetStaffAsync(UserRole? role, int? chainId, int? locationId)
    {
        using var db = factory.Create();
        var rows = await staffDb.sp_Admin_GetUsersAsync(db, role?.ToString(), chainId, locationId);
        return rows.Select(r => new StaffUserDto(
            r.Id, r.Name, r.Email, r.Phone, Enum.Parse<UserRole>(r.Role),
            r.ChainId, r.LocationId, r.TherapistId, r.IsEmulator, r.IsActive, r.JoiningDate, r.CreatedDate)).ToList();
    }

    public async Task UpdateStaffAsync(
        int id, string name, string? phone, string? role, int? chainId, int? locationId, int? therapistId,
        bool isEmulator, DateOnly? joiningDate, bool isActive)
    {
        using var db = factory.Create();
        await adminDb.sp_Admin_UpdateUserAsync(db, id, name, phone, role, chainId, locationId, therapistId, isEmulator, joiningDate, isActive, currentUser.RequireUserId());
    }

    public async Task UpdateStripeCustomerIdAsync(int userId, string stripeCustomerId)
    {
        using var db = factory.Create();
        await authDb.sp_User_UpdateStripeCustomerIdAsync(db, userId, stripeCustomerId);
    }

    private static UserRecord ToRecord(UserRow row) => new(
        row.Id, row.Name, row.Email, row.PasswordHash, row.PasswordSalt,
        Enum.Parse<UserRole>(row.Role), row.ChainId, row.LocationId, row.TherapistId, row.IsEmulator, row.StripeCustomerId,
        row.PhotoPath, row.IsEmailVerified);
}
