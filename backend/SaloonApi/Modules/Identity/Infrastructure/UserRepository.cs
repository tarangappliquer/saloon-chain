using System.Data;
using System.Globalization;
using Dapper;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;

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

// Keyset pagination, not page-number/offset -- see sp_Admin_GetCustomers' own comment for why.
// NextCursorName/NextCursorId are the last item's own Name/Id, echoed straight back by the caller
// as @CursorName/@CursorId to fetch the next page; both null once HasMore is false.
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

internal sealed class UserRepository(SqlConnectionFactory factory, ICurrentUser currentUser)
{
    public async Task<IReadOnlyList<StaffAttendanceDto>> GetStaffAttendanceAsync(int locationId, DateOnly workDate)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<StaffAttendanceRow>("public.sp_Staff_GetAttendance", new
        {
            LocationId = locationId,
            WorkDate = workDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
        });
        return rows.Select(r => new StaffAttendanceDto(
            r.UserId, r.StaffName, r.StaffEmail, r.StaffRole,
            r.AttendanceId, locationId, workDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            r.ArrivalTime?.ToString(@"hh\:mm", CultureInfo.InvariantCulture), r.LeftTime?.ToString(@"hh\:mm", CultureInfo.InvariantCulture), r.LoggedDate, r.LoggedByUserId
        )).ToList();
    }

    public async Task LogStaffAttendanceAsync(int locationId, int userId, DateOnly workDate, TimeSpan? arrivalTime, TimeSpan? leftTime, int loggedByUserId)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Staff_LogAttendance", new
        {
            LocationId = locationId,
            UserId = userId,
            WorkDate = workDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ArrivalTime = arrivalTime,
            LeftTime = leftTime,
            LoggedBy = loggedByUserId
        });
    }

    public async Task<IReadOnlyList<LocationManagerDto>> GetLocationManagersAsync(int locationId)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<LocationManagerDto>("public.sp_Staff_GetLocationManagers", new { LocationId = locationId })).ToList();
    }

    public async Task<IReadOnlyList<UnattendedPreBookingAlertDto>> GetUnattendedPreBookingAlertsAsync()
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<UnattendedPreBookingAlertDto>("public.sp_Staff_GetUnattendedPreBookingAlerts")).ToList();
    }

    public async Task<ProxyAssignmentResultDto?> AssignProxyTherapistAsync(int bookingTreatmentId, int proxyTherapistId, int updatedByUserId)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<ProxyAssignmentResultDto>("public.sp_Booking_AssignProxyTherapist", new
        {
            BookingTreatmentId = bookingTreatmentId,
            ProxyTherapistId = proxyTherapistId,
            UpdatedBy = updatedByUserId
        });
    }

    private sealed record StaffAttendanceRow(
        int UserId, string StaffName, string StaffEmail, string StaffRole,
        int? AttendanceId, int LocationId, DateTime WorkDate,
        TimeSpan? ArrivalTime, TimeSpan? LeftTime, DateTime? LoggedDate, int? LoggedByUserId);

    public async Task<int> CreateAsync(
        string name, string email, byte[] hash, byte[] salt, string? phone,
        UserRole role = UserRole.Customer, int? chainId = null, int? locationId = null, int? therapistId = null,
        bool isEmulator = false, DateOnly? joiningDate = null, bool isEmailVerified = false, bool isWalkIn = false)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@Name", name);
        p.Add("@Email", email);
        p.Add("@PasswordHash", hash);
        p.Add("@PasswordSalt", salt);
        p.Add("@Phone", phone);
        p.Add("@Role", role.ToString());
        p.Add("@ChainId", chainId);
        p.Add("@LocationId", locationId);
        p.Add("@TherapistId", therapistId);
        p.Add("@IsEmulator", isEmulator);
        p.Add("@JoiningDate", joiningDate);
        p.Add("@IsWalkIn", isWalkIn);
        // Null for self-registration (no logged-in user yet); set for admin-created staff logins.
        p.Add("@CreatedBy", currentUser.UserId);
        // True only for AdminSeeder's bootstrap account -- everyone else goes through the normal
        // change-email-verify flow to prove they own their address.
        p.Add("@IsEmailVerified", isEmailVerified);
        p.Add("@UserId", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await db.ExecuteSpAsync("public.sp_Auth_CreateUser", p);
        return p.Get<int>("@UserId");
    }

    public async Task<UserRecord?> GetByEmailAsync(string email)
    {
        using var db = factory.Create();
        var row = await db.QuerySingleSpAsync<UserRow>("public.sp_Auth_GetUserByEmail", new { Email = email });
        return row is null ? null : ToRecord(row);
    }

    // Used by the emulation exchange to re-check the acting staff member's IsEmulator flag (and
    // load the target customer) straight from the database rather than trusting a JWT claim --
    // that flag can be toggled after the staff member's token was issued.
    public async Task<UserRecord?> GetByIdAsync(int id)
    {
        using var db = factory.Create();
        var row = await db.QuerySingleSpAsync<UserRow>("public.sp_Auth_GetUserById", new { Id = id });
        return row is null ? null : ToRecord(row);
    }

    // Same as GetByIdAsync but doesn't exclude deactivated users -- see AdminStaffEndpoints' PUT
    // handler, which needs to find a staff member regardless of IsActive (that's the very field
    // it's often being called to flip back on).
    public async Task<UserRecord?> GetStaffByIdAsync(int id)
    {
        using var db = factory.Create();
        var row = await db.QuerySingleSpAsync<UserRow>("public.sp_Admin_GetUserById", new { Id = id });
        return row is null ? null : ToRecord(row);
    }

    public async Task<IReadOnlyList<CustomerSummaryDto>> SearchCustomersAsync(string search, int? chainId = null, int? locationId = null)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<CustomerSummaryDto>("public.sp_Admin_SearchCustomers", new { Search = search, ChainId = chainId, LocationId = locationId });
        return rows.ToList();
    }

    public async Task<AdminCustomersPageDto> GetCustomersForAdminAsync(
        string? search, int? chainId = null, int? locationId = null, int pageSize = 50, string? cursorName = null, int? cursorId = null)
    {
        using var db = factory.Create();
        var rows = (await db.QuerySpAsync<AdminCustomerDto>("public.sp_Admin_GetCustomers", new
        {
            Search = search,
            ChainId = chainId,
            LocationId = locationId,
            PageSize = pageSize,
            CursorName = cursorName,
            CursorId = cursorId
        })).ToList();

        var last = rows.Count > 0 ? rows[^1] : null;
        return new AdminCustomersPageDto(rows, last?.Name, last?.Id, rows.Count == pageSize);
    }

    public async Task<CustomerProfileDto?> GetCustomerProfileAsync(int customerId)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<CustomerProfileDto>("public.sp_Admin_GetCustomerProfile", new { CustomerId = customerId });
    }

    public async Task<IReadOnlyList<CustomerNoteDto>> GetCustomerNotesAsync(int customerId, int? chainId, int? locationId)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<CustomerNoteDto>("public.sp_CustomerNote_GetForCustomer",
            new { CustomerId = customerId, ChainId = chainId, LocationId = locationId });
        return rows.ToList();
    }

    public async Task<int> AddCustomerNoteAsync(int customerId, int? chainId, int? locationId, string note)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<int>("public.sp_CustomerNote_Create",
            new { CustomerId = customerId, ChainId = chainId, LocationId = locationId, Note = note, CreatedBy = currentUser.RequireUserId() });
    }

    public async Task DeleteCustomerNoteAsync(int noteId)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_CustomerNote_Delete", new { Id = noteId, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<IReadOnlyList<CustomerTagDto>> GetCustomerTagsAsync(int customerId, int? chainId, int? locationId)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<CustomerTagDto>("public.sp_CustomerTag_GetForCustomer",
            new { CustomerId = customerId, ChainId = chainId, LocationId = locationId });
        return rows.ToList();
    }

    public async Task<int> AddCustomerTagAsync(int customerId, int? chainId, int? locationId, string tag)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<int>("public.sp_CustomerTag_Add",
            new { CustomerId = customerId, ChainId = chainId, LocationId = locationId, Tag = tag, CreatedBy = currentUser.RequireUserId() });
    }

    public async Task DeleteCustomerTagAsync(int tagId)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_CustomerTag_Delete", new { Id = tagId, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<bool> HasCustomerBookingInChainAsync(int customerId, int chainId)
    {
        using var db = factory.Create();
        const string sql = """
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM Bookings b
                JOIN Locations l ON l.Id = b.LocationId
                WHERE b.CustomerId = @CustomerId AND l.ChainId = @ChainId AND b.IsDelete = 0
            ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END
            """;
        return await db.ExecuteScalarAsync<bool>(sql, new { CustomerId = customerId, ChainId = chainId });
    }

    public async Task<bool> IsLocationInChainAsync(int locationId, int chainId)
    {
        using var db = factory.Create();
        const string sql = "SELECT CASE WHEN EXISTS (SELECT 1 FROM Locations WHERE Id = @LocationId AND ChainId = @ChainId AND IsDelete = 0) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END";
        return await db.ExecuteScalarAsync<bool>(sql, new { LocationId = locationId, ChainId = chainId });
    }

    // Backs AdminSeeder -- skip creating the bootstrap account if a RootSuperAdmin already exists
    // under ANY email, not just the currently configured SeedAdmin:Email, so changing that setting
    // later doesn't spawn a second root account.
    public async Task<bool> ExistsWithRoleAsync(UserRole role)
    {
        using var db = factory.Create();
        const string sql = "SELECT CASE WHEN EXISTS (SELECT 1 FROM Users WHERE Role = @Role AND IsDelete = 0) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END";
        return await db.ExecuteScalarAsync<bool>(sql, new { Role = role.ToString() });
    }

    public async Task UpdateCustomerAsync(int id, string name, string? phone, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Admin_UpdateCustomer", new
        {
            Id = id,
            Name = name,
            Phone = phone,
            IsActive = isActive,
            UpdatedBy = currentUser.RequireUserId()
        });
    }

    public async Task DeleteCustomerAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Admin_DeleteCustomer", new { Id = id, UpdatedBy = currentUser.RequireUserId() });
    }

    // Self-service (own password) and reset-password (via a redeemed token, no logged-in caller)
    // both land here -- deliberately narrow, mirrors sp_Profile_UpdateSelf's "never touch Role/scope"
    // discipline.
    public async Task UpdatePasswordAsync(int userId, byte[] hash, byte[] salt)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Auth_UpdatePassword", new { UserId = userId, PasswordHash = hash, PasswordSalt = salt });
    }

    public async Task<IReadOnlyList<StaffUserDto>> GetStaffAsync(UserRole? role, int? chainId, int? locationId)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<StaffUserRow>("public.sp_Admin_GetUsers", new
        {
            Role = role?.ToString(),
            ChainId = chainId,
            LocationId = locationId
        });
        return rows.Select(r => new StaffUserDto(
            r.Id, r.Name, r.Email, r.Phone, Enum.Parse<UserRole>(r.Role),
            r.ChainId, r.LocationId, r.TherapistId, r.IsEmulator, r.IsActive, r.JoiningDate, r.CreatedDate)).ToList();
    }

    public async Task UpdateStaffAsync(
        int id, string name, string? phone, string? role, int? chainId, int? locationId, int? therapistId,
        bool isEmulator, DateOnly? joiningDate, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Admin_UpdateUser", new
        {
            Id = id,
            Name = name,
            Phone = phone,
            Role = role,
            ChainId = chainId,
            LocationId = locationId,
            TherapistId = therapistId,
            IsEmulator = isEmulator,
            JoiningDate = joiningDate,
            IsActive = isActive,
            UpdatedBy = currentUser.RequireUserId()
        });
    }

    public async Task UpdateStripeCustomerIdAsync(int userId, string stripeCustomerId)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_User_UpdateStripeCustomerId", new { UserId = userId, StripeCustomerId = stripeCustomerId });
    }

    private static UserRecord ToRecord(UserRow row) => new(
        row.Id, row.Name, row.Email, row.PasswordHash, row.PasswordSalt,
        Enum.Parse<UserRole>(row.Role), row.ChainId, row.LocationId, row.TherapistId, row.IsEmulator, row.StripeCustomerId,
        row.PhotoPath, row.IsEmailVerified);

    // Dapper needs Role as a plain string to map from the sproc's VARCHAR column -- UserRecord/
    // StaffUserDto expose it as the enum, converted just above.
    private sealed record UserRow(
        int Id, string Name, string Email, byte[] PasswordHash, byte[] PasswordSalt,
        string Role, int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator, string? StripeCustomerId,
        string? PhotoPath, bool IsEmailVerified);

    private sealed record StaffUserRow(
        int Id, string Name, string Email, string? Phone, string Role,
        int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator, bool IsActive, DateOnly? JoiningDate, DateTime CreatedDate);
}
