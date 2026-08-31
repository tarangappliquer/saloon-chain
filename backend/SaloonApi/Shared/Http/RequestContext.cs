namespace SaloonApi.Shared.Http;

// Request-scoped ambient context populated once by RequestContextMiddleware from request headers
// (currently just the caller's IANA time zone via "X-Timezone"). Inject IRequestContext anywhere a
// service needs to turn a caller-local wall-clock time into a UTC instant, or to know "now" / "today"
// from the caller's perspective rather than the server's.
internal interface IRequestContext
{
    // The caller's time zone from the X-Timezone header. Falls back to UTC when the header is
    // missing or unrecognised, so this is never null and callers never need a null check.
    TimeZoneInfo ClientTimeZone { get; }

    // True when X-Timezone was present and resolved to a real zone (vs. the UTC fallback).
    bool HasClientTimeZone { get; }

    DateTimeOffset UtcNow { get; }

    // "Now" / "today" as the caller's wall clock sees them.
    DateTime ClientNow { get; }
    DateOnly ClientToday { get; }

    // Interpret a naive (Kind=Unspecified) wall-clock time as being in the caller's zone and
    // return the corresponding UTC instant. Already-UTC input is returned unchanged; Local is
    // converted. Use this for every DateTime headed for a timestamptz column.
    DateTime ToUtc(DateTime clientLocal);
}

internal sealed class RequestContext : IRequestContext
{
    public TimeZoneInfo ClientTimeZone { get; set; } = TimeZoneInfo.Utc;
    public bool HasClientTimeZone { get; set; }

    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
    public DateTime ClientNow => TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, ClientTimeZone).DateTime;
    public DateOnly ClientToday => DateOnly.FromDateTime(ClientNow);

    public DateTime ToUtc(DateTime clientLocal) => clientLocal.Kind switch
    {
        DateTimeKind.Utc => clientLocal,
        DateTimeKind.Local => clientLocal.ToUniversalTime(),
        _ => TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(clientLocal, DateTimeKind.Unspecified), ClientTimeZone),
    };
}
