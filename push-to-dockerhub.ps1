# =========================================================================
# BUILD AND PUSH ALL SALOON CHAINS CONTAINERS TO DOCKER HUB
# =========================================================================

$ErrorActionPreference = "Stop"

# ponytail: pnpm api hardcodes port 5127; CLAUDE.md mandates a non-default
# port for generation, so call the generator directly against 5199.
$port = 5199
$openapiUrl = "http://localhost:$port/openapi/v1.json"

function Clear-Port {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

function Stop-Backend {
    Write-Host "Stopping backend and releasing port $port..." -ForegroundColor Cyan
    if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue }
    Clear-Port
}

Write-Host "Freeing port $port if in use..." -ForegroundColor Cyan
Clear-Port

Write-Host "Starting backend on port $port for API client generation..." -ForegroundColor Cyan
$api = Start-Process dotnet `
    -ArgumentList "run", "--project", "backend/SaloonApi/SaloonApi.csproj", "--urls", "http://localhost:$port" `
    -PassThru -NoNewWindow

try {
    Write-Host "Waiting for OpenAPI spec at $openapiUrl ..." -ForegroundColor Cyan
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        try {
            Invoke-WebRequest -Uri $openapiUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
            $ready = $true; break
        } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $ready) { throw "Backend did not expose $openapiUrl in time" }

    Write-Host "Generating API client (pnpm api) ..." -ForegroundColor Cyan
    Push-Location frontend
    try {
        pnpm exec openapi-generator-cli generate -i $openapiUrl -g typescript-axios -o ./packages/api-client/src
        if ($LASTEXITCODE -ne 0) { throw "openapi-generator-cli failed" }
    } finally {
        Pop-Location
    }
}
finally {
    Stop-Backend
}

Write-Host "Building Docker images for SaloonChains..." -ForegroundColor Cyan
docker compose build

Write-Host "Pushing Docker images to Docker Hub..." -ForegroundColor Green
docker compose push

Write-Host "All images successfully pushed to Docker Hub! Server Watchtower will fetch update within 60 seconds." -ForegroundColor Yellow
