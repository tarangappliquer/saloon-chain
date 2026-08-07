using System.Reflection;
using Serilog.Core;
using Serilog.Events;

namespace SaloonApi.Shared.Logging;

// Last-line-of-defense against a password ever reaching a log file: if anyone ever logs a request/
// user object wholesale (e.g. `logger.LogInformation("{@Request}", req)`), any property whose name
// looks like a password gets replaced before Serilog serializes it -- regardless of which record/
// class it's on, so a future RegisterRequest/LoginRequest-shaped type is covered automatically.
internal sealed class RedactSensitivePropertiesPolicy : IDestructuringPolicy
{
    private const string Mask = "***REDACTED***";

    private static readonly string[] SensitiveNameFragments = ["password"];

#pragma warning disable CA1031 // a broken property getter must not take down logging with it
    public bool TryDestructure(object value, ILogEventPropertyValueFactory propertyValueFactory, out LogEventPropertyValue result)
    {
        result = null!;
        var type = value.GetType();
        if (type.IsPrimitive || type == typeof(string) || type.IsEnum) return false;

        var props = type.GetProperties(BindingFlags.Public | BindingFlags.Instance);
        if (!props.Any(IsSensitive)) return false;

        var logProps = props.Select(p =>
        {
            object? propValue;
            try { propValue = p.GetValue(value); }
            catch { propValue = null; }

            var rendered = IsSensitive(p) ? Mask : propValue;
            return new LogEventProperty(p.Name, propertyValueFactory.CreatePropertyValue(rendered, destructureObjects: true));
        });

        result = new StructureValue(logProps, type.Name);
        return true;
    }
#pragma warning restore CA1031

    private static bool IsSensitive(PropertyInfo p) =>
        SensitiveNameFragments.Any(f => p.Name.Contains(f, StringComparison.OrdinalIgnoreCase));
}
