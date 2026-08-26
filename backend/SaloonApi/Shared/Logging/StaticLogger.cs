using Serilog;
using Serilog.Formatting.Json;
using System.Globalization;

namespace SaloonApi.Shared.Logging;

internal static class StaticLogger
{
    private static JsonFormatter SerilogFormatter => new(renderMessage: true, formatProvider: CultureInfo.InvariantCulture);

    public static void Initialize()
    {
        if (Log.Logger is not Serilog.Core.Logger)
        {
            Log.Logger = new LoggerConfiguration()
                .GetLoggerConfiguration(false)
                .CreateBootstrapLogger();
        }
    }

    public static Serilog.LoggerConfiguration GetLoggerConfiguration(this LoggerConfiguration loggerConfiguration, bool isMainLog)
    {
        return loggerConfiguration
            .Destructure.With<RedactSensitivePropertiesPolicy>()
            .Enrich.With<RedactSensitivePropertiesEnricher>()
            .Enrich.FromLogContext()
            .Enrich.WithMachineName()
            .Enrich.WithEnvironmentName()
            .Enrich.WithThreadId()
            .Enrich.WithThreadName()
            .Enrich.WithProperty("LogType", isMainLog ? "MainLog" : "StartupLog")
            .Enrich.WithProperty("ApplicationName", AppDomain.CurrentDomain.FriendlyName)
            .MinimumLevel.Information()
            .MinimumLevel.Override("Microsoft", Serilog.Events.LogEventLevel.Warning)
            .MinimumLevel.Override("System", Serilog.Events.LogEventLevel.Warning)
            .WriteTo.Console(SerilogFormatter)
            .WriteTo.File(SerilogFormatter, "Logs/log-.jsonl", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 31, shared: true)
            .WriteTo.Conditional(m => m.Level >= Serilog.Events.LogEventLevel.Error, (wt) => wt.File(SerilogFormatter, "Logs/error-.jsonl", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 31, shared: true));
    }

}
