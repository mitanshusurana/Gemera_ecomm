#!/bin/bash
# Quick Reference: Angular SSR Docker Deployment

# Development Build & Test
echo "=== LOCAL TESTING ==="
npm ci                              # Install dependencies
npm run build:prod                  # Production build with SSR
npm run build:validate              # Verify SSR output
npm run serve:ssr:fusion-angular-tailwind-starter  # Test server locally

# Docker Build & Deploy
echo "=== DOCKER DEPLOYMENT ==="
docker-compose build frontend       # Build frontend image
docker-compose up -d                # Start all services

# Verification
echo "=== VERIFY DEPLOYMENT ==="
docker-compose ps                   # Check service status
docker logs jewelry-frontend -f     # View frontend logs
curl http://localhost:4200          # Test endpoint

# Troubleshooting
echo "=== TROUBLESHOOTING ==="
docker logs jewelry-frontend        # View full logs
docker-compose down -v              # Clean up volumes
npm cache clean --force && npm ci   # Reset npm cache
docker system prune -a              # Clean old images

# Production Deployment with GitHub Container Registry
echo "=== GITHUB CONTAINER REGISTRY ==="
# 1. Update image tags in docker-compose.prod.yml
# 2. Push to registry: docker push ghcr.io/YOUR_USERNAME/REPO-frontend:latest
# 3. Update environment variables in production
# 4. Run: docker-compose -f docker-compose.prod.yml up -d

