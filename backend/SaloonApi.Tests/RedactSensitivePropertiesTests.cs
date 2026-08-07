using System.Globalization;
using SaloonApi.Shared.Logging;
using Serilog;
using Serilog.Core;
using Serilog.Events;

namespace SaloonApi.Tests;

public class RedactSensitivePropertiesTests
{
    private sealed class CapturingSink : ILogEventSink
    {
        public readonly List<LogEvent> Events = [];
        public void Emit(LogEvent logEvent) => Events.Add(logEvent);
    }

    private static (Logger logger, CapturingSink sink) CreateLogger()
    {
        var sink = new CapturingSink();
        var logger = new LoggerConfiguration()
            .Destructure.With<RedactSensitivePropertiesPolicy>()
            .Enrich.With<RedactSensitivePropertiesEnricher>()
            .WriteTo.Sink(sink)
            .CreateLogger();
        return (logger, sink);
    }

    private sealed record LoginRequest(string Email, string Password);

    [Fact]
    public void ScalarPasswordHoleIsRedacted()
    {
        var (logger, sink) = CreateLogger();

        logger.Information("Login attempt for {Email} with {Password}", "user@test.com", "hunter2");

        var rendered = sink.Events.Single().RenderMessage(CultureInfo.InvariantCulture);
        Assert.DoesNotContain("hunter2", rendered, StringComparison.Ordinal);
        Assert.Contains("***REDACTED***", rendered, StringComparison.Ordinal);
    }

    [Fact]
    public void DestructuredObjectPasswordPropertyIsRedacted()
    {
        var (logger, sink) = CreateLogger();

        logger.Information("Request: {@Request}", new LoginRequest("user@test.com", "hunter2"));

        var rendered = sink.Events.Single().RenderMessage(CultureInfo.InvariantCulture);
        Assert.DoesNotContain("hunter2", rendered, StringComparison.Ordinal);
        Assert.Contains("***REDACTED***", rendered, StringComparison.Ordinal);
        Assert.Contains("user@test.com", rendered, StringComparison.Ordinal);
    }
}
