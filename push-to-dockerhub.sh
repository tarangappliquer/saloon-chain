#!/usr/bin/env bash
set -e

# ponytail: pnpm api hardcodes port 5127; CLAUDE.md mandates a non-default
# port for generation, so call the generator directly against 5199.
PORT=5199
OPENAPI_URL="http://localhost:${PORT}/openapi/v1.json"

free_port() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti "tcp:${PORT}" | xargs -r kill -9 2>/dev/null || true
    fi
}

echo "Freeing port ${PORT} if in use..."
free_port

echo "Starting backend on port ${PORT} for API client generation..."
dotnet run --project backend/SaloonApi/SaloonApi.csproj --urls "http://localhost:${PORT}" &
API_PID=$!

cleanup() {
    echo "Stopping backend and releasing port ${PORT}..."
    kill "${API_PID}" 2>/dev/null || true
    free_port
}
trap cleanup EXIT

echo "Waiting for OpenAPI spec at ${OPENAPI_URL} ..."
for _ in $(seq 1 60); do
    curl -sf "${OPENAPI_URL}" -o /dev/null && break
    sleep 2
done
curl -sf "${OPENAPI_URL}" -o /dev/null || { echo "Backend did not expose ${OPENAPI_URL} in time"; exit 1; }

echo "Generating API client (pnpm api) ..."
( cd frontend && pnpm exec openapi-generator-cli generate -i "${OPENAPI_URL}" -g typescript-axios -o ./packages/api-client/src )

cleanup
trap - EXIT

echo "Building Docker images for SaloonChains..."
docker compose build

echo "Pushing Docker images to Docker Hub..."
docker compose push

echo "All images successfully pushed to Docker Hub! Server Watchtower will fetch update within 60 seconds."
