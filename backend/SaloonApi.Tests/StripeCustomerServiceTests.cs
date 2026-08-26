using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Modules.Payment.Application;
using SaloonApi.Modules.Payment.Infrastructure;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;
using Xunit;

namespace SaloonApi.Tests;

public class StripeCustomerServiceTests
{
    [Fact]
    public async Task GetOrCreateCustomerAsyncCreatesMockCustomerIdInDevMode()
    {
        var options = TestOptionsMonitor.Create(new StripeOptions { SecretKey = "" });
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { { "ConnectionStrings:SaloonDb", "Host=localhost;Database=TestDb;Username=postgres;Password=postgres;" } })
            .Build();
        var sqlFactory = new SqlConnectionFactory(config);
        var currentUser = new TestCurrentUser();
        var userRepo = new UserRepository(sqlFactory, currentUser, new StaffDbService(), new AuthDbService(), new AdminDbService());
        var service = new StripeCustomerService(userRepo, options);

        // When user is null from DB, it should handle fallback / creation
        var customerId = await service.GetOrCreateCustomerAsync(101, "Test User", "test@example.com", ct: TestContext.Current.CancellationToken);

        Assert.NotNull(customerId);
        Assert.StartsWith("cus_mock_101_", customerId, StringComparison.Ordinal);
    }

    private sealed class TestCurrentUser : ICurrentUser
    {
        public int? UserId => 1;
        public string? Email => "admin@test.com";
        public UserRole? Role => UserRole.SuperAdmin;
        public int? ChainId => null;
        public int? LocationId => null;
        public int? TherapistId => null;
        public int? EmulatedByUserId => null;
        public bool IsAuthenticated => true;
        public int RequireUserId() => 1;
        public bool IsInRole(params UserRole[] roles) => true;
    }
}
