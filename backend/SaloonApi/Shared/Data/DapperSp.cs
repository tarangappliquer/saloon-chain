using Dapper;
using SaloonApi.Shared.Data.TypeHandlers;

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
