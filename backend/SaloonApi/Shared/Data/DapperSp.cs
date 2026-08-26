using System.Collections.Concurrent;
using System.Data;
using System.Data.Common;
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

    public static Task<IEnumerable<T>> QuerySpAsync<T>(this IDbConnection db, string sp, object? param = null)
    {
        var call = BuildCall(sp, param);
        return db.QueryAsync<T>(call.Sql, call.Args, commandType: call.Type);
    }

    public static Task<T?> QuerySingleSpAsync<T>(this IDbConnection db, string sp, object? param = null)
    {
        var call = BuildCall(sp, param);
        return db.QuerySingleOrDefaultAsync<T>(call.Sql, call.Args, commandType: call.Type);
    }

    public static async Task<RefCursorGridReader> QueryMultipleSpAsync(
        this IDbConnection db, string sp, object? param = null, IDbTransaction? transaction = null)
    {
        if (db.State != ConnectionState.Open)
        {
            if (db is DbConnection dbConn)
            {
                await dbConn.OpenAsync();
            }
            else
            {
                db.Open();
            }
        }

        DbTransaction? tx = transaction as DbTransaction;
        bool ownsTransaction = false;

        if (tx is null && db is DbConnection conn)
        {
            tx = await conn.BeginTransactionAsync();
            ownsTransaction = true;
        }

        try
        {
            var (callSql, args) = BuildProcedureCall(sp, param);
            var cursorNames = new List<string>();

            using (var reader = (DbDataReader)await db.ExecuteReaderAsync(callSql, args, transaction: tx))
            {
                if (await reader.ReadAsync())
                {
                    for (int i = 0; i < reader.FieldCount; i++)
                    {
                        cursorNames.Add(reader.GetString(i));
                    }
                }
            }

            return new RefCursorGridReader(db, tx, ownsTransaction, cursorNames);
        }
        catch (Exception)
        {
            if (ownsTransaction && tx is not null)
            {
                try
                {
                    await tx.RollbackAsync();
                }
                catch (DbException ex)
                {
                    // Rollback failure suppressed during exception unwinding to preserve original exception.
                    _ = ex;
                }
                await tx.DisposeAsync();
            }
            throw;
        }
    }

    private static (string Sql, object? Args) BuildProcedureCall(string sp, object? param)
    {
        if (param is null)
        {
            return ($"CALL {sp}()", null);
        }

        if (param is DynamicParameters dynamicParams)
        {
            var paramNames = dynamicParams.ParameterNames
                .Select(p => p.StartsWith('@') ? p[1..] : p)
                .Select(p => p.StartsWith("p_", StringComparison.OrdinalIgnoreCase) ? p : "p_" + p);
            var callArgs = string.Join(", ", paramNames.Select(p => $"{p} => @{p}"));
            return (string.IsNullOrEmpty(callArgs) ? $"CALL {sp}()" : $"CALL {sp}({callArgs})", dynamicParams);
        }

        var (callArgsStr, accessors) = ShapeCache.GetOrAdd(param.GetType(), BuildShape);
        var args = new DynamicParameters();
        foreach (var accessor in accessors)
        {
            var value = accessor.Getter(param);
            args.Add(accessor.Name, value, value is null ? accessor.DbType : null);
        }
        return ($"CALL {sp}({callArgsStr})", args);
    }

    public static Task<int> ExecuteSpAsync(this IDbConnection db, string sp, object? param = null)
    {
        var call = BuildCall(sp, param);
        return db.ExecuteAsync(call.Sql, call.Args, commandType: call.Type);
    }

    // Postgres FUNCTIONs (what nearly every routine in 03_procs_postgres.sql actually is) must be
    // invoked as `SELECT * FROM name(...)`. Npgsql's CommandType.StoredProcedure instead issues a
    // CALL -- valid only against a genuine PROCEDURE (Postgres 11+) -- which fails with "procedure
    // ... does not exist" against a FUNCTION no matter how correctly its arguments are named. So an
    // anonymous-object call site (the vast majority) is rewritten here into an explicit SELECT text
    // command, addressed with Postgres's own named-argument call syntax (p_Name => @p_Name) so
    // Dapper's normal @-parameter binding still applies. A caller-built DynamicParameters (used for
    // Output-parameter and refcursor call sites) is passed through unchanged via the old
    // CommandType.StoredProcedure path -- an OUT parameter has no place in a function's own call
    // argument list at all (it's the function's result column, not an input), which needs each such
    // call site converted one-by-one to read its OUT value from the result row instead; not yet
    // done for all of them.
    private static (string Sql, object? Args, CommandType Type) BuildCall(string sp, object? param)
    {
        if (param is null or DynamicParameters)
        {
            return (sp, PrefixParams(param), CommandType.StoredProcedure);
        }

        var (callArgs, accessors) = ShapeCache.GetOrAdd(param.GetType(), BuildShape);
        var args = new DynamicParameters();
        foreach (var accessor in accessors)
        {
            var value = accessor.Getter(param);
            // DynamicParameters infers a DbType from the runtime value only when one is present --
            // a null value (routine params like p_ChainId/p_LocationId are null constantly, e.g.
            // every RootSuperAdmin-scoped call) would otherwise go out untyped, and Postgres won't
            // implicitly cast an untyped/wrongly-defaulted NULL to the routine's declared parameter
            // type. Only null needs the assist -- a present value keeps Dapper's normal inference.
            args.Add(accessor.Name, value, value is null ? accessor.DbType : null);
        }
        return ($"SELECT * FROM {sp}({callArgs})", args, CommandType.Text);
    }

    // Kept for the DynamicParameters branch above (Output/refcursor call sites still on the old
    // CALL-based path) -- renames whatever the caller supplied to the routine's actual p_<Name>
    // parameter names, same as BuildShape does for the anonymous-object path below.
    private static object? PrefixParams(object? param)
    {
        if (param is null or DynamicParameters) return param;
        var (_, accessors) = ShapeCache.GetOrAdd(param.GetType(), BuildShape);
        var prefixed = new DynamicParameters();
        foreach (var accessor in accessors)
        {
            var value = accessor.Getter(param);
            prefixed.Add(accessor.Name, value, value is null ? accessor.DbType : null);
        }
        return prefixed;
    }

    // Hot path (every DB call in the app): everything below is 100% determined by param's TYPE, not
    // its values, and the same anonymous-type shape repeats on every call to a given method -- so
    // the name/DbType/accessor/call-text work is done once per type and cached, not once per call.
    // The cached getter is a compiled expression, not PropertyInfo.GetValue, to avoid the reflection
    // invocation cost on every request.
    private static readonly ConcurrentDictionary<Type, (string CallArgs, ParamAccessor[] Accessors)> ShapeCache = new();

    private readonly record struct ParamAccessor(string Name, DbType? DbType, Func<object, object?> Getter);

    private static (string, ParamAccessor[]) BuildShape(Type type)
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
        var callArgs = string.Join(", ", accessors.Select(a => $"{a.Name} => @{a.Name}"));
        return (callArgs, accessors);
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

