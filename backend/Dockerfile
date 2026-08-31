# Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy solution props and project files for layer caching
COPY Directory.Build.props Directory.Packages.props ./
COPY SaloonApi/SaloonApi.csproj SaloonApi/

RUN dotnet restore SaloonApi/SaloonApi.csproj

# Copy remaining backend source code
COPY SaloonApi/ SaloonApi/

WORKDIR /src/SaloonApi
RUN dotnet publish SaloonApi.csproj -c Release -o /app/publish /p:UseAppHost=false

# Stage 2: Runtime
# NOTE: keep the full Debian base. The -noble-chiseled-extra variant (~26MB smaller) was tried
# and reverted: it ships no /etc/nsswitch.conf, and under concurrent load glibc name resolution
# started returning EAGAIN for the Postgres host, hanging the API. Revisit only with a load test
# and an explicit nsswitch.conf.
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# Install GSSAPI Kerberos library required by Npgsql
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*

# Ensure uploads directory exists for TUS resumable uploads / LocalStorageService
RUN mkdir -p /app/uploads

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:5127
EXPOSE 5127

ENTRYPOINT ["dotnet", "SaloonApi.dll"]
