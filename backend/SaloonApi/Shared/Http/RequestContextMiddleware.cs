using System.Diagnostics.CodeAnalysis;

namespace SaloonApi.Shared.Http;

// Reads the caller's IANA time zone from the "X-Timezone" request header (e.g. "Asia/Kolkata",
// sent by the SPA from Intl.DateTimeFormat().resolvedOptions().timeZone) into the request-scoped
// RequestContext. No auth dependency -- ordering relative to the auth middleware doesn't matter.
internal sealed class RequestContextMiddleware(RequestContext request) : IMiddleware
{
    private const string HeaderName = "X-Timezone";

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        if (context.Request.Headers.TryGetValue(HeaderName, out var raw) &&
            TryResolve(raw.ToString(), out var tz))
        {
            request.ClientTimeZone = tz;
            request.HasClientTimeZone = true;
        }
        // else: RequestContext already defaults to TimeZoneInfo.Utc.

        await next(context);
    }

    [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "A malformed client header must not fault the request; fall back to UTC.")]
    private static bool TryResolve(string value, [NotNullWhen(true)] out TimeZoneInfo? tz)
    {
        tz = null;
        if (string.IsNullOrWhiteSpace(value)) return false;
        try
        {
            // Accepts IANA ids on any OS (.NET 6+ has the ICU/tzdata mapping) and Windows ids.
            tz = TimeZoneInfo.FindSystemTimeZoneById(value.Trim());
            return true;
        }
        catch (TimeZoneNotFoundException) { return false; }
        catch (InvalidTimeZoneException) { return false; }
        catch (Exception) { return false; }
    }
}
