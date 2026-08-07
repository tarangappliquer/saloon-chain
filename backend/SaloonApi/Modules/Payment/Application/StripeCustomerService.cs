using System.Globalization;
using Microsoft.Extensions.Options;
using SaloonApi.Modules.Identity.Infrastructure;
using SaloonApi.Modules.Payment.Infrastructure;
using Stripe;

namespace SaloonApi.Modules.Payment.Application;

internal sealed class StripeCustomerService(
    UserRepository userRepo,
    IOptionsMonitor<StripeOptions> stripeOptions)
{
    private StripeOptions _options => stripeOptions.CurrentValue;

#pragma warning disable CA1031 // Best-effort DB persistence fallback
    public async Task<string> GetOrCreateCustomerAsync(
        int userId, string name, string email, string? phone = null, CancellationToken ct = default)
    {
        UserRecord? user = null;
        try
        {
            user = await userRepo.GetByIdAsync(userId);
        }
        catch (Exception)
        {
            // Best-effort lookup
        }

        if (user is not null && !string.IsNullOrEmpty(user.StripeCustomerId))
        {
            return user.StripeCustomerId;
        }

        if (string.IsNullOrEmpty(_options.SecretKey))
        {
            var mockCustomerId = $"cus_mock_{userId}_{Guid.NewGuid():N}";
            try
            {
                await userRepo.UpdateStripeCustomerIdAsync(userId, mockCustomerId);
            }
            catch (Exception)
            {
                // Best-effort persistence
            }
            return mockCustomerId;
        }

        StripeConfiguration.ApiKey = _options.SecretKey;
        var service = new CustomerService();

        var createOptions = new CustomerCreateOptions
        {
            Email = email,
            Name = name,
            Phone = phone,
            Metadata = new Dictionary<string, string>
            {
                { "userId", userId.ToString(CultureInfo.InvariantCulture) }
            }
        };

        var stripeCustomer = await service.CreateAsync(createOptions, cancellationToken: ct);
        try
        {
            await userRepo.UpdateStripeCustomerIdAsync(userId, stripeCustomer.Id);
        }
        catch (Exception)
        {
            // Best-effort persistence
        }
        return stripeCustomer.Id;
    }

    public async Task SyncCustomerAsync(
        int userId, string name, string email, string? phone = null, CancellationToken ct = default)
    {
        UserRecord? user = null;
        try
        {
            user = await userRepo.GetByIdAsync(userId);
        }
        catch (Exception)
        {
            // Best-effort lookup
        }

        if (user is null || string.IsNullOrEmpty(user.StripeCustomerId))
        {
            await GetOrCreateCustomerAsync(userId, name, email, phone, ct);
            return;
        }

        if (string.IsNullOrEmpty(_options.SecretKey) || user.StripeCustomerId.StartsWith("cus_mock_", StringComparison.Ordinal))
        {
            return;
        }

        StripeConfiguration.ApiKey = _options.SecretKey;
        var service = new CustomerService();

        var updateOptions = new CustomerUpdateOptions
        {
            Email = email,
            Name = name,
            Phone = phone,
            Metadata = new Dictionary<string, string>
            {
                { "userId", userId.ToString(CultureInfo.InvariantCulture) }
            }
        };

        await service.UpdateAsync(user.StripeCustomerId, updateOptions, cancellationToken: ct);
    }
#pragma warning restore CA1031
}
