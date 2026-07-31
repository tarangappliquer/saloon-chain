using Microsoft.Data.SqlClient;

namespace SaloonApi.Shared.Data;

internal sealed class SqlConnectionFactory(IConfiguration configuration)
{
    private readonly string _connectionString = configuration.GetConnectionString("SaloonDb")
        ?? throw new InvalidOperationException("Missing ConnectionStrings:SaloonDb");

    public SqlConnection Create() => new(_connectionString);
}
