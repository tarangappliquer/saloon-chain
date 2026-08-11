using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Reports.Infrastructure;

internal sealed record SalesByServiceDto(int TreatmentId, string TreatmentName, string CategoryName, int BookingCount, decimal TotalRevenue);
internal sealed record SalesByStaffDto(int TherapistId, string TherapistName, int BookingCount, decimal TotalRevenue);
internal sealed record SalesByLocationDto(int LocationId, string LocationName, int BookingCount, decimal TotalRevenue);
internal sealed record RetentionDto(int TotalCustomers, int ReturningCustomers, decimal RetentionRatePercent);
internal sealed record NoShowRateDto(int TotalAppointments, int NoShowCount, decimal NoShowRatePercent);

internal sealed class ReportsRepository(SqlConnectionFactory factory)
{
    public async Task<IReadOnlyList<SalesByServiceDto>> GetSalesByServiceAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<SalesByServiceDto>("dbo.sp_Report_SalesByService", new { LocationId = locationId, From = from, To = to })).ToList();
    }

    public async Task<IReadOnlyList<SalesByStaffDto>> GetSalesByStaffAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<SalesByStaffDto>("dbo.sp_Report_SalesByStaff", new { LocationId = locationId, From = from, To = to })).ToList();
    }

    public async Task<IReadOnlyList<SalesByLocationDto>> GetSalesByLocationAsync(int chainId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        return (await db.QuerySpAsync<SalesByLocationDto>("dbo.sp_Report_SalesByLocation", new { ChainId = chainId, From = from, To = to })).ToList();
    }

    public async Task<RetentionDto?> GetRetentionAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<RetentionDto>("dbo.sp_Report_Retention", new { LocationId = locationId, From = from, To = to });
    }

    public async Task<NoShowRateDto?> GetNoShowRateAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<NoShowRateDto>("dbo.sp_Report_NoShowRate", new { LocationId = locationId, From = from, To = to });
    }
}
