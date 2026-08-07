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
                .GetLoggerConfiguration("StartupLog")
                .CreateBootstrapLogger();
        }
    }

    public static Serilog.LoggerConfiguration GetLoggerConfiguration(this LoggerConfiguration loggerConfiguration, string logType)
    {
        return loggerConfiguration
            .Destructure.With<RedactSensitivePropertiesPolicy>()
            .Enrich.With<RedactSensitivePropertiesEnricher>()
            .Enrich.FromLogContext()
            .Enrich.WithMachineName()
            .Enrich.WithEnvironmentName()
            .Enrich.WithThreadId()
            .Enrich.WithProperty("LogType", logType)
            .MinimumLevel.Information()
            .MinimumLevel.Override("Microsoft", Serilog.Events.LogEventLevel.Warning)
            .MinimumLevel.Override("System", Serilog.Events.LogEventLevel.Warning)
#if DEBUG
            .WriteTo.Console(SerilogFormatter)
#endif
            .WriteTo.File(SerilogFormatter, "Logs/log-.jsonl", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 31);
    }

}
