-- 003_roster_blocks_blocktype.sql
-- fn_Scheduling_RosterBlocks didn't return BlockTypeId, so the calendar's "edit blocked slot"
-- modal could never pre-select the block's type (EditBlockSlotModal read a field that was always
-- undefined). Add BlockTypeId to the roster blocked-slots result (NULL for the synthetic lunch
-- break rows).
SET search_path TO public;

-- CREATE OR REPLACE can't widen a RETURNS TABLE column list (PG 42P13) -- drop first.
DROP FUNCTION IF EXISTS public.fn_Scheduling_RosterBlocks(int, date);

CREATE OR REPLACE FUNCTION public.fn_Scheduling_RosterBlocks(p_LocationId int, p_WorkDate date)
RETURNS TABLE(Id int, RoomId int, RoomName varchar, StartTime time, EndTime time, Reason varchar, IsLocationBreak boolean, BlockTypeId int)
LANGUAGE sql STABLE AS $$
    SELECT bs.Id, bs.RoomId, r.Name AS RoomName, bs.StartTime, bs.EndTime, bs.Reason, FALSE AS IsLocationBreak, bs.BlockTypeId
    FROM public.BlockedSlots bs
        JOIN public.Rooms r ON r.Id = bs.RoomId
    WHERE r.LocationId = p_LocationId AND bs.WorkDate = p_WorkDate AND bs.IsDelete = FALSE

    UNION ALL

    SELECT
        0 AS Id,
        r.Id AS RoomId,
        r.Name AS RoomName,
        COALESCE(l.BreakStartTime, c.BreakStartTime) AS StartTime,
        COALESCE(l.BreakEndTime, c.BreakEndTime) AS EndTime,
        'Lunch Break' AS Reason,
        TRUE AS IsLocationBreak,
        NULL::int AS BlockTypeId
    FROM public.Locations l
        JOIN public.SaloonChains c ON c.Id = l.ChainId
        CROSS JOIN public.Rooms r
    WHERE l.Id = p_LocationId
        AND r.LocationId = l.Id
        AND r.IsDelete = FALSE AND r.IsActive = TRUE
        AND COALESCE(l.BreakStartTime, c.BreakStartTime) IS NOT NULL
        AND COALESCE(l.BreakEndTime, c.BreakEndTime) IS NOT NULL

    ORDER BY RoomName, StartTime;
$$;
