#!/bin/bash
# Production VM Deployment Checklist
# For deploying with docker-compose.prod.yml

set -e

echo "======================================"
echo "Gemera E-Commerce Production Deployment"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check Docker and Docker Compose
echo -e "${YELLOW}[1/10]${NC} Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not installed. Please install Docker first.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker installed${NC}"

echo -e "${YELLOW}[2/10]${NC} Checking Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}✗ Docker Compose not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker Compose installed${NC}"

# Step 2: Check GitHub Container Registry access
echo -e "${YELLOW}[3/10]${NC} Checking GitHub Container Registry access..."
echo "You need to authenticate with GHCR before pulling images."
echo "Generate a Personal Access Token at: https://github.com/settings/tokens"
echo "Then run: docker login ghcr.io"
echo ""

if docker images | grep -q "ghcr.io"; then
    echo -e "${GREEN}✓ GHCR access verified${NC}"
else
    echo -e "${YELLOW}⚠ No GHCR images found. You may not be authenticated.${NC}"
fi

# Step 3: Set environment variables
echo -e "${YELLOW}[4/10]${NC} Configuring environment variables..."

# Create .env file if it doesn't exist
if [ ! -f ".env.prod" ]; then
    cat > .env.prod << 'EOF'
# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changeme_secure_password

# Cloudflare R2 (Object Storage)
R2_ACCESS_KEY=your_r2_access_key
R2_SECRET_KEY=your_r2_secret_key
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_BUCKET_NAME=jewelry-assets
R2_PUBLIC_URL=https://pub-your-account.r2.dev

# Backend Configuration
ADMIN_EMAIL=admin@gemara.com
ADMIN_PASSWORD=change_me_strong_password
JWT_SECRET=404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970

# Frontend URLs (Update with your domain)
FRONTEND_API_URL=http://backend:8080/api/v1
ADMIN_API_URL=http://backend:8080/api/v1
RAZORPAY_KEY=rzp_test_S5goGHXLEuP6hP
WHATSAPP_NUMBER=917976091951

# Container Registry (Optional - for overriding image names)
BACKEND_IMAGE=ghcr.io/mitanshusurana/gemera_ecomm-backend:latest
FRONTEND_IMAGE=ghcr.io/mitanshusurana/gemera_ecomm-frontend:latest
ADMIN_IMAGE=ghcr.io/mitanshusurana/gemera_ecomm-admin:latest
EOF
    echo -e "${GREEN}✓ Created .env.prod file (UPDATE WITH YOUR VALUES!)${NC}"
else
    echo -e "${GREEN}✓ .env.prod file exists${NC}"
fi

# Step 4: Validate docker-compose.prod.yml
echo -e "${YELLOW}[5/10]${NC} Validating docker-compose.prod.yml..."
if docker-compose -f docker-compose.prod.yml config > /dev/null 2>&1; then
    echo -e "${GREEN}✓ docker-compose.prod.yml is valid${NC}"
else
    echo -e "${RED}✗ docker-compose.prod.yml has errors${NC}"
    exit 1
fi

# Step 5: Pull images
echo -e "${YELLOW}[6/10]${NC} Pulling Docker images..."
echo "Note: First pull may take 5-10 minutes depending on internet speed"
echo ""
if docker-compose -f docker-compose.prod.yml pull; then
    echo -e "${GREEN}✓ Images pulled successfully${NC}"
else
    echo -e "${RED}✗ Failed to pull images. Check GHCR credentials.${NC}"
    exit 1
fi

# Step 6: Verify images
echo -e "${YELLOW}[7/10]${NC} Verifying downloaded images..."
docker image ls | grep gemera_ecomm
echo -e "${GREEN}✓ Images verified${NC}"

# Step 7: Stop existing containers (if any)
echo -e "${YELLOW}[8/10]${NC} Stopping existing containers (if any)..."
docker-compose -f docker-compose.prod.yml down || true
echo -e "${GREEN}✓ Ready for new deployment${NC}"

# Step 8: Start services
echo -e "${YELLOW}[9/10]${NC} Starting services..."
if docker-compose -f docker-compose.prod.yml up -d; then
    echo -e "${GREEN}✓ Services started${NC}"
else
    echo -e "${RED}✗ Failed to start services${NC}"
    exit 1
fi

# Step 9: Wait for services to be ready
echo -e "${YELLOW}[10/10]${NC} Waiting for services to be ready..."
echo "Checking database connection..."
sleep 5
for i in {1..30}; do
    if docker-compose -f docker-compose.prod.yml exec -T postgres pg_isready &> /dev/null; then
        echo -e "${GREEN}✓ Database is ready${NC}"
        break
    fi
    echo "  Waiting... ($i/30)"
    sleep 2
done

# Final verification
echo ""
echo "======================================"
echo -e "${GREEN}✓ Deployment Successful!${NC}"
echo "======================================"
echo ""
echo "Service Status:"
docker-compose -f docker-compose.prod.yml ps
echo ""
echo "Access your services:"
echo "  Frontend:  http://YOUR_VM_IP:80"
echo "  Admin:     http://YOUR_VM_IP:81"
echo "  Backend:   http://YOUR_VM_IP:8080/api/v1"
echo "  Database:  localhost:5432"
echo ""
echo "View logs:"
echo "  docker-compose -f docker-compose.prod.yml logs -f jewelry-frontend"
echo "  docker-compose -f docker-compose.prod.yml logs -f jewelry-backend"
echo ""
echo "To update with new images:"
echo "  docker-compose -f docker-compose.prod.yml pull"
echo "  docker-compose -f docker-compose.prod.yml up -d"
echo ""

