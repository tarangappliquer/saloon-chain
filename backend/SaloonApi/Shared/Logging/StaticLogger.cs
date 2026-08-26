using Serilog;
using Serilog.Formatting.Json;
using System.Globalization;

namespace SaloonApi.Shared.Logging;

internal static class StaticLogger
{
    private static JsonFormatter SerilogFormatter => new(renderMessage: true, formatProvider: CultureInfo.InvariantCulture);

    private static bool _cleanedLogs;

    public static void Initialize(bool cleanLogs = false)
    {
        if (cleanLogs && !_cleanedLogs)
        {
            _cleanedLogs = true;
            CleanupLogs();
        }

        if (Log.Logger is not Serilog.Core.Logger)
        {
            Log.Logger = new LoggerConfiguration()
                .GetLoggerConfiguration(false)
                .CreateBootstrapLogger();
        }
    }

    public static void CleanupLogs(string? logsDirectory = null)
    {
        try
        {
            var dir = logsDirectory ?? Path.Combine(Directory.GetCurrentDirectory(), "Logs");
            if (!Directory.Exists(dir)) return;

            var files = Directory.GetFiles(dir, "*.*")
                .Where(f => f.EndsWith(".json", StringComparison.OrdinalIgnoreCase) ||
                            f.EndsWith(".jsonl", StringComparison.OrdinalIgnoreCase));

            foreach (var file in files)
            {
                try
                {
                    File.Delete(file);
                }
                catch (IOException)
                {
                    // Ignore locked files
                }
                catch (UnauthorizedAccessException)
                {
                    // Ignore permission failures
                }
            }
        }
        catch (IOException)
        {
            // Ignore I/O exceptions during startup log cleanup
        }
        catch (UnauthorizedAccessException)
        {
            // Ignore permission exceptions during startup log cleanup
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
