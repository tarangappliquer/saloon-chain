#!/usr/bin/env bash
set -e

echo "Waiting for SQL Server to be ready..."
until /opt/mssql-tools18/bin/sqlcmd -S saloonchains-sqlserver -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "SELECT 1" > /dev/null 2>&1; do
    echo "SQL Server is starting up..."
    sleep 2
done

echo "SQL Server is ready! Running database setup scripts..."

/opt/mssql-tools18/bin/sqlcmd -S saloonchains-sqlserver -U sa -P "$MSSQL_SA_PASSWORD" -C -i /db/01_tables.sql
/opt/mssql-tools18/bin/sqlcmd -S saloonchains-sqlserver -U sa -P "$MSSQL_SA_PASSWORD" -C -i /db/02_types.sql
/opt/mssql-tools18/bin/sqlcmd -S saloonchains-sqlserver -U sa -P "$MSSQL_SA_PASSWORD" -C -i /db/03_procs.sql
/opt/mssql-tools18/bin/sqlcmd -S saloonchains-sqlserver -U sa -P "$MSSQL_SA_PASSWORD" -C -i /db/seed/04_seed.sql
/opt/mssql-tools18/bin/sqlcmd -S saloonchains-sqlserver -U sa -P "$MSSQL_SA_PASSWORD" -C -i /db/seed/05_seed_bulk.sql

echo "Database setup completed successfully!"
