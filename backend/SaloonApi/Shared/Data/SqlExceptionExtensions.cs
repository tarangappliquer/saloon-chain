using Microsoft.Data.SqlClient;

namespace SaloonApi.Shared.Data;

internal static class SqlExceptionExtensions
{
    // sp_*'s THROW 50001..50999 are expected application-level rejections (conflict, not-found,
    // already-registered) — anything else is a real error and should bubble up as a 500.
    public static bool IsApplicationError(this SqlException ex) => ex.Number is >= 50000 and < 51000;
}
