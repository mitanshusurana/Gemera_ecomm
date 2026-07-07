# Gemera Deployment & Workflow Guide

This guide details the final architecture topology and the exact workflow for running your operations securely and cost-effectively.

## 1. Architecture Topology

### VM 1: The Storefront (Public)
- **Runs:** Angular Frontend (SSR)
- **Ports Exposed:** 80 (HTTP), 443 (HTTPS)
- **Purpose:** Serve fast, SEO-optimized pages to the public.

### VM 2: The Core (Protected)
- **Runs:** Spring Boot Backend & PostgreSQL Database
- **Ports Exposed:** 80/443 (for the API). Port 5432 (DB) remains **closed** to the internet.
- **Purpose:** Securely handle business logic and store data.

### Local Machine: Admin Operations
- **Runs:** Angular Admin App & Python 3D Generation Service.
- **Purpose:** Securely manage the store and perform heavy compute tasks (3D conversion) for free locally.

---

## 2. Secure Local Database Access (SSH Tunneling)

Since we are keeping port 5432 closed on VM 2 for security, you will use an SSH Tunnel to connect your local Admin App and database tools (like pgAdmin or DBeaver) to the remote database.

### The Command
Run this command in your local terminal whenever you need to connect to the database:
```bash
# Replace 'user' and 'vm2-ip' with your actual VM 2 credentials
ssh -N -L 5432:localhost:5432 user@vm2-ip
```
- `-N`: Do not execute a remote command (just forward ports).
- `-L 5432:localhost:5432`: Forward your local port 5432 to the VM's `localhost:5432`.

### Connecting your Tools
Once the tunnel is running, configure your Admin App environment variables or DB tools to connect to:
- **Host:** `localhost`
- **Port:** `5432`
- **Username/Password:** (Your VM 2 PostgreSQL credentials)

Your local computer will think the database is running locally, but the traffic is securely piped to the VM!

---

## 3. Daily Workflow

When you sit down to add products and generate 3D models, here is your flow:

1. **Start the SSH Tunnel** (if you need direct DB access for tools).
2. **Start the Local Services (Admin + 3D Generation):**
   Open a terminal in your project directory and run:
   ```bash
   docker-compose -f docker-compose.local.yml up -d
   ```
3. **Operate:** Use your local Admin UI (at `http://localhost:4300`). When you upload a video, it will use your local CPU to generate the `.glb` file via the local 3D service container, and then push that `.glb` to the remote backend!
