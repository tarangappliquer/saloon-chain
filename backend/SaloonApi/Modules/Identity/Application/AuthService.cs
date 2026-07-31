using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Auth;

namespace SaloonApi.Modules.Identity.Application;

internal sealed class AuthService(UserRepository repo, TokenService tokens)
{
    public async Task<(int Id, string Token)> RegisterAsync(string name, string email, string password, string? phone)
    {
        var (hash, salt) = PasswordHasher.Hash(password);
        // Self-registration is always Role=Customer -- staff accounts are created only via the
        // admin-only CreateStaffAsync path below, never through this public endpoint.
        var id = await repo.CreateAsync(name, email, hash, salt, phone);
        return (id, tokens.CreateToken(id, email, UserRole.Customer));
    }

    public async Task<(int Id, string Name, UserRole Role, bool CanEmulate, string Token)?> LoginAsync(string email, string password)
    {
        var user = await repo.GetByEmailAsync(email);
        if (user is null || !PasswordHasher.Verify(password, user.PasswordHash, user.PasswordSalt))
            return null;

        var token = tokens.CreateToken(user.Id, user.Email, user.Role, user.ChainId, user.LocationId, user.TherapistId);
        return (user.Id, user.Name, user.Role, user.IsEmulator, token);
    }

    // Staff accounts (SuperAdmin/Admin/Manager/Therapist) are provisioned here, never self-service --
    // callers must already be behind an admin-only authorization policy.
    public async Task<int> CreateStaffAsync(
        string name, string email, string password, UserRole role, int? chainId, int? locationId, int? therapistId)
    {
        var (hash, salt) = PasswordHasher.Hash(password);
        return await repo.CreateAsync(name, email, hash, salt, phone: null, role, chainId, locationId, therapistId);
    }

    // Only SuperAdmin/Admin/Manager rows with IsEmulator=1 may open a customer session on that
    // customer's behalf (docs/initial-project-spec.md). The caller is already behind the
    // AdminAccess policy (Therapist/Customer can't reach this endpoint at all), but that policy
    // alone doesn't know about IsEmulator, so both checks happen here against a fresh DB read --
    // never trust the flag off the caller's JWT, since it can be revoked after the token was issued.
    private static readonly UserRole[] EmulatorEligibleRoles = [UserRole.SuperAdmin, UserRole.Admin, UserRole.Manager];

    public async Task<(int Id, string Name, string Email, string Token)?> EmulateCustomerAsync(int emulatorUserId, int customerUserId)
    {
        var emulator = await repo.GetByIdAsync(emulatorUserId);
        if (emulator is null || !emulator.IsEmulator || !EmulatorEligibleRoles.Contains(emulator.Role))
            return null;

        var customer = await repo.GetByIdAsync(customerUserId);
        if (customer is null || customer.Role != UserRole.Customer)
            return null;

        var token = tokens.CreateToken(customer.Id, customer.Email, UserRole.Customer, emulatedByUserId: emulator.Id);
        return (customer.Id, customer.Name, customer.Email, token);
    }
}
