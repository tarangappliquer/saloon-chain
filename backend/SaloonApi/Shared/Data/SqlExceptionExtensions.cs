using Npgsql;

namespace SaloonApi.Shared.Data;

internal static class SqlExceptionExtensions
{
    // sp_*'s RAISE EXCEPTION ... USING ERRCODE = '50001'..'50999' (see the "conventions" comment
    // atop db/postgres/03_procs_postgres.sql: THROW's original T-SQL error number is preserved
    // verbatim as the SQLSTATE, e.g. '50004', '50030') are expected application-level rejections
    // (conflict, not-found, business-rule violation) — anything else is a real error and should
    // bubble up as a 500. 'P0001' is Postgres's own default SQLSTATE for a bare `RAISE EXCEPTION
    // 'message';` with no explicit ERRCODE. This previously checked for a 'P5xxx' prefix, which
    // doesn't match any SQLSTATE this codebase actually raises (plain '50xxx', never 'P'-prefixed)
    // — every application-level rejection was falling through to an unhandled 500 instead of 409.
    public static bool IsApplicationError(this PostgresException ex) =>
        ex.SqlState == "P0001" || (ex.SqlState.Length == 5 && ex.SqlState.StartsWith("50", StringComparison.Ordinal));
}
