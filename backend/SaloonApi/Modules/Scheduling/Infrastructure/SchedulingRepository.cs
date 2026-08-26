using System.Data;
using Dapper;
using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;

namespace SaloonApi.Modules.Scheduling.Infrastructure;

internal sealed record TherapistShiftDto(
    int Id, int TherapistId, string TherapistName, int? RoomId, string ShiftType, TimeSpan StartTime, TimeSpan EndTime);

internal sealed record ShiftDetailsDto(int LocationId, DateTime WorkDate, int? RoomId, int TherapistId, string ShiftType);

internal sealed record RoomOpeningDto(
    int Id, int RoomId, string RoomName, int TreatmentCategoryId, string CategoryName, string ShiftType);

internal sealed record RoomOpeningDetailsDto(int Id, int LocationId, int RoomId, DateTime WorkDate, string ShiftType, int TreatmentCategoryId);

internal sealed record BlockedSlotDto(int Id, int RoomId, string RoomName, TimeSpan StartTime, TimeSpan EndTime, string Reason, bool IsLocationBreak);

internal sealed record BlockedSlotDetailsDto(int Id, int LocationId, int RoomId, DateTime WorkDate, TimeSpan StartTime, TimeSpan EndTime, string Reason);

internal sealed record RosterDto(IReadOnlyList<TherapistShiftDto> TherapistShifts, IReadOnlyList<RoomOpeningDto> RoomOpenings, IReadOnlyList<BlockedSlotDto> BlockedSlots);

internal sealed class SchedulingRepository(SqlConnectionFactory factory, ICurrentUser currentUser)
{
    public async Task<RosterDto> GetRosterAsync(int locationId, DateOnly date)
    {
        using var db = factory.Create();
        using var multi = await db.QueryMultipleSpAsync("public.sp_Scheduling_GetRoster", new
        {
            LocationId = locationId,
            WorkDate = date.ToDateTime(TimeOnly.MinValue)
        });

        var shifts = (await multi.ReadAsync<TherapistShiftDto>()).ToList();
        var rooms = (await multi.ReadAsync<RoomOpeningDto>()).ToList();
        var blockedSlots = (await multi.ReadAsync<BlockedSlotDto>()).ToList();
        return new RosterDto(shifts, rooms, blockedSlots);
    }

