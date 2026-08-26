using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Payroll.Infrastructure;

internal sealed record CommissionRuleDto(int Id, int LocationId, int? TherapistId, string? TherapistName, string Type, decimal Rate, decimal HourlyRate, decimal OvertimeThresholdHours, decimal OvertimeRateMultiplier);
internal sealed record PayRunDto(int Id, int LocationId, DateOnly PeriodStart, DateOnly PeriodEnd, string Status, DateTime? FinalizedDate, DateTime CreatedDate, decimal TotalCommission);
internal sealed record PayRunHeaderDto(int Id, int LocationId, DateOnly PeriodStart, DateOnly PeriodEnd, string Status, DateTime? FinalizedDate, DateTime CreatedDate);
internal sealed record PayRunLineDto(int Id, int TherapistId, string TherapistName, decimal GrossSales, decimal HoursWorked, decimal RegularHours, decimal OvertimeHours, decimal HourlyRate, decimal CommissionRate, string CommissionType, decimal CommissionAmount, decimal OvertimePay, decimal TotalPay);
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
