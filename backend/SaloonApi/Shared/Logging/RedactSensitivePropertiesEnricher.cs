using Serilog.Core;
using Serilog.Events;

namespace SaloonApi.Shared.Logging;

// Companion to RedactSensitivePropertiesPolicy: that one catches a whole object logged via
// "{@Thing}" (e.g. "{@LoginRequest}"); this catches the simpler case of a bare scalar hole like
// `logger.LogInformation("Login attempt for {Email} with {Password}", email, password)`, where
// the value never passes through destructuring at all.
internal sealed class RedactSensitivePropertiesEnricher : ILogEventEnricher
{
    private const string Mask = "***REDACTED***";

    private static readonly string[] SensitiveNameFragments = ["password"];

    public void Enrich(LogEvent logEvent, ILogEventPropertyFactory propertyFactory)
    {
        var sensitiveNames = logEvent.Properties.Keys
            .Where(name => SensitiveNameFragments.Any(f => name.Contains(f, StringComparison.OrdinalIgnoreCase)));

        foreach (var name in sensitiveNames.ToList())
            logEvent.AddOrUpdateProperty(propertyFactory.CreateProperty(name, Mask));
    }
}
