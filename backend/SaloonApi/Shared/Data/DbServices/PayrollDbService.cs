using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;
using SaloonApi.Modules.Payroll.Infrastructure;

namespace SaloonApi.Shared.Data.DbServices;

[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class PayrollDbService
{
    public Task<int> sp_Payroll_UpsertCommissionRuleAsync(
        IDbConnection db, int locationId, int? therapistId, string type, decimal rate, decimal hourlyRate, decimal overtimeThresholdHours, decimal overtimeRateMultiplier, int? createdBy)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("TherapistId", therapistId, DbType.Int32);
        args.Add("Type", type, DbType.String);
        args.Add("Rate", rate, DbType.Decimal);
        args.Add("HourlyRate", hourlyRate, DbType.Decimal);
        args.Add("OvertimeThresholdHours", overtimeThresholdHours, DbType.Decimal);
        args.Add("OvertimeRateMultiplier", overtimeRateMultiplier, DbType.Decimal);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>(
            "SELECT * FROM public.sp_Payroll_UpsertCommissionRule(@LocationId, @TherapistId, @Type, @Rate, @HourlyRate, @OvertimeThresholdHours, @OvertimeRateMultiplier, @CreatedBy)",
            args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<CommissionRuleDto>> sp_Payroll_GetCommissionRulesAsync(IDbConnection db, int locationId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<CommissionRuleDto>("SELECT * FROM public.sp_Payroll_GetCommissionRules(@LocationId)", args, commandType: CommandType.Text);
    }

    public async Task sp_Payroll_DeleteCommissionRuleAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Payroll_DeleteCommissionRule(@Id)", args, commandType: CommandType.Text);
    }

    public Task<int> sp_Payroll_CreatePayRunAsync(IDbConnection db, int locationId, DateOnly periodStart, DateOnly periodEnd, int? createdBy)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        args.Add("PeriodStart", periodStart, DbType.Date);
        args.Add("PeriodEnd", periodEnd, DbType.Date);
        args.Add("CreatedBy", createdBy, DbType.Int32);
        return db.ExecuteScalarAsync<int>("SELECT * FROM public.sp_Payroll_CreatePayRun(@LocationId, @PeriodStart, @PeriodEnd, @CreatedBy)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<PayRunDto>> sp_Payroll_GetPayRunsAsync(IDbConnection db, int locationId)
    {
        var args = new DynamicParameters();
        args.Add("LocationId", locationId, DbType.Int32);
        return db.QueryAsync<PayRunDto>("SELECT * FROM public.sp_Payroll_GetPayRuns(@LocationId)", args, commandType: CommandType.Text);
    }

    public Task<RefCursorGridReader> sp_Payroll_GetPayRunDetailAsync(IDbConnection db, int id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        return RefCursorGridReader.ExecuteAsync(db, "public.sp_Payroll_GetPayRunDetail", args);
    }

    public async Task sp_Payroll_FinalizePayRunAsync(IDbConnection db, int id, int? updatedBy)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int32);
        args.Add("UpdatedBy", updatedBy, DbType.Int32);
        await db.ExecuteAsync("CALL public.sp_Payroll_FinalizePayRun(@Id, @UpdatedBy)", args, commandType: CommandType.Text);
    }
}
