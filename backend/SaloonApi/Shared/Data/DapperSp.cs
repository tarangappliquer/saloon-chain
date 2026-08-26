using Dapper;
using SaloonApi.Shared.Data.TypeHandlers;
using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;

namespace SaloonApi.Shared.Data;

internal static class DapperSp
{
    static DapperSp()
    {
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

    public static async Task<RefCursorGridReader> ExecuteAsync(IDbConnection db, string spName, DynamicParameters dynamicParams)
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

        DbTransaction? tx = null;
        bool ownsTransaction = false;

        if (db is DbConnection conn)
        {
            tx = await conn.BeginTransactionAsync();
            ownsTransaction = true;
        }

        try
        {
            var paramNames = dynamicParams.ParameterNames
                .Select(p => p.StartsWith('@') ? p[1..] : p)
                .Select(p => p.StartsWith("p_", StringComparison.OrdinalIgnoreCase) ? p : "p_" + p);
            var callArgs = string.Join(", ", paramNames.Select(p => $"{p} => @{p}"));
            var callSql = string.IsNullOrEmpty(callArgs) ? $"CALL {spName}()" : $"CALL {spName}({callArgs})";

            var cursorNames = new List<string>();
            using (var reader = (DbDataReader)await db.ExecuteReaderAsync(callSql, dynamicParams, transaction: tx))
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
        catch
        {
            if (ownsTransaction && tx is not null)
            {
                try
                {
                    await tx.RollbackAsync();
                }
                catch (DbException ex)
                {
                    _ = ex;
                }
                await tx.DisposeAsync();
            }
            throw;
        }
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
