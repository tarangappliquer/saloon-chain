using System.Data;
using System.Globalization;
using Dapper;

namespace SaloonApi.Shared.Data.TypeHandlers;

// Looser than Dapper's own bool handling: some columns come back as TINYINT/INT (0/1) rather than
// BIT -- e.g. a plain 0/1 literal instead of CAST(... AS BIT) -- which Dapper's default unboxing
// can't convert to bool for constructor-based (record) materialization.
internal sealed class BoolTypeHandler : SqlMapper.TypeHandler<bool>
{
    public override void SetValue(IDbDataParameter parameter, bool value)
    {
        parameter.DbType = DbType.Boolean;
        parameter.Value = value;
    }

    public override bool Parse(object value) => value switch
    {
        bool b => b,
        byte b => b != 0,
        short s => s != 0,
        int i => i != 0,
        long l => l != 0,
        decimal d => d != 0,
        _ => Convert.ToBoolean(value, CultureInfo.InvariantCulture)
    };
}
