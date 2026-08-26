using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;
using SaloonApi.Modules.Reports.Infrastructure;

namespace SaloonApi.Shared.Data.DbServices;

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class ReportsDbService
{
    public Task<IEnumerable<SalesByServiceDto>> sp_Report_SalesByServiceAsync(IDbConnection db, int locationId, DateOnly from, DateOnly to)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("From", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("To", to.ToDateTime(TimeOnly.MinValue), DbType.Date);
        return db.QueryAsync<SalesByServiceDto>("SELECT * FROM public.sp_Report_SalesByService(@LocationId, @From, @To)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<SalesByStaffDto>> sp_Report_SalesByStaffAsync(IDbConnection db, int locationId, DateOnly from, DateOnly to)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("From", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("To", to.ToDateTime(TimeOnly.MinValue), DbType.Date);
        return db.QueryAsync<SalesByStaffDto>("SELECT * FROM public.sp_Report_SalesByStaff(@LocationId, @From, @To)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<SalesByLocationDto>> sp_Report_SalesByLocationAsync(IDbConnection db, int chainId, DateOnly from, DateOnly to)
    {
        var args = new DynamicParameters();
        args.Add("ChainId", chainId, DbType.Int32);
        args.Add("From", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("To", to.ToDateTime(TimeOnly.MinValue), DbType.Date);
        return db.QueryAsync<SalesByLocationDto>("SELECT * FROM public.sp_Report_SalesByLocation(@ChainId, @From, @To)", args, commandType: CommandType.Text);
    }

    public Task<RetentionDto?> sp_Report_RetentionAsync(IDbConnection db, int locationId, DateOnly from, DateOnly to)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("From", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("To", to.ToDateTime(TimeOnly.MinValue), DbType.Date);
        return db.QuerySingleOrDefaultAsync<RetentionDto>("SELECT * FROM public.sp_Report_Retention(@LocationId, @From, @To)", args, commandType: CommandType.Text);
    }

    public Task<NoShowRateDto?> sp_Report_NoShowRateAsync(IDbConnection db, int locationId, DateOnly from, DateOnly to)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("From", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        args.Add("To", to.ToDateTime(TimeOnly.MinValue), DbType.Date);
        return db.QuerySingleOrDefaultAsync<NoShowRateDto>("SELECT * FROM public.sp_Report_NoShowRate(@LocationId, @From, @To)", args, commandType: CommandType.Text);
    }
}
