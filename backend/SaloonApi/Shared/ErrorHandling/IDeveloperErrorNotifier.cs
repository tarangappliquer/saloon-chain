namespace SaloonApi.Shared.ErrorHandling;

internal interface IDeveloperErrorNotifier
{
    Task NotifyAsync(Exception exception, string contextName, HttpContext? httpContext = null, CancellationToken ct = default);
}
