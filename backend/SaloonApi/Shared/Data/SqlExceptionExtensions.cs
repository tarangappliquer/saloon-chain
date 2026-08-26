using Npgsql;

namespace SaloonApi.Shared.Data;

internal static class SqlExceptionExtensions
{
    // sp_*'s RAISE EXCEPTION with SQLSTATE 'P5000'..'P5999' or 'P0001' are expected application-level rejections
    // (conflict, not-found, already-registered) — anything else is a real error and should bubble up as a 500.
    public static bool IsApplicationError(this PostgresException ex) =>
        ex.SqlState == "P5000" || ex.SqlState == "P0001" || (ex.SqlState != null && ex.SqlState.StartsWith("P5", StringComparison.Ordinal));
}
