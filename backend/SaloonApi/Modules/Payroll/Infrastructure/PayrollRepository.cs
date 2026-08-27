using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Payroll.Infrastructure;

internal sealed record CommissionRuleDto(int Id, int LocationId, int? TherapistId, string? TherapistName, string Type, decimal Rate, decimal HourlyRate, decimal OvertimeThresholdHours, decimal OvertimeRateMultiplier);
internal sealed record PayRunDto(int Id, int LocationId, DateOnly PeriodStart, DateOnly PeriodEnd, string Status, DateTime? FinalizedDate, DateTime CreatedDate, decimal TotalCommission);
// Init-property, not positional -- Dapper matches these by column NAME (order/count-independent).
internal sealed record PayRunHeaderDto
{
    public int Id { get; init; }
    public int LocationId { get; init; }
    public DateOnly PeriodStart { get; init; }
    public DateOnly PeriodEnd { get; init; }
    public string Status { get; init; } = "";
    public DateTime? FinalizedDate { get; init; }
    public DateTime CreatedDate { get; init; }
}

internal sealed record PayRunLineDto
{
    public int Id { get; init; }
    public int TherapistId { get; init; }
    public string TherapistName { get; init; } = "";
    public decimal GrossSales { get; init; }
    public decimal HoursWorked { get; init; }
    public decimal RegularHours { get; init; }
    public decimal OvertimeHours { get; init; }
    public decimal HourlyRate { get; init; }
    public decimal CommissionRate { get; init; }
    public string CommissionType { get; init; } = "";
    public decimal CommissionAmount { get; init; }
    public decimal OvertimePay { get; init; }
    public decimal TotalPay { get; init; }
}
internal sealed record PayRunDetailDto(PayRunHeaderDto? Header, IReadOnlyList<PayRunLineDto> Lines);

internal sealed class PayrollRepository(SqlConnectionFactory factory, PayrollDbService payrollDb)
{
    public async Task<int> UpsertCommissionRuleAsync(int locationId, int? therapistId, string type, decimal rate, decimal hourlyRate, decimal overtimeThresholdHours, decimal overtimeRateMultiplier, int? createdBy)
    {
        using var db = factory.Create();
        return await payrollDb.sp_Payroll_UpsertCommissionRuleAsync(db, locationId, therapistId, type, rate, hourlyRate, overtimeThresholdHours, overtimeRateMultiplier, createdBy);
    }

    public async Task<IReadOnlyList<CommissionRuleDto>> GetCommissionRulesAsync(int locationId)
    {
        using var db = factory.Create();
        return (await payrollDb.sp_Payroll_GetCommissionRulesAsync(db, locationId)).ToList();
    }

    public async Task DeleteCommissionRuleAsync(int id)
    {
        using var db = factory.Create();
        await payrollDb.sp_Payroll_DeleteCommissionRuleAsync(db, id);
    }

    public async Task<int> CreatePayRunAsync(int locationId, DateOnly periodStart, DateOnly periodEnd, int? createdBy)
    {
        using var db = factory.Create();
        return await payrollDb.sp_Payroll_CreatePayRunAsync(db, locationId, periodStart, periodEnd, createdBy);
    }

    public async Task<IReadOnlyList<PayRunDto>> GetPayRunsAsync(int locationId)
    {
        using var db = factory.Create();
        return (await payrollDb.sp_Payroll_GetPayRunsAsync(db, locationId)).ToList();
    }

    public async Task<PayRunDetailDto> GetPayRunDetailAsync(int id)
    {
        using var db = factory.Create();
        using var multi = await payrollDb.sp_Payroll_GetPayRunDetailAsync(db, id);
        var header = await multi.ReadSingleOrDefaultAsync<PayRunHeaderDto>();
        var lines = (await multi.ReadAsync<PayRunLineDto>()).ToList();
        return new PayRunDetailDto(header, lines);
    }

    public async Task FinalizePayRunAsync(int id, int? updatedBy)
    {
        using var db = factory.Create();
        await payrollDb.sp_Payroll_FinalizePayRunAsync(db, id, updatedBy);
    }
}
