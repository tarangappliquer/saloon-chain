using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Shared.Auth;

namespace SaloonApi.Modules.Identity.Application;

internal sealed class AuthService(CustomerRepository repo, TokenService tokens)
{
    public async Task<(int Id, string Token)> RegisterAsync(string name, string email, string password, string? phone)
    {
        var (hash, salt) = PasswordHasher.Hash(password);
        var id = await repo.CreateAsync(name, email, hash, salt, phone);
        return (id, tokens.CreateToken(id, email));
    }

    public async Task<(int Id, string Name, string Token)?> LoginAsync(string email, string password)
    {
        var customer = await repo.GetByEmailAsync(email);
        if (customer is null || !PasswordHasher.Verify(password, customer.PasswordHash, customer.PasswordSalt))
            return null;

        return (customer.Id, customer.Name, tokens.CreateToken(customer.Id, customer.Email));
    }
}
