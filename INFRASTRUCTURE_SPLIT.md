# Infrastructure Split Deployment Guide

To resolve memory bottlenecks caused by running all applications on a single VM, the deployment has been split into three separate logical units which can be run on separate VMs.

## 1. Backend & Database VM

This server hosts the Spring Boot API and PostgreSQL database.

**Deployment Command:**
```bash
docker-compose -f docker-compose.backend.yml up -d --build
```

**Required Environment Variables:**
- `POSTGRES_DB`: Name of the postgres DB (default: `jewelry_db`)
- `POSTGRES_USER`: Database user (default: `postgres`)
- `POSTGRES_PASSWORD`: Database password
- `R2_ACCESS_KEY`: Cloudflare R2 Access Key
- `R2_SECRET_KEY`: Cloudflare R2 Secret Key
- `R2_ENDPOINT`: Cloudflare R2 Endpoint URL
- `R2_BUCKET_NAME`: Bucket Name
- `R2_PUBLIC_URL`: R2 Public Access URL

## 2. Frontend Application VM

This server hosts the Angular Customer-Facing App using Angular SSR (Node).

**Deployment Command:**
```bash
docker-compose -f docker-compose.frontend.yml up -d --build
```

**Required Environment Variables:**
- `API_URL`: The fully qualified public URL or internal network IP to access the Backend API (e.g., `http://<backend-vm-ip>:8080/api/v1` or `https://api.yourdomain.com/api/v1`).
- `RAZORPAY_KEY`: Payment gateway key.
- `NG_ALLOWED_HOSTS`: Domains allowed to make requests without triggering SSR errors (e.g. `localhost,127.0.0.1,<your-domain.com>,<frontend-vm-ip>`).

## 3. Admin Application VM

This server hosts the Angular Admin Dashboard via NGINX.

**Deployment Command:**
```bash
docker-compose -f docker-compose.admin.yml up -d --build
```

**Required Environment Variables:**
- `API_URL`: The fully qualified public URL or internal network IP to access the Backend API (e.g., `http://<backend-vm-ip>:8080/api/v1` or `https://api.yourdomain.com/api/v1`).

---

**Note on `.env` files:**
You can create a `.env` file in the same directory as the deployment files on each respective VM to load these configurations automatically.