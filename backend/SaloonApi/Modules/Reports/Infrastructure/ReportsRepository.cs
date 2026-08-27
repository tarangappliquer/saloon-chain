using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Reports.Infrastructure;

// BookingCount/TotalCustomers/etc are COUNT(*)/SUM(int) results -- Postgres returns bigint for
// those, which Npgsql/Dapper materializes as long, not int (positional-record materialization
// requires an exact type match, so `int` here throws "no matching constructor" the moment a row
// actually comes back).
internal sealed record SalesByServiceDto(int TreatmentId, string TreatmentName, string CategoryName, long BookingCount, decimal TotalRevenue);
internal sealed record SalesByStaffDto(int TherapistId, string TherapistName, long BookingCount, decimal TotalRevenue);
internal sealed record SalesByLocationDto(int LocationId, string LocationName, long BookingCount, decimal TotalRevenue);
internal sealed record RetentionDto(long TotalCustomers, long ReturningCustomers, decimal RetentionRatePercent);
internal sealed record NoShowRateDto(long TotalAppointments, long NoShowCount, decimal NoShowRatePercent);

internal sealed class ReportsRepository(SqlConnectionFactory factory, ReportsDbService reportsDb)
{
    public async Task<IReadOnlyList<SalesByServiceDto>> GetSalesByServiceAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        return (await reportsDb.sp_Report_SalesByServiceAsync(db, locationId, from, to)).ToList();
    }

    public async Task<IReadOnlyList<SalesByStaffDto>> GetSalesByStaffAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        return (await reportsDb.sp_Report_SalesByStaffAsync(db, locationId, from, to)).ToList();
    }

    public async Task<IReadOnlyList<SalesByLocationDto>> GetSalesByLocationAsync(int chainId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        return (await reportsDb.sp_Report_SalesByLocationAsync(db, chainId, from, to)).ToList();
    }

    public async Task<RetentionDto?> GetRetentionAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        return await reportsDb.sp_Report_RetentionAsync(db, locationId, from, to);
    }

    public async Task<NoShowRateDto?> GetNoShowRateAsync(int locationId, DateOnly from, DateOnly to)
    {
        using var db = factory.Create();
        return await reportsDb.sp_Report_NoShowRateAsync(db, locationId, from, to);
    }
}
