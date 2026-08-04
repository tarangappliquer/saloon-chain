using System.Data;
using Dapper;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Scheduling.Infrastructure;

internal sealed record TherapistShiftDto(
    int Id, int TherapistId, string TherapistName, string ShiftType, TimeSpan StartTime, TimeSpan EndTime);

internal sealed record RoomOpeningDto(
    int Id, int RoomId, string RoomName, int TreatmentCategoryId, string CategoryName, string ShiftType);

internal sealed record RosterDto(IReadOnlyList<TherapistShiftDto> TherapistShifts, IReadOnlyList<RoomOpeningDto> RoomOpenings);

internal sealed class SchedulingRepository(SqlConnectionFactory factory, ICurrentUser currentUser)
{
    public async Task<RosterDto> GetRosterAsync(int locationId, DateOnly date)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("dbo.sp_Scheduling_GetRoster", new
        {
            LocationId = locationId,
            WorkDate = date.ToDateTime(TimeOnly.MinValue)
        });

        var shifts = (await multi.ReadAsync<TherapistShiftDto>()).ToList();
        var rooms = (await multi.ReadAsync<RoomOpeningDto>()).ToList();
        return new RosterDto(shifts, rooms);
    }

    public async Task<int> AssignTherapistShiftAsync(
        int locationId, int therapistId, string shiftType, DateOnly date, TimeSpan startTime, TimeSpan endTime)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@LocationId", locationId);
        p.Add("@TherapistId", therapistId);
        p.Add("@ShiftType", shiftType);
        p.Add("@WorkDate", date.ToDateTime(TimeOnly.MinValue));
        p.Add("@StartTime", startTime);
        p.Add("@EndTime", endTime);
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("dbo.sp_Scheduling_AssignTherapistShift", p);
        return p.Get<int>("@Id");
    }

    public async Task RemoveTherapistShiftAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Scheduling_RemoveTherapistShift", new { Id = id, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<int?> GetShiftLocationIdAsync(int id)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<int?>("dbo.sp_Scheduling_GetShiftLocationId", new { Id = id });
    }

    public async Task<int> OpenRoomAsync(int roomId, int treatmentCategoryId, string shiftType, DateOnly date)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("@RoomId", roomId);
        p.Add("@TreatmentCategoryId", treatmentCategoryId);
        p.Add("@ShiftType", shiftType);
        p.Add("@WorkDate", date.ToDateTime(TimeOnly.MinValue));
        p.Add("@CreatedBy", currentUser.RequireUserId());
        p.Add("@Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("dbo.sp_Scheduling_OpenRoom", p);
        return p.Get<int>("@Id");
    }

    public async Task CloseRoomAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("dbo.sp_Scheduling_CloseRoom", new { Id = id, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<int?> GetRoomOpeningLocationIdAsync(int id)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<int?>("dbo.sp_Scheduling_GetRoomOpeningLocationId", new { Id = id });
    }
}
