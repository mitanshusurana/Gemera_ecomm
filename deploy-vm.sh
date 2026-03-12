#!/bin/bash
set -e

echo "========================================="
echo "  Caratloop / Gemara VM Setup Script   "
echo "========================================="

# 1. Configure Swap Space (Virtual RAM)
echo "[1/4] Configuring 4GB Swap Space..."
if grep -q "swapfile" /etc/fstab; then
    echo "Swap is already configured. Skipping."
else
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    # Make it permanent
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    # Adjust swappiness to prefer physical RAM
    sudo sysctl vm.swappiness=10
    echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
    echo "Swap space configured successfully."
fi

# 2. Install Docker and Docker Compose
echo "[2/4] Installing Docker and Docker Compose..."
if ! command -v docker &> /dev/null; then
    # Oracle Linux uses dnf and is compatible with CentOS packages
    sudo dnf install -y dnf-utils zip unzip
    sudo dnf config-manager --add-repo=https://download.docker.com/linux/centos/docker-ce.repo
    sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    # Enable docker service
    sudo systemctl enable docker
    sudo systemctl start docker

    # Add current user to docker group
    sudo usermod -aG docker $USER
    echo "Docker installed successfully."
else
    echo "Docker is already installed. Skipping."
fi

# Install standalone docker-compose if needed
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    sudo ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose || true
fi

# 3. Create Deployment Directory
echo "[3/4] Setting up deployment directory..."
mkdir -p ~/gemara-deploy
cd ~/gemara-deploy

# Create docker-compose.prod.yml
cat << 'COMPOSE_EOF' > docker-compose.prod.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: jewelry-postgres
    restart: always
    environment:
      POSTGRES_DB: jewelry_db
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    image: ghcr.io/mitanshusurana/gemera_ecomm-backend:latest
    container_name: jewelry-backend
    restart: always
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/jewelry_db
      SPRING_DATASOURCE_USERNAME: ${POSTGRES_USER:-postgres}
      SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD:-password}
      SPRING_DATASOURCE_DRIVER_CLASS_NAME: org.postgresql.Driver
      SPRING_JPA_PROPERTIES_HIBERNATE_DIALECT: org.hibernate.dialect.PostgreSQLDialect
      SPRING_JPA_HIBERNATE_DDL_AUTO: update
      R2_ACCESS_KEY: ${R2_ACCESS_KEY:-default-key}
      R2_SECRET_KEY: ${R2_SECRET_KEY:-default-secret}
      R2_ENDPOINT: ${R2_ENDPOINT:-https://default.r2.cloudflarestorage.com}
      R2_BUCKET_NAME: ${R2_BUCKET_NAME:-jewelry-assets}
      R2_PUBLIC_URL: ${R2_PUBLIC_URL:-https://pub-default.r2.dev}
      ADMIN_EMAIL: ${ADMIN_EMAIL:-admin@gemara.com}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-admin123}
      JWT_SECRET: ${JWT_SECRET:-404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970}
    ports:
      - "8080:8080"
    depends_on:
      - postgres

  frontend:
    image: ghcr.io/mitanshusurana/gemera_ecomm-frontend:latest
    container_name: jewelry-frontend
    restart: always
    environment:
      API_URL: ${FRONTEND_API_URL:-http://localhost:8080/api/v1}
      RAZORPAY_KEY: ${RAZORPAY_KEY:-rzp_test_S5goGHXLEuP6hP}
      WHATSAPP_NUMBER: ${WHATSAPP_NUMBER:-917976091951}
      COMPANY_ADDRESS: ${COMPANY_ADDRESS:-S149 mahaveer nagar jaipur}
      COMPANY_PHONE: ${COMPANY_PHONE:-+91 7976091951}
      COMPANY_EMAIL: ${COMPANY_EMAIL:-support@caratloop.com}
      COMPANY_INSTAGRAM: ${COMPANY_INSTAGRAM:-https://instagram.com/caratloop}
      COMPANY_FACEBOOK: ${COMPANY_FACEBOOK:-https://facebook.com/caratloop}
    ports:
      - "80:80"
    depends_on:
      - backend

  admin:
    image: ghcr.io/mitanshusurana/gemera_ecomm-admin:latest
    container_name: jewelry-admin
    restart: always
    environment:
      API_URL: ${ADMIN_API_URL:-http://localhost:8080/api/v1}
    ports:
      - "4300:80"
    depends_on:
      - backend

volumes:
  postgres_data:
COMPOSE_EOF

# Create .env template
cat << 'ENV_EOF' > .env.template
# ==========================================
# Gemara Environment Configuration
# ==========================================

# 1. Database Configuration
POSTGRES_USER=my_secure_db_user
POSTGRES_PASSWORD=my_super_secure_db_password

# 2. Storage Configuration (Cloudflare R2)
R2_ACCESS_KEY=your_r2_access_key
R2_SECRET_KEY=your_r2_secret_key
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_BUCKET_NAME=your_r2_bucket_name
R2_PUBLIC_URL=https://your-public-r2-url.r2.dev

# 3. Application Security & Admin Setup
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your_secure_admin_password
# Use a randomly generated string (e.g., openssl rand -hex 32)
JWT_SECRET=super_secret_long_random_string_here_1234567890

# 4. Networking / API Routing
# Using the provided public IP address
FRONTEND_API_URL=http://129.159.18.63:8080/api/v1
ADMIN_API_URL=http://129.159.18.63:8080/api/v1

# 5. Third Party Integrations
RAZORPAY_KEY=your_razorpay_key_here
WHATSAPP_NUMBER=919876543210

# 6. Company Contact Info
COMPANY_ADDRESS="S149 mahaveer nagar jaipur"
COMPANY_PHONE="+91 7976091951"
COMPANY_EMAIL="support@caratloop.com"
COMPANY_INSTAGRAM="https://instagram.com/caratloop"
COMPANY_FACEBOOK="https://facebook.com/caratloop"
ENV_EOF

# 4. Final Instructions
echo "[4/4] Setup almost complete!"
echo "========================================="
echo "To finish deployment, perform the following steps:"
echo "1. Run: newgrp docker (or logout and login again to apply Docker permissions)"
echo "2. Run: cd ~/gemara-deploy"
echo "3. Run: cp .env.template .env"
echo "4. Run: nano .env (Fill in your actual API keys, passwords, and VM IP address)"
echo "5. Start the application by running: docker-compose -f docker-compose.prod.yml up -d"
echo "========================================="
