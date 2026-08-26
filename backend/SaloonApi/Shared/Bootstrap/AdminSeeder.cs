using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Auth;
using System.Diagnostics.CodeAnalysis;

namespace SaloonApi.Shared.Bootstrap;

// Runs once on startup so there's always at least one working login -- T-SQL can't produce
// a PBKDF2 hash matching PasswordHasher, so this can't just live in the db/06_seed.sql script.
// Seeds RootSuperAdmin (not SuperAdmin) -- SuperAdmin now carries a ChainId (see 01_tables.sql),
// and no chain exists yet at first boot; RootSuperAdmin is the only unscoped role and the only one
// that can create a chain, so it has to be the bootstrap account. Override the dev defaults via
// SeedAdmin:Email/Password/Name in configuration for anything beyond local development.
internal class AdminSeeder(IServiceProvider services, IConfiguration config, ILogger<AdminSeeder> logger)
{
    [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "Bootstrap seeding failure should be logged without throwing and crashing application startup.")]
    [SuppressMessage("CodeQuality", "S2139:Exceptions should be logged or rethrown, not both", Justification = "Bootstrap seeding failure should be logged without throwing and crashing application startup.")]
    public async Task SeedRootSuperAdminAsync()
    {
        try
        {
            var email = config["SeedAdmin:Email"] ?? "rootsuperadmin@saloonchains.local";
            var password = config["SeedAdmin:Password"] ?? "ChangeMe123!";
            var name = config["SeedAdmin:Name"] ?? "Root Super Admin";

            using var scope = services.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<UserRepository>();
            // Any RootSuperAdmin, not just one at this exact email -- otherwise changing
            // SeedAdmin:Email after the first boot would spawn a second root account.
            if (await repo.ExistsWithRoleAsync(UserRole.RootSuperAdmin))
                return;

            var (hash, salt) = PasswordHasher.Hash(password);
            // isEmailVerified: true -- this is a server-configured bootstrap account, not a
            // self-registration; without this the very first login would be locked out by the
            // email-verification gate with no other account able to unblock it.
            await repo.CreateAsync(name, email, hash, salt, phone: null, UserRole.RootSuperAdmin, isEmailVerified: true);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to seed RootSuperAdmin account. Check SeedAdmin:Email/Password/Name in configuration.");
            throw;
        }
    }
}
