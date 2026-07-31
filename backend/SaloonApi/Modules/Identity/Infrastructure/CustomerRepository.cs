using System.Data;
using Dapper;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Identity.Infrastructure;

internal sealed record CustomerRecord(int Id, string Name, string Email, byte[] PasswordHash, byte[] PasswordSalt);

internal sealed class CustomerRepository(SqlConnectionFactory factory, ICurrentUser currentUser)
{
    public async Task<int> CreateAsync(string name, string email, byte[] hash, byte[] salt, string? phone)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@Name", name);
        p.Add("@Email", email);
        p.Add("@PasswordHash", hash);
        p.Add("@PasswordSalt", salt);
        p.Add("@Phone", phone);
        // Null for self-registration (the common case -- no logged-in user yet at that point).
        p.Add("@CreatedBy", currentUser.CustomerId);
        p.Add("@CustomerId", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await db.ExecuteSpAsync("dbo.sp_Auth_CreateCustomer", p);
        return p.Get<int>("@CustomerId");
    }

    public async Task<CustomerRecord?> GetByEmailAsync(string email)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<CustomerRecord>("dbo.sp_Auth_GetCustomerByEmail", new { Email = email });
    }
}
