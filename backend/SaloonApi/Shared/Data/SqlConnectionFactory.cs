using Npgsql;

namespace SaloonApi.Shared.Data;

internal sealed class SqlConnectionFactory
{
    private readonly string _connectionString;

    public SqlConnectionFactory(IConfiguration configuration)
    {
        var raw = configuration.GetConnectionString("SaloonDb")
            ?? throw new InvalidOperationException("Missing ConnectionStrings:SaloonDb");

        // ponytail: cap the connect timeout. A slow/failing DB open (or its synchronous
        // getaddrinfo) otherwise parks a ThreadPool thread for the full timeout -- default 15s --
        // and request load plus the periodic sweeps can park threads faster than the pool grows.
        // 10s is still generous for TCP + auth; anything slower is a real outage the sweeps' retry
        // loop handles. Prefer using an IP host in the connection string to skip DNS entirely.
        var b = new NpgsqlConnectionStringBuilder(raw);
        if (b.Timeout > 10)
            b.Timeout = 10;
        _connectionString = b.ConnectionString;
    }

    public NpgsqlConnection Create() => new(_connectionString);
}