    public async Task<int> AssignTherapistShiftAsync(
        int locationId, int therapistId, int roomId, string shiftType, DateOnly date, TimeSpan startTime, TimeSpan endTime)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("p_LocationId", locationId);
        p.Add("p_TherapistId", therapistId);
        p.Add("p_RoomId", roomId);
        p.Add("p_ShiftType", shiftType);
        p.Add("p_WorkDate", date.ToDateTime(TimeOnly.MinValue));
        p.Add("p_StartTime", startTime);
        p.Add("p_EndTime", endTime);
        p.Add("p_CreatedBy", currentUser.RequireUserId());
        p.Add("p_Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Scheduling_AssignTherapistShift", p);
        return p.Get<int>("p_Id");
    }

    public async Task<bool> HasShiftOverlapAsync(int roomId, string shiftType, DateOnly workDate, TimeSpan startTime, TimeSpan endTime, int excludeTherapistId)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<bool>("public.sp_Scheduling_HasShiftOverlap", new
        {
            RoomId = roomId,
            ShiftType = shiftType,
            WorkDate = workDate.ToDateTime(TimeOnly.MinValue),
            StartTime = startTime,
            EndTime = endTime,
            ExcludeTherapistId = excludeTherapistId
        });
    }

    public async Task RemoveTherapistShiftAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Scheduling_RemoveTherapistShift", new { Id = id, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task UpdateTherapistShiftAsync(int id, TimeSpan startTime, TimeSpan endTime)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Scheduling_UpdateTherapistShift", new
        {
            Id = id,
            StartTime = startTime,
            EndTime = endTime,
            UpdatedBy = currentUser.RequireUserId()
        });
    }

    public async Task<int?> GetShiftLocationIdAsync(int id)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<int?>("public.sp_Scheduling_GetShiftLocationId", new { Id = id });
    }

    public async Task<ShiftDetailsDto?> GetShiftDetailsAsync(int id)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<ShiftDetailsDto?>("public.sp_Scheduling_GetShiftDetails", new { Id = id });
    }

    public async Task<bool> HasShiftBookingsAsync(int id)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<bool>("public.sp_Scheduling_HasShiftBookings", new { ShiftId = id });
    }

    public async Task<int> OpenRoomAsync(int roomId, int treatmentCategoryId, string shiftType, DateOnly date)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("p_RoomId", roomId);
        p.Add("p_TreatmentCategoryId", treatmentCategoryId);
        p.Add("p_ShiftType", shiftType);
        p.Add("p_WorkDate", date.ToDateTime(TimeOnly.MinValue));
        p.Add("p_CreatedBy", currentUser.RequireUserId());
        p.Add("p_Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Scheduling_OpenRoom", p);
        return p.Get<int>("p_Id");
    }

    public async Task CloseRoomAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Scheduling_CloseRoom", new { Id = id, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task<int?> GetRoomOpeningLocationIdAsync(int id)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<int?>("public.sp_Scheduling_GetRoomOpeningLocationId", new { Id = id });
    }

    public async Task<RoomOpeningDetailsDto?> GetRoomOpeningDetailsAsync(int id)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<RoomOpeningDetailsDto?>("public.sp_Scheduling_GetRoomOpeningDetails", new { Id = id });
    }

    public async Task<RoomOpeningDetailsDto?> GetRoomOpeningByKeysAsync(int roomId, DateOnly workDate, string shiftType)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<RoomOpeningDetailsDto?>("public.sp_Scheduling_GetRoomOpeningByKeys", new
        {
            RoomId = roomId,
            WorkDate = workDate.ToDateTime(TimeOnly.MinValue),
            ShiftType = shiftType
        });
    }

    public async Task<bool> HasRoomBookingsAsync(int roomId, DateOnly workDate)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<bool>("public.sp_Scheduling_HasRoomBookings", new
        {
            RoomId = roomId,
            WorkDate = workDate.ToDateTime(TimeOnly.MinValue)
        });
    }

    public async Task<bool> HasRoomOpeningAsync(int roomId, DateOnly workDate)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<bool>("public.sp_Scheduling_HasRoomOpening", new
        {
            RoomId = roomId,
            WorkDate = workDate.ToDateTime(TimeOnly.MinValue)
        });
    }

    public async Task<bool> HasBookingOverlapAsync(int roomId, DateOnly workDate, TimeSpan startTime, TimeSpan endTime)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<bool>("public.sp_Scheduling_HasBookingOverlap", new
        {
            RoomId = roomId,
            WorkDate = workDate.ToDateTime(TimeOnly.MinValue),
            StartTime = startTime,
            EndTime = endTime
        });
    }

    public async Task<bool> HasBlockOverlapAsync(int roomId, DateOnly workDate, TimeSpan startTime, TimeSpan endTime)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<bool>("public.sp_Scheduling_HasBlockOverlap", new
        {
            RoomId = roomId,
            WorkDate = workDate.ToDateTime(TimeOnly.MinValue),
            StartTime = startTime,
            EndTime = endTime
        });
    }

    public async Task<int> BlockSlotAsync(int roomId, DateOnly workDate, TimeSpan startTime, TimeSpan endTime, string reason, int? blockTypeId = null)
    {
        using var db = factory.Create();
        var p = new DynamicParameters();
        p.Add("p_RoomId", roomId);
        p.Add("p_BlockTypeId", blockTypeId);
        p.Add("p_WorkDate", workDate.ToDateTime(TimeOnly.MinValue));
        p.Add("p_StartTime", startTime);
        p.Add("p_EndTime", endTime);
        p.Add("p_Reason", reason);
        p.Add("p_CreatedBy", currentUser.RequireUserId());
        p.Add("p_Id", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await db.ExecuteSpAsync("public.sp_Scheduling_BlockSlot", p);
        return p.Get<int>("p_Id");
    }

    public async Task UnblockSlotAsync(int id)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Scheduling_UnblockSlot", new { Id = id, UpdatedBy = currentUser.RequireUserId() });
    }

    public async Task UpdateBlockedSlotAsync(int id, TimeSpan startTime, TimeSpan endTime, string reason, int? blockTypeId = null)
    {
        using var db = factory.Create();
        await db.ExecuteSpAsync("public.sp_Scheduling_UpdateBlockedSlot", new
        {
            Id = id,
            BlockTypeId = blockTypeId,
            StartTime = startTime,
            EndTime = endTime,
            Reason = reason,
            UpdatedBy = currentUser.RequireUserId()
        });
    }

    public async Task<BlockedSlotDetailsDto?> GetBlockedSlotDetailsAsync(int id)
    {
        using var db = factory.Create();
        return await db.QuerySingleSpAsync<BlockedSlotDetailsDto?>("public.sp_Scheduling_GetBlockedSlotDetails", new { Id = id });
    }
}

