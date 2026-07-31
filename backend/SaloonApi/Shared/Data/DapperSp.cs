using System.Data;
using Dapper;

namespace SaloonApi.Shared.Data;

// Every DB call in this project goes through these — CommandType.StoredProcedure only, no inline SQL.
public static class DapperSp
{
    public static Task<IEnumerable<T>> QuerySpAsync<T>(this IDbConnection db, string sp, object? param = null) =>
        db.QueryAsync<T>(sp, param, commandType: CommandType.StoredProcedure);

    public static Task<T?> QuerySingleSpAsync<T>(this IDbConnection db, string sp, object? param = null) =>
        db.QuerySingleOrDefaultAsync<T>(sp, param, commandType: CommandType.StoredProcedure);

    public static Task<SqlMapper.GridReader> QueryMultipleSpAsync(this IDbConnection db, string sp, object? param = null) =>
        db.QueryMultipleAsync(sp, param, commandType: CommandType.StoredProcedure);

    public static Task<int> ExecuteSpAsync(this IDbConnection db, string sp, object? param = null) =>
        db.ExecuteAsync(sp, param, commandType: CommandType.StoredProcedure);

    public static SqlMapper.ICustomQueryParameter AsIntIdList(this IEnumerable<int> ids)
    {
        var table = new DataTable();
        table.Columns.Add("Id", typeof(int));
        foreach (var id in ids) table.Rows.Add(id);
        return table.AsTableValuedParameter("dbo.IntIdList");
    }
}