[SuppressMessage("Security", "S2077:SqlQueriesShouldBePassedParameters", Justification = "PostgreSQL FETCH statement requires cursor identifier which cannot be parameterized.")]
internal sealed class RefCursorGridReader : IDisposable, IAsyncDisposable
{
    private readonly IDbConnection _db;
    private readonly DbTransaction? _tx;
    private readonly bool _ownsTransaction;
    private readonly IReadOnlyList<string> _cursorNames;
    private int _currentIndex;
    private bool _hasError;
    private bool _disposed;

    public RefCursorGridReader(IDbConnection db, DbTransaction? tx, bool ownsTransaction, IReadOnlyList<string> cursorNames)
    {
        _db = db;
        _tx = tx;
        _ownsTransaction = ownsTransaction;
        _cursorNames = cursorNames;
    }

    public async Task<IEnumerable<T>> ReadAsync<T>()
    {
        EnsureNotDisposed();
        var cursorName = GetNextCursorName();
        try
        {
            return await _db.QueryAsync<T>($"FETCH ALL FROM \"{cursorName}\";", transaction: _tx);
        }
        catch
        {
            _hasError = true;
            throw;
        }
    }

    public async Task<T?> ReadSingleOrDefaultAsync<T>()
    {
        EnsureNotDisposed();
        var cursorName = GetNextCursorName();
        try
        {
            return await _db.QuerySingleOrDefaultAsync<T>($"FETCH ALL FROM \"{cursorName}\";", transaction: _tx);
        }
        catch
        {
            _hasError = true;
            throw;
        }
    }

    public async Task<T> ReadSingleAsync<T>()
    {
        EnsureNotDisposed();
        var cursorName = GetNextCursorName();
        try
        {
            return await _db.QuerySingleAsync<T>($"FETCH ALL FROM \"{cursorName}\";", transaction: _tx);
        }
        catch
        {
            _hasError = true;
            throw;
        }
    }

    private string GetNextCursorName()
    {
        if (_currentIndex >= _cursorNames.Count)
        {
            throw new InvalidOperationException("No more result sets available.");
        }
        return _cursorNames[_currentIndex++];
    }

    private void EnsureNotDisposed()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        if (_ownsTransaction && _tx is not null)
        {
            try
            {
                if (_hasError)
                {
                    _tx.Rollback();
                }
                else
                {
                    _tx.Commit();
                }
            }
            catch (DbException ex)
            {
                _ = ex;
                try
                {
                    _tx.Rollback();
                }
                catch (DbException rollbackEx)
                {
                    // Suppress rollback failure during dispose cleanup to allow clean resource release.
                    _ = rollbackEx;
                }
            }
            finally
            {
                _tx.Dispose();
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;

        if (_ownsTransaction && _tx is not null)
        {
            try
            {
                if (_hasError)
                {
                    await _tx.RollbackAsync();
                }
                else
                {
                    await _tx.CommitAsync();
                }
            }
            catch (DbException ex)
            {
                _ = ex;
                try
                {
                    await _tx.RollbackAsync();
                }
                catch (DbException rollbackEx)
                {
                    // Suppress rollback failure during async dispose cleanup to allow clean resource release.
                    _ = rollbackEx;
                }
            }
            finally
            {
                await _tx.DisposeAsync();
            }
        }
    }
}
