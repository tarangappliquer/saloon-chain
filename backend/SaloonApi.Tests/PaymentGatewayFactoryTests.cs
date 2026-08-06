using SaloonApi.Modules.Payment.Application;
using Xunit;

namespace SaloonApi.Tests;

public class PaymentGatewayFactoryTests
{
    [Fact]
    public void ResolvesCorrectGatewayForStripeProvider()
    {
        var stripeGateway = new StripePaymentGateway(
            Microsoft.Extensions.Options.Options.Create(new SaloonApi.Modules.Payment.Infrastructure.StripeOptions()),
            Microsoft.Extensions.Options.Options.Create(new SaloonApi.Shared.Auth.PortalUrlOptions()),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<StripePaymentGateway>.Instance);
        var cashGateway = new CashPaymentGateway();
        var inHouseGateway = new InHousePaymentGateway();

        var factory = new PaymentGatewayFactory([stripeGateway, cashGateway, inHouseGateway]);

        var gateway = factory.GetGateway(PaymentProvider.Stripe);
        Assert.Equal(PaymentProvider.Stripe, gateway.Provider);
    }

    [Fact]
    public void ResolvesCorrectGatewayForCashProvider()
    {
        var cashGateway = new CashPaymentGateway();
        var factory = new PaymentGatewayFactory([cashGateway]);

        var gateway = factory.GetGateway(PaymentProvider.Cash);
        Assert.Equal(PaymentProvider.Cash, gateway.Provider);
    }

    [Fact]
    public void ThrowsForUnregisteredProvider()
    {
        var cashGateway = new CashPaymentGateway();
        var factory = new PaymentGatewayFactory([cashGateway]);

        Assert.Throws<NotSupportedException>(() => factory.GetGateway(PaymentProvider.Stripe));
    }
}
