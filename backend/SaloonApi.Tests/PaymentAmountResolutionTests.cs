using SaloonApi.Modules.Payment.Application;
using Xunit;

namespace SaloonApi.Tests;

public class PaymentAmountResolutionTests
{
    [Fact]
    public void DefaultsToFullRemainingBalanceWhenNoAmountRequested()
    {
        var charge = PaymentService.ResolveChargeAmount(bookingTotal: 100m, alreadyPaid: 0m, requestedAmount: null);
        Assert.Equal(100m, charge);
    }

    [Fact]
    public void AllowsPartialDepositWithinRemainingBalance()
    {
        var charge = PaymentService.ResolveChargeAmount(bookingTotal: 100m, alreadyPaid: 0m, requestedAmount: 30m);
        Assert.Equal(30m, charge);
    }

    [Fact]
    public void SecondSplitPaymentSeesShrunkenRemainingBalance()
    {
        var charge = PaymentService.ResolveChargeAmount(bookingTotal: 100m, alreadyPaid: 30m, requestedAmount: 70m);
        Assert.Equal(70m, charge);
    }

    [Fact]
    public void RejectsAmountAboveRemainingBalance()
    {
        Assert.Throws<InvalidOperationException>(() =>
            PaymentService.ResolveChargeAmount(bookingTotal: 100m, alreadyPaid: 30m, requestedAmount: 80m));
    }

    [Fact]
    public void RejectsZeroOrNegativeAmount()
    {
        Assert.Throws<InvalidOperationException>(() =>
            PaymentService.ResolveChargeAmount(bookingTotal: 100m, alreadyPaid: 0m, requestedAmount: 0m));
    }

    [Fact]
    public void RejectsFurtherChargesOnceFullyPaid()
    {
        Assert.Throws<InvalidOperationException>(() =>
            PaymentService.ResolveChargeAmount(bookingTotal: 100m, alreadyPaid: 100m, requestedAmount: null));
    }
}
