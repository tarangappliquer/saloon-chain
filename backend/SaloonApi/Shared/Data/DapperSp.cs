using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;
using SaloonApi.Shared.Data.TypeHandlers;

namespace SaloonApi.Shared.Data;

// Every DB call in this project goes through these — CommandType.StoredProcedure only, no inline SQL.
internal static class DapperSp
{
    // Dapper has no built-in mapping for DateOnly/TimeOnly parameters (SqlMapper.LookupDbType throws
    // NotSupportedException) -- registering these once, here, covers every call site in the app
    // instead of converting to DateTime/TimeSpan by hand at each one (see TypeHandlers/ for why
    // BoolTypeHandler exists too).
    static DapperSp()
    {
        // Registered against both T and T? -- Dapper resolves a member's handler by its exact
        // declared type, so a nullable column/parameter (DateOnly?, TimeOnly?, bool?) needs its own
        // registration, not just the non-nullable one, even though it's the same handler instance.
        var dateOnly = new DateOnlyTypeHandler();
        SqlMapper.AddTypeHandler(dateOnly);
        SqlMapper.AddTypeHandler(typeof(DateOnly?), dateOnly);

        var timeOnly = new TimeOnlyTypeHandler();
        SqlMapper.AddTypeHandler(timeOnly);
        SqlMapper.AddTypeHandler(typeof(TimeOnly?), timeOnly);

        var boolHandler = new BoolTypeHandler();
        SqlMapper.AddTypeHandler(boolHandler);
        SqlMapper.AddTypeHandler(typeof(bool?), boolHandler);
    }

    public static Task<IEnumerable<T>> QuerySpAsync<T>(this IDbConnection db, string sp, object? param = null) =>
        db.QueryAsync<T>(sp, param, commandType: CommandType.StoredProcedure);

    public static Task<T?> QuerySingleSpAsync<T>(this IDbConnection db, string sp, object? param = null) =>
        db.QuerySingleOrDefaultAsync<T>(sp, param, commandType: CommandType.StoredProcedure);

    public static Task<SqlMapper.GridReader> QueryMultipleSpAsync(this IDbConnection db, string sp, object? param = null) =>
        db.QueryMultipleAsync(sp, param, commandType: CommandType.StoredProcedure);

    public static Task<int> ExecuteSpAsync(this IDbConnection db, string sp, object? param = null) =>
        db.ExecuteAsync(sp, param, commandType: CommandType.StoredProcedure);

    public static int[] AsIntIdList(this IEnumerable<int> ids) => ids.ToArray();

    public static string AsPurchaseOrderLineList(this IEnumerable<(int ProductId, int Quantity, decimal UnitCost)> lines)
    {
        var array = lines.Select(l => new { ProductId = l.ProductId, Quantity = l.Quantity, UnitCost = l.UnitCost }).ToArray();
        return System.Text.Json.JsonSerializer.Serialize(array);
    }
}
