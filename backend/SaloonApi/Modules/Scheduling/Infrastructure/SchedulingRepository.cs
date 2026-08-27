using SaloonApi.Shared.Auth;
using SaloonApi.Shared.Data;
using SaloonApi.Shared.Data.DbServices;

namespace SaloonApi.Modules.Scheduling.Infrastructure;

// Init-property, not positional -- Dapper matches these by column NAME (order/count-independent)
// instead of requiring the SQL column order to exactly match the constructor parameter order.
internal sealed record TherapistShiftDto
{
    public int Id { get; init; }
    public int TherapistId { get; init; }
    public string TherapistName { get; init; } = "";
    public int? RoomId { get; init; }
    public string ShiftType { get; init; } = "";
    public TimeOnly StartTime { get; init; }
    public TimeOnly EndTime { get; init; }
}

// WorkDate is a Postgres `date` column -- DateOnly (via the registered DateOnlyTypeHandler), not
// DateTime, or positional materialization throws "no matching constructor" once a row comes back.
internal sealed record ShiftDetailsDto(int LocationId, DateOnly WorkDate, int? RoomId, int TherapistId, string ShiftType);

internal sealed record RoomOpeningDto
{
    public int Id { get; init; }
    public int RoomId { get; init; }
    public string RoomName { get; init; } = "";
    public int TreatmentCategoryId { get; init; }
    public string CategoryName { get; init; } = "";
    public string ShiftType { get; init; } = "";
}

internal sealed record RoomOpeningDetailsDto(int Id, int LocationId, int RoomId, DateOnly WorkDate, string ShiftType, int TreatmentCategoryId);

internal sealed record BlockedSlotDto
{
    public int Id { get; init; }
    public int RoomId { get; init; }
    public string RoomName { get; init; } = "";
    public TimeOnly StartTime { get; init; }
    public TimeOnly EndTime { get; init; }
    public string Reason { get; init; } = "";
    public bool IsLocationBreak { get; init; }
}

internal sealed record BlockedSlotDetailsDto(int Id, int LocationId, int RoomId, DateOnly WorkDate, TimeOnly StartTime, TimeOnly EndTime, string Reason);

internal sealed record RosterDto(IReadOnlyList<TherapistShiftDto> TherapistShifts, IReadOnlyList<RoomOpeningDto> RoomOpenings, IReadOnlyList<BlockedSlotDto> BlockedSlots);

internal sealed class SchedulingRepository(SqlConnectionFactory factory, ICurrentUser currentUser, SchedulingDbService schedulingDb)
{
    public async Task<RosterDto> GetRosterAsync(int locationId, DateOnly date)
    {
        using var db = factory.Create();
        using var multi = await schedulingDb.sp_Scheduling_GetRosterAsync(db, locationId, date);

        var shifts = (await multi.ReadAsync<TherapistShiftDto>()).ToList();
        var rooms = (await multi.ReadAsync<RoomOpeningDto>()).ToList();
        var blockedSlots = (await multi.ReadAsync<BlockedSlotDto>()).ToList();
        return new RosterDto(shifts, rooms, blockedSlots);
    }

    public async Task<int> AssignTherapistShiftAsync(
        int locationId, int therapistId, int roomId, string shiftType, DateOnly date, TimeSpan startTime, TimeSpan endTime)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_AssignTherapistShiftAsync(
            db, locationId, therapistId, roomId, shiftType, date, startTime, endTime, currentUser.RequireUserId());
    }

    public async Task<bool> HasShiftOverlapAsync(int roomId, string shiftType, DateOnly workDate, TimeSpan startTime, TimeSpan endTime, int excludeTherapistId)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_HasShiftOverlapAsync(db, roomId, shiftType, workDate, startTime, endTime, excludeTherapistId);
    }

    public async Task RemoveTherapistShiftAsync(int id)
    {
        using var db = factory.Create();
        await schedulingDb.sp_Scheduling_RemoveTherapistShiftAsync(db, id, currentUser.RequireUserId());
    }

    public async Task UpdateTherapistShiftAsync(int id, TimeSpan startTime, TimeSpan endTime)
    {
        using var db = factory.Create();
        await schedulingDb.sp_Scheduling_UpdateTherapistShiftAsync(db, id, startTime, endTime, currentUser.RequireUserId());
    }

    public async Task<int?> GetShiftLocationIdAsync(int id)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_GetShiftLocationIdAsync(db, id);
    }

    public async Task<ShiftDetailsDto?> GetShiftDetailsAsync(int id)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_GetShiftDetailsAsync(db, id);
    }

    public async Task<bool> HasShiftBookingsAsync(int id)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_HasShiftBookingsAsync(db, id);
    }

    public async Task<int> OpenRoomAsync(int roomId, int treatmentCategoryId, string shiftType, DateOnly date)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_OpenRoomAsync(db, roomId, treatmentCategoryId, shiftType, date, currentUser.RequireUserId());
    }

    public async Task CloseRoomAsync(int id)
    {
        using var db = factory.Create();
        await schedulingDb.sp_Scheduling_CloseRoomAsync(db, id, currentUser.RequireUserId());
    }

    public async Task<int?> GetRoomOpeningLocationIdAsync(int id)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_GetRoomOpeningLocationIdAsync(db, id);
    }

    public async Task<RoomOpeningDetailsDto?> GetRoomOpeningDetailsAsync(int id)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_GetRoomOpeningDetailsAsync(db, id);
    }

    public async Task<RoomOpeningDetailsDto?> GetRoomOpeningByKeysAsync(int roomId, DateOnly workDate, string shiftType)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_GetRoomOpeningByKeysAsync(db, roomId, workDate, shiftType);
    }

    public async Task<bool> HasRoomBookingsAsync(int roomId, DateOnly workDate)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_HasRoomBookingsAsync(db, roomId, workDate);
    }

    public async Task<bool> HasRoomOpeningAsync(int roomId, DateOnly workDate)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_HasRoomOpeningAsync(db, roomId, workDate);
    }

    public async Task<bool> HasBookingOverlapAsync(int roomId, DateOnly workDate, TimeSpan startTime, TimeSpan endTime)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_HasBookingOverlapAsync(db, roomId, workDate, startTime, endTime);
    }

    public async Task<bool> HasBlockOverlapAsync(int roomId, DateOnly workDate, TimeSpan startTime, TimeSpan endTime)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_HasBlockOverlapAsync(db, roomId, workDate, startTime, endTime);
    }

    public async Task<int> BlockSlotAsync(int roomId, DateOnly workDate, TimeSpan startTime, TimeSpan endTime, string reason, int? blockTypeId = null)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_BlockSlotAsync(db, roomId, workDate, startTime, endTime, reason, blockTypeId, currentUser.RequireUserId());
    }

    public async Task UnblockSlotAsync(int id)
    {
        using var db = factory.Create();
        await schedulingDb.sp_Scheduling_UnblockSlotAsync(db, id, currentUser.RequireUserId());
    }

    public async Task UpdateBlockedSlotAsync(int id, TimeSpan startTime, TimeSpan endTime, string reason, int? blockTypeId = null)
    {
        using var db = factory.Create();
        await schedulingDb.sp_Scheduling_UpdateBlockedSlotAsync(db, id, startTime, endTime, reason, blockTypeId, currentUser.RequireUserId());
    }

    public async Task<BlockedSlotDetailsDto?> GetBlockedSlotDetailsAsync(int id)
    {
        using var db = factory.Create();
        return await schedulingDb.sp_Scheduling_GetBlockedSlotDetailsAsync(db, id);
    }
}
