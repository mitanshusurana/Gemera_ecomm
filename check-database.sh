#!/bin/bash
# Database Management Script

echo "=== PostgreSQL Database Management ==="
echo ""

echo "Current volumes:"
docker volume ls | grep postgres
echo ""

echo "Database container status:"
docker-compose -f docker-compose.prod.yml ps postgres
echo ""

echo "Database logs (last 20 lines):"
docker-compose -f docker-compose.prod.yml logs --tail=20 jewelry-postgres
echo ""

echo "Available commands:"
echo "1. Check database size: docker exec jewelry-postgres du -sh /var/lib/postgresql/data"
echo "2. Connect to database: docker exec -it jewelry-postgres psql -U postgres -d jewelry_db"
echo "3. Reset database: ./reset-database.sh"
echo "4. Backup database: docker exec jewelry-postgres pg_dump -U postgres jewelry_db > backup.sql"
echo ""

echo "Volume location on host:"
docker volume inspect gemara-deploy_postgres_data 2>/dev/null | grep -A5 "Mountpoint" || echo "Volume not found or not created yet"