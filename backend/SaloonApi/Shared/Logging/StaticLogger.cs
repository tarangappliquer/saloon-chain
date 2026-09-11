using Serilog;
using Serilog.Formatting.Json;
using System.Globalization;

namespace SaloonApi.Shared.Logging;

internal static class StaticLogger
{
    private static JsonFormatter SerilogFormatter => new(renderMessage: true, formatProvider: CultureInfo.InvariantCulture);

    private static bool _cleanedLogs;

    // Env-driven toggles, both default false when the var is unset/unparseable.
    private static bool EnvFlag(string name, bool defaultValue)
    {
        var envVar = Environment.GetEnvironmentVariable(name)?.Trim();

        if (string.IsNullOrWhiteSpace(envVar))
        {
            return defaultValue;
        }

        // Handle standard boolean representations (true/false) and numeric ones (1/0)
        if (bool.TryParse(envVar, out var parsedBool))
        {
            return parsedBool;
        }

        return envVar switch
        {
            "1" => true,
            "0" => false,
            _ => defaultValue
        };
    }

    public static bool CleanLogsOnStartupFromEnv => EnvFlag("CLEAN_LOGS_ON_STARTUP", false);
    private static bool ConsoleLogsFromEnv => EnvFlag("CONSOLE_LOGS", true);

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

    private static void CleanupLogs(string? logsDirectory = null)
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

    public static LoggerConfiguration GetLoggerConfiguration(this LoggerConfiguration loggerConfiguration, bool isMainLog)
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
            .WriteTo.Conditional(_ => ConsoleLogsFromEnv, wt => wt.Console(SerilogFormatter))
            .WriteTo.File(SerilogFormatter, "Logs/log-.jsonl", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 31, shared: true)
            .WriteTo.Conditional(m => m.Level >= Serilog.Events.LogEventLevel.Error, (wt) => wt.File(SerilogFormatter, "Logs/error-.jsonl", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 31, shared: true));
    }

}
