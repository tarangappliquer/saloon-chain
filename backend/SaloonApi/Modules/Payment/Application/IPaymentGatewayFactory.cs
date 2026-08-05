namespace SaloonApi.Modules.Payment.Application;

internal interface IPaymentGatewayFactory
{
    IPaymentGateway GetGateway(PaymentProvider provider);
}

internal sealed class PaymentGatewayFactory(IEnumerable<IPaymentGateway> gateways) : IPaymentGatewayFactory
{
    private readonly Dictionary<PaymentProvider, IPaymentGateway> _gateways = gateways.ToDictionary(g => g.Provider);

    public IPaymentGateway GetGateway(PaymentProvider provider)
    {
        if (_gateways.TryGetValue(provider, out var gateway))
        {
            return gateway;
        }
        throw new NotSupportedException($"Payment provider '{provider}' is not supported.");
    }
}
