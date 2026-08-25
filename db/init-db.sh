#!/usr/bin/env bash
set -e

SQL_TARGET="${SQL_HOST:-127.0.0.1}"
DB_NAME="${DB_NAME:-SaloonChainDb}"
SA_PASS="${MSSQL_SA_PASSWORD:-SaloonChains_Dev123!}"

echo "=== [init-db.sh] Starting DB Init Setup ==="
echo "Target: $SQL_TARGET | Database: $DB_NAME"

echo "[init-db.sh] Waiting for SQL Server ($SQL_TARGET) to accept connections..."
until /opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$SA_PASS" -C -Q "SELECT 1" > /dev/null 2>&1; do
    echo "[init-db.sh] Waiting for SQL Server..."
    sleep 2
done

echo "[init-db.sh] SQL Server is ready. Waiting for database recovery to complete..."
sleep 5

/opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$SA_PASS" -C -Q "SELECT name, state_desc FROM sys.databases;"

echo "[init-db.sh] Ensuring database '$DB_NAME' exists..."
LEGACY_EXISTS=$(/opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$SA_PASS" -C -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.databases WHERE name = N'SaloonChainDb'" 2>/dev/null | tr -d '[:space:]')
if [ "$LEGACY_EXISTS" = "1" ]; then
    echo "[init-db.sh] Renaming legacy SaloonChainDb to $DB_NAME..."
    /opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$SA_PASS" -C -Q "ALTER DATABASE [SaloonChainDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; ALTER DATABASE [SaloonChainDb] MODIFY NAME = [$DB_NAME]; ALTER DATABASE [$DB_NAME] SET MULTI_USER;" 2>/dev/null || true
fi

/opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$SA_PASS" -C -Q "IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = N'$DB_NAME') EXEC('CREATE DATABASE [$DB_NAME]');"

echo "[init-db.sh] Verifying database '$DB_NAME' status..."
/opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$SA_PASS" -C -Q "SELECT name, state_desc FROM sys.databases WHERE name = N'$DB_NAME';"

HAS_TABLES=$(/opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$SA_PASS" -d "$DB_NAME" -C -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.tables WHERE name = 'SaloonChains'" 2>/dev/null || echo "0")
HAS_TABLES=$(echo "$HAS_TABLES" | tr -d '[:space:]')

echo "[init-db.sh] Table count check for SaloonChains: '$HAS_TABLES'"

if [ "$HAS_TABLES" = "0" ]; then
    echo "[init-db.sh] Running database setup scripts on $DB_NAME..."
    /opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$SA_PASS" -d "$DB_NAME" -C -b -I -i /db/01_tables.sql
    /opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$SA_PASS" -d "$DB_NAME" -C -b -I -i /db/02_types.sql
    /opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$SA_PASS" -d "$DB_NAME" -C -b -I -i /db/03_procs.sql
    echo "[init-db.sh] Database setup completed successfully!"
else
    echo "[init-db.sh] Database $DB_NAME already initialized. Skipping schema creation."
fi
