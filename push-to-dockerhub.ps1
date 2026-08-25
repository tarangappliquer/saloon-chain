# =========================================================================
# BUILD AND PUSH ALL SALOON CHAINS CONTAINERS TO DOCKER HUB
# =========================================================================

Write-Host "Building Docker images for SaloonChains..." -ForegroundColor Cyan
docker compose build

Write-Host "Pushing Docker images to Docker Hub..." -ForegroundColor Green
docker compose push

Write-Host "All images successfully pushed to Docker Hub! Server Watchtower will fetch update within 60 seconds." -ForegroundColor Yellow
