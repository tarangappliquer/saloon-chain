using System.Data;
using System.Diagnostics.CodeAnalysis;
using Dapper;

namespace SaloonApi.Shared.Data.DbServices;

// Durable email outbox (public.EmailOutbox). Enqueue on the request/business path via
// EmailOutboxQueue; claim + send from EmailQueueBackgroundService. See db/postgres/03_procs_postgres.sql.
[SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Registered as Singleton service in DI container")]
[SuppressMessage("CodeSmell", "S2325:Methods that don't access instance data should be static", Justification = "Registered as Singleton service in DI container")]
internal sealed class EmailOutboxDbService
{
    public Task<long> sp_EmailOutbox_EnqueueAsync(IDbConnection db, string payloadJson, string subject)
    {
        var args = new DynamicParameters();
        args.Add("Payload", payloadJson, DbType.String);
        args.Add("Subject", subject, DbType.String);
        // @Payload::jsonb -- Npgsql binds the string param, Postgres casts it to jsonb.
        return db.ExecuteScalarAsync<long>(
            "SELECT public.sp_EmailOutbox_Enqueue(@Payload::jsonb, @Subject)", args, commandType: CommandType.Text);
    }

    public Task<IEnumerable<EmailOutboxClaimRow>> fn_EmailOutbox_ClaimAsync(IDbConnection db, int batchSize, int visibilitySeconds)
    {
        var args = new DynamicParameters();
        args.Add("BatchSize", batchSize, DbType.Int32);
        args.Add("VisibilitySeconds", visibilitySeconds, DbType.Int32);
        return db.QueryAsync<EmailOutboxClaimRow>(
            "SELECT * FROM public.fn_EmailOutbox_Claim(@BatchSize, @VisibilitySeconds)", args, commandType: CommandType.Text);
    }

    public async Task sp_EmailOutbox_MarkSentAsync(IDbConnection db, long id)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int64);
        await db.ExecuteAsync("SELECT public.sp_EmailOutbox_MarkSent(@Id)", args, commandType: CommandType.Text);
    }

    public async Task sp_EmailOutbox_MarkFailedAsync(IDbConnection db, long id, string error, int maxAttempts, int backoffBaseSeconds)
    {
        var args = new DynamicParameters();
        args.Add("Id", id, DbType.Int64);
        args.Add("Error", error, DbType.String);
        args.Add("MaxAttempts", maxAttempts, DbType.Int32);
        args.Add("BackoffBaseSeconds", backoffBaseSeconds, DbType.Int32);
        await db.ExecuteAsync(
            "SELECT public.sp_EmailOutbox_MarkFailed(@Id, @Error, @MaxAttempts, @BackoffBaseSeconds)", args, commandType: CommandType.Text);
    }
}

internal sealed record EmailOutboxClaimRow
{
    public long Id { get; init; }
    public string Payload { get; init; } = "";
}
