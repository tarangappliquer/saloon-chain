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

# Stage uploads dir here — chiseled runtime has no shell for a RUN mkdir
RUN mkdir -p /app/publish/uploads

# Stage 2: Runtime
# chiseled-extra: no shell/apt, but ships full ICU + libgssapi-krb5 (needed by Npgsql)
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled-extra AS final
WORKDIR /app

# ponytail: run as root so bind-mounted ./uploads + ./Logs (host-owned) stay writable,
# matching the prior debian base. For non-root, chown host dirs to 1654:1654 and drop this.
USER root

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:5127
EXPOSE 5127

ENTRYPOINT ["dotnet", "SaloonApi.dll"]
