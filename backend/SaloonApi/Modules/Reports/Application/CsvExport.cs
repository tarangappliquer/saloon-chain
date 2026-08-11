using System.Globalization;
using System.Text;

namespace SaloonApi.Modules.Reports.Application;

// Minimal reflection-based CSV writer, used only by ReportsEndpoints' ?format=csv branch -- every
// report DTO is a flat record of primitives, so this covers all five without a dedicated writer per
// report shape.
internal static class CsvExport
{
    public static byte[] ToCsvBytes<T>(IEnumerable<T> rows)
    {
        var props = typeof(T).GetProperties();
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(',', props.Select(p => p.Name)));
        foreach (var row in rows)
        {
            sb.AppendLine(string.Join(',', props.Select(p => Escape(Convert.ToString(p.GetValue(row), CultureInfo.InvariantCulture) ?? string.Empty))));
        }
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    private static string Escape(string value) =>
        value.Contains(',', StringComparison.Ordinal) || value.Contains('"', StringComparison.Ordinal) || value.Contains('\n', StringComparison.Ordinal)
            ? "\"" + value.Replace("\"", "\"\"", StringComparison.Ordinal) + "\""
            : value;
}
