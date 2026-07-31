using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Auth;

namespace SaloonApi.Shared.Bootstrap;

// Runs once on startup so there's always at least one working admin login -- T-SQL can't produce
// a PBKDF2 hash matching PasswordHasher, so this can't just live in the db/06_seed.sql script.
// Override the dev defaults via SeedAdmin:Email/Password/Name in configuration for anything
// beyond local development.
internal static class AdminSeeder
{
    public static async Task SeedSuperAdminAsync(IServiceProvider services, IConfiguration config)
    {
        var email = config["SeedAdmin:Email"] ?? "superadmin@saloonchains.local";
        var password = config["SeedAdmin:Password"] ?? "ChangeMe123!";
        var name = config["SeedAdmin:Name"] ?? "Super Admin";

        using var scope = services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<UserRepository>();
        if (await repo.GetByEmailAsync(email) is not null)
            return;

        var (hash, salt) = PasswordHasher.Hash(password);
        await repo.CreateAsync(name, email, hash, salt, phone: null, UserRole.SuperAdmin);
    }
}
