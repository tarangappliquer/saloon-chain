using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Profile.Infrastructure;

internal sealed record ProfileDto(int Id, string Name, string Email, string? Phone, UserRole Role, string? PhotoPath);

// Dapper needs Role as a plain string to map from the sproc's VARCHAR column -- ProfileDto exposes
// it as the enum, converted in the two Get* methods below (same convention as UserRepository.UserRow).
internal sealed record ProfileRow(int Id, string Name, string Email, string? Phone, string Role, string? PhotoPath);

internal sealed class ProfileRepository(SqlConnectionFactory factory)
{
    public async Task<ProfileDto?> GetMyProfileAsync(int userId, UserRole role)
    {
        using var db = factory.Create();
        var proc = role == UserRole.Customer ? "dbo.sp_Profile_GetCustomer" : "dbo.sp_Profile_GetStaff";
        var row = await db.QuerySingleSpAsync<ProfileRow>(proc, new { UserId = userId });
        return row is null
            ? null
            : new ProfileDto(row.Id, row.Name, row.Email, row.Phone, Enum.Parse<UserRole>(row.Role), row.PhotoPath);
    }

    public async Task UpdateSelfAsync(int userId, string name, string? phone)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Profile_UpdateSelf", new { UserId = userId, Name = name, Phone = phone });
    }

    public async Task SetPhotoPathAsync(int userId, UserRole role, string photoPath)
    {
        using var db = factory.Create();
        var proc = role == UserRole.Customer ? "dbo.sp_Profile_SetCustomerPhoto" : "dbo.sp_Profile_SetStaffPhoto";
        await db.ExecuteSpAsync(proc, new { UserId = userId, PhotoPath = photoPath });
    }
}
