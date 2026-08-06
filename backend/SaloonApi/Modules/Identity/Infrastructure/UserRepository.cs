using System.Data;
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
    int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator, bool IsActive, DateTime CreatedDate);

internal sealed record CustomerSummaryDto(int Id, string Name, string Email, string? Phone, bool CanEmulate = true);

internal sealed record AdminCustomerDto(int Id, string Name, string Email, string? Phone, bool IsActive, DateTime CreatedDate, bool CanEmulate = true);

internal sealed class UserRepository(SqlConnectionFactory factory, ICurrentUser currentUser)
{
    public async Task<int> CreateAsync(
        string name, string email, byte[] hash, byte[] salt, string? phone,
        UserRole role = UserRole.Customer, int? chainId = null, int? locationId = null, int? therapistId = null,
        bool isEmulator = false, bool isEmailVerified = false)
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
        // Null for self-registration (no logged-in user yet); set for admin-created staff logins.
        p.Add("@CreatedBy", currentUser.UserId);
        // True only for AdminSeeder's bootstrap account -- everyone else goes through the normal
        // change-email-verify flow to prove they own their address.
        p.Add("@IsEmailVerified", isEmailVerified);
        p.Add("@UserId", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await db.ExecuteSpAsync("dbo.sp_Auth_CreateUser", p);
        return p.Get<int>("@UserId");
    }

    public async Task<UserRecord?> GetByEmailAsync(string email)
    {
        using var db = factory.Create();
        var row = await db.QuerySingleSpAsync<UserRow>("dbo.sp_Auth_GetUserByEmail", new { Email = email });
        return row is null ? null : ToRecord(row);
    }

    // Used by the emulation exchange to re-check the acting staff member's IsEmulator flag (and
    // load the target customer) straight from the database rather than trusting a JWT claim --
    // that flag can be toggled after the staff member's token was issued.
    public async Task<UserRecord?> GetByIdAsync(int id)
    {
        using var db = factory.Create();
        var row = await db.QuerySingleSpAsync<UserRow>("dbo.sp_Auth_GetUserById", new { Id = id });
        return row is null ? null : ToRecord(row);
    }

    public async Task<IReadOnlyList<CustomerSummaryDto>> SearchCustomersAsync(string search, int? chainId = null)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<CustomerSummaryDto>("dbo.sp_Admin_SearchCustomers", new { Search = search, ChainId = chainId });
        return rows.ToList();
    }

    public async Task<IReadOnlyList<AdminCustomerDto>> GetCustomersForAdminAsync(string? search, int? chainId = null)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<AdminCustomerDto>("dbo.sp_Admin_GetCustomers", new { Search = search, ChainId = chainId });
        return rows.ToList();
    }

    public async Task<bool> HasCustomerBookingInChainAsync(int customerId, int chainId)
    {
        using var db = factory.Create();
        const string sql = """
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM dbo.Bookings b
                JOIN dbo.Locations l ON l.Id = b.LocationId
                WHERE b.CustomerId = @CustomerId AND l.ChainId = @ChainId AND b.IsDelete = 0
            ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END
            """;
        return await db.ExecuteScalarAsync<bool>(sql, new { CustomerId = customerId, ChainId = chainId });
    }

    public async Task<bool> IsLocationInChainAsync(int locationId, int chainId)
    {
        using var db = factory.Create();
        const string sql = "SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Locations WHERE Id = @LocationId AND ChainId = @ChainId AND IsDelete = 0) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END";
        return await db.ExecuteScalarAsync<bool>(sql, new { LocationId = locationId, ChainId = chainId });
    }

    public async Task UpdateCustomerAsync(int id, string name, string? phone, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Admin_UpdateCustomer", new
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
        await db.ExecuteSpAsync("dbo.sp_Admin_DeleteCustomer", new { Id = id, UpdatedBy = currentUser.RequireUserId() });
    }

    // Self-service (own password) and reset-password (via a redeemed token, no logged-in caller)
    // both land here -- deliberately narrow, mirrors sp_Profile_UpdateSelf's "never touch Role/scope"
    // discipline.
    public async Task UpdatePasswordAsync(int userId, byte[] hash, byte[] salt)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Auth_UpdatePassword", new { UserId = userId, PasswordHash = hash, PasswordSalt = salt });
    }

    public async Task<IReadOnlyList<StaffUserDto>> GetStaffAsync(UserRole? role, int? chainId, int? locationId)
    {
        using var db = factory.Create();
        var rows = await db.QuerySpAsync<StaffUserRow>("dbo.sp_Admin_GetUsers", new
        {
            Role = role?.ToString(),
            ChainId = chainId,
            LocationId = locationId
        });
        return rows.Select(r => new StaffUserDto(
            r.Id, r.Name, r.Email, r.Phone, Enum.Parse<UserRole>(r.Role),
            r.ChainId, r.LocationId, r.TherapistId, r.IsEmulator, r.IsActive, r.CreatedDate)).ToList();
    }

    public async Task UpdateStaffAsync(
        int id, string name, string? phone, string? role, int? chainId, int? locationId, int? therapistId,
        bool isEmulator, bool isActive)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Admin_UpdateUser", new
        {
            Id = id,
            Name = name,
            Phone = phone,
            Role = role,
            ChainId = chainId,
            LocationId = locationId,
            TherapistId = therapistId,
            IsEmulator = isEmulator,
            IsActive = isActive,
            UpdatedBy = currentUser.RequireUserId()
        });
    }

    public async Task UpdateStripeCustomerIdAsync(int userId, string stripeCustomerId)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_User_UpdateStripeCustomerId", new { UserId = userId, StripeCustomerId = stripeCustomerId });
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
        int? ChainId, int? LocationId, int? TherapistId, bool IsEmulator, bool IsActive, DateTime CreatedDate);
}
