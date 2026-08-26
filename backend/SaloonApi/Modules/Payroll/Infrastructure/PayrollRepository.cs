using Dapper;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Payroll.Infrastructure;

internal sealed record CommissionRuleDto(int Id, int LocationId, int? TherapistId, string? TherapistName, string Type, decimal Rate, decimal HourlyRate, decimal OvertimeThresholdHours, decimal OvertimeRateMultiplier);
internal sealed record PayRunDto(int Id, int LocationId, DateOnly PeriodStart, DateOnly PeriodEnd, string Status, DateTime? FinalizedDate, DateTime CreatedDate, decimal TotalCommission);
internal sealed record PayRunHeaderDto(int Id, int LocationId, DateOnly PeriodStart, DateOnly PeriodEnd, string Status, DateTime? FinalizedDate, DateTime CreatedDate);
internal sealed record PayRunLineDto(int Id, int TherapistId, string TherapistName, decimal GrossSales, decimal HoursWorked, decimal RegularHours, decimal OvertimeHours, decimal HourlyRate, decimal CommissionRate, string CommissionType, decimal CommissionAmount, decimal OvertimePay, decimal TotalPay);
internal sealed record PayRunDetailDto(PayRunHeaderDto? Header, IReadOnlyList<PayRunLineDto> Lines);

internal sealed class PayrollRepository(SqlConnectionFactory factory)
{
    public async Task<int> UpsertCommissionRuleAsync(int locationId, int? therapistId, string type, decimal rate, decimal hourlyRate, decimal overtimeThresholdHours, decimal overtimeRateMultiplier, int? createdBy)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<int>("public.sp_Payroll_UpsertCommissionRule",
            new { LocationId = locationId, TherapistId = therapistId, Type = type, Rate = rate, HourlyRate = hourlyRate, OvertimeThresholdHours = overtimeThresholdHours, OvertimeRateMultiplier = overtimeRateMultiplier, CreatedBy = createdBy });
    }

    public async Task<IReadOnlyList<CommissionRuleDto>> GetCommissionRulesAsync(int locationId)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<CommissionRuleDto>("public.sp_Payroll_GetCommissionRules", new { LocationId = locationId })).ToList();
    }

    public async Task DeleteCommissionRuleAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Payroll_DeleteCommissionRule", new { Id = id });
    }

    public async Task<int> CreatePayRunAsync(int locationId, DateOnly periodStart, DateOnly periodEnd, int? createdBy)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@LocationId", locationId);
        p.Add("@PeriodStart", periodStart);
        p.Add("@PeriodEnd", periodEnd);
        p.Add("@CreatedBy", createdBy);
        p.Add("@Id", dbType: System.Data.DbType.Int32, direction: System.Data.ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Payroll_CreatePayRun", p);
        return p.Get<int>("@Id");
    }

    public async Task<IReadOnlyList<PayRunDto>> GetPayRunsAsync(int locationId)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<PayRunDto>("public.sp_Payroll_GetPayRuns", new { LocationId = locationId })).ToList();
    }

    public async Task<PayRunDetailDto> GetPayRunDetailAsync(int id)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("public.sp_Payroll_GetPayRunDetail", new { Id = id });
        var header = await multi.ReadSingleOrDefaultAsync<PayRunHeaderDto>();
        var lines = (await multi.ReadAsync<PayRunLineDto>()).ToList();
        return new PayRunDetailDto(header, lines);
    }

    public async Task FinalizePayRunAsync(int id, int? updatedBy)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Payroll_FinalizePayRun", new { Id = id, UpdatedBy = updatedBy });
    }
}
