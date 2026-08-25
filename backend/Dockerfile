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
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# Ensure uploads directory exists for TUS resumable uploads / LocalStorageService
RUN mkdir -p /app/uploads

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:5127
EXPOSE 5127

ENTRYPOINT ["dotnet", "SaloonApi.dll"]
