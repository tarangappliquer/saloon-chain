using Serilog.Context;

namespace SaloonApi.Shared.Observability;

// Reads X-Correlation-Id from the incoming request (e.g. set by an upstream reverse proxy/
// gateway) so a request can be traced end-to-end; generates one if absent or untrustworthy.
// Pushed into Serilog's LogContext (requires .Enrich.FromLogContext() on the logger, see
// Program.cs) so every log line for this request carries it, and echoed back on the response
// for the caller to correlate with.
// IMiddleware (factory-activated, DI-resolved) rather than the convention-based
// ctor+InvokeAsync(HttpContext) pattern -- must be registered in DI (Program.cs) for
// UseMiddleware<T>() to resolve it via IMiddlewareFactory.
internal sealed class CorrelationIdMiddleware : IMiddleware
{
    private const string HeaderName = "X-Correlation-Id";
    private const int MaxLength = 100;

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        var incoming = context.Request.Headers[HeaderName].ToString();
        var correlationId = !string.IsNullOrWhiteSpace(incoming) && incoming.Length <= MaxLength
            ? incoming
            : Guid.NewGuid().ToString();

        context.Response.Headers[HeaderName] = correlationId;

        using (LogContext.PushProperty("CorrelationId", correlationId))
        {
            await next(context);
        }
    }
}
