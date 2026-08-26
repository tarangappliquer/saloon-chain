using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Profile.Infrastructure;

internal sealed record ProfileDto(int Id, string Name, string Email, string? Phone, UserRole Role, string? PhotoPath, bool IsEmailVerified);

internal sealed record ProfileRow(int Id, string Name, string Email, string? Phone, string Role, string? PhotoPath, bool IsEmailVerified);

internal sealed class ProfileRepository(SqlConnectionFactory factory, ProfileDbService profileDb)
{
    public async Task<ProfileDto?> GetMyProfileAsync(int userId, UserRole role)
    {
        using var db = factory.Create();
        var row = role == UserRole.Customer
            ? await profileDb.sp_Profile_GetCustomerAsync(db, userId)
            : await profileDb.sp_Profile_GetStaffAsync(db, userId);

        return row is null
            ? null
            : new ProfileDto(row.Id, row.Name, row.Email, row.Phone, Enum.Parse<UserRole>(row.Role), row.PhotoPath, row.IsEmailVerified);
    }

    public async Task UpdateSelfAsync(int userId, string name, string? phone)
    {
        using var db = factory.Create();
        await profileDb.sp_Profile_UpdateSelfAsync(db, userId, name, phone);
    }

    public async Task SetCustomerPhotoPathAsync(int userId, string photoPath)
    {
        using var db = factory.Create();
        await profileDb.sp_Profile_SetCustomerPhotoAsync(db, userId, photoPath);
    }

    public async Task SetStaffPhotoPathAsync(int userId, string photoPath)
    {
        using var db = factory.Create();
        await profileDb.sp_Profile_SetStaffPhotoAsync(db, userId, photoPath);
    }
}
