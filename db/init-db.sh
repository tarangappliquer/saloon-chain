#!/usr/bin/env bash
set -e

SQL_TARGET="${SQL_HOST:-127.0.0.1}"
DB_NAME="${DB_NAME:-SaloonChainsDb}"

echo "Waiting for SQL Server ($SQL_TARGET) to be ready..."
until /opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "SELECT 1" > /dev/null 2>&1; do
    echo "SQL Server is starting up..."
    sleep 2
done

echo "SQL Server is up. Checking if database '$DB_NAME' exists..."

# Force create database if it doesn't exist
/opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = N'$DB_NAME')
BEGIN
    CREATE DATABASE [$DB_NAME];
    PRINT '$DB_NAME created successfully.';
END
"

echo "Running database setup scripts on $DB_NAME..."

/opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$MSSQL_SA_PASSWORD" -d "$DB_NAME" -C -b -I -i /db/01_tables.sql
/opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$MSSQL_SA_PASSWORD" -d "$DB_NAME" -C -b -I -i /db/02_types.sql
/opt/mssql-tools18/bin/sqlcmd -S "$SQL_TARGET" -U sa -P "$MSSQL_SA_PASSWORD" -d "$DB_NAME" -C -b -I -i /db/03_procs.sql

echo "Database setup completed successfully!"
