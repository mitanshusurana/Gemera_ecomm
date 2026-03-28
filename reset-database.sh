#!/bin/bash
# Database Reset Script for Development/Testing
# Use with caution - this will DELETE all database data!

set -e

echo "⚠️  WARNING: This will DELETE all database data!"
echo "Database volume: postgres_data"
echo ""
read -p "Are you sure you want to reset the database? (type 'yes' to confirm): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Database reset cancelled."
    exit 1
fi

echo "🗑️  Stopping containers..."
docker-compose -f docker-compose.prod.yml down

echo "🗑️  Removing database volume..."
docker volume rm gemara-deploy_postgres_data 2>/dev/null || true

echo "🚀 Starting fresh containers..."
docker-compose -f docker-compose.prod.yml up -d

echo "⏳ Waiting for database to initialize..."
sleep 10

echo "✅ Database reset complete!"
echo "📊 Check logs: docker-compose -f docker-compose.prod.yml logs jewelry-postgres"