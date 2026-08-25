#!/usr/bin/env bash
set -e

echo "Building Docker images for SaloonChains..."
docker compose build

echo "Pushing Docker images to Docker Hub..."
docker compose push

echo "All images successfully pushed to Docker Hub! Server Watchtower will fetch update within 60 seconds."
