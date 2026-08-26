using System.Collections.Concurrent;
using System.Data;
using System.Diagnostics.CodeAnalysis;
using System.Linq.Expressions;
using System.Reflection;
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
        db.QueryAsync<T>(sp, PrefixParams(param), commandType: CommandType.StoredProcedure);

    public static Task<T?> QuerySingleSpAsync<T>(this IDbConnection db, string sp, object? param = null) =>
        db.QuerySingleOrDefaultAsync<T>(sp, PrefixParams(param), commandType: CommandType.StoredProcedure);

    public static Task<SqlMapper.GridReader> QueryMultipleSpAsync(this IDbConnection db, string sp, object? param = null) =>
        db.QueryMultipleAsync(sp, PrefixParams(param), commandType: CommandType.StoredProcedure);

    public static Task<int> ExecuteSpAsync(this IDbConnection db, string sp, object? param = null) =>
        db.ExecuteAsync(sp, PrefixParams(param), commandType: CommandType.StoredProcedure);

    // Every Postgres routine in 03_procs_postgres.sql declares its parameters p_<Name> (its own
    // stated convention). Npgsql's CommandType.StoredProcedure calling convention resolves the
    // routine using PostgreSQL named-argument notation (`p_Name => value`) built straight from
    // each parameter's own name -- a caller-supplied "LocationId" never matches the routine's
    // "p_LocationId" on its own, so every anonymous-object call site adds its properties
    // unprefixed and the p_ prefix is added once, here. Call sites that need Output/refcursor
    // parameters build their own DynamicParameters with p_-prefixed keys directly and are passed
    // through untouched -- their metadata (DbType/Direction) can't be safely copied generically.
    //
    // Hot path (every DB call in the app): everything below is 100% determined by param's TYPE,
    // not its values, and the same anonymous-type shape repeats on every call to a given method --
    // so the name/DbType/accessor work is done once per type and cached, not once per call. The
    // cached getter is a compiled expression, not PropertyInfo.GetValue, to avoid the reflection
    // invocation cost on every request.
    private static readonly ConcurrentDictionary<Type, ParamAccessor[]> AccessorCache = new();

    private readonly record struct ParamAccessor(string Name, DbType? DbType, Func<object, object?> Getter);

    private static object? PrefixParams(object? param)
    {
        if (param is null or DynamicParameters) return param;
        var accessors = AccessorCache.GetOrAdd(param.GetType(), BuildAccessors);
        var prefixed = new DynamicParameters();
        foreach (var accessor in accessors)
        {
            var value = accessor.Getter(param);
            // DynamicParameters infers a DbType from the runtime value only when one is present --
            // a null value (routine params like p_ChainId/p_LocationId are null constantly, e.g.
            // every RootSuperAdmin-scoped call) would otherwise go out untyped, and Postgres won't
            // implicitly cast an untyped/wrongly-defaulted NULL to the routine's declared parameter
            // type. Only null needs the assist -- a present value keeps Dapper's normal inference.
            prefixed.Add(accessor.Name, value, value is null ? accessor.DbType : null);
        }
        return prefixed;
    }

    private static ParamAccessor[] BuildAccessors(Type type)
    {
        var props = type.GetProperties();
        var accessors = new ParamAccessor[props.Length];
        for (var i = 0; i < props.Length; i++)
        {
            var prop = props[i];
            var trimmedName = prop.Name.Trim();
            var bareName = trimmedName.StartsWith('@') ? trimmedName[1..] : trimmedName;
            var name = bareName.StartsWith("p_", StringComparison.OrdinalIgnoreCase) ? bareName : "p_" + bareName;
            accessors[i] = new ParamAccessor(name, InferDbType(prop.PropertyType), CompileGetter(type, prop));
        }
        return accessors;
    }

    private static Func<object, object?> CompileGetter(Type type, PropertyInfo prop)
    {
        var target = Expression.Parameter(typeof(object), "target");
        var typedAccess = Expression.Property(Expression.Convert(target, type), prop);
        var boxed = Expression.Convert(typedAccess, typeof(object));
        return Expression.Lambda<Func<object, object?>>(boxed, target).Compile();
    }

    private static DbType? InferDbType(Type type)
    {
        type = Nullable.GetUnderlyingType(type) ?? type;
        if (type == typeof(int)) return DbType.Int32;
        if (type == typeof(long)) return DbType.Int64;
        if (type == typeof(short)) return DbType.Int16;
        if (type == typeof(string)) return DbType.String;
        if (type == typeof(bool)) return DbType.Boolean;
        if (type == typeof(decimal)) return DbType.Decimal;
        if (type == typeof(double)) return DbType.Double;
        if (type == typeof(DateTime)) return DbType.DateTime;
        if (type == typeof(DateOnly)) return DbType.Date;
        if (type == typeof(TimeOnly) || type == typeof(TimeSpan)) return DbType.Time;
        if (type == typeof(Guid)) return DbType.Guid;
        if (type == typeof(byte[])) return DbType.Binary;
        return null;
    }

    public static int[] AsIntIdList(this IEnumerable<int> ids) => ids.ToArray();

    public static string AsPurchaseOrderLineList(this IEnumerable<(int ProductId, int Quantity, decimal UnitCost)> lines)
    {
        var array = lines.Select(l => new { ProductId = l.ProductId, Quantity = l.Quantity, UnitCost = l.UnitCost }).ToArray();
        return System.Text.Json.JsonSerializer.Serialize(array);
    }
}
