# Deployment Guide (Oracle Free Tier VM)

This guide walks you through the process of deploying the Gemara/Caratloop application on a new virtual machine using the pre-built Docker images from GitHub Container Registry (GHCR).

## Prerequisites

- A fresh Virtual Machine (e.g., Ubuntu 22.04 LTS) with SSH access.
- Ports 80 (Frontend), 4300 (Admin), and 8080 (Backend API) should be allowed through your cloud provider's firewall/security groups.

## Step 1: Transfer and Run the Setup Script

The `deploy-vm.sh` script automates the initial setup. It configures 4GB of Virtual RAM (Swap), installs Docker & Docker Compose, and sets up your deployment directory with necessary templates.

1.  Connect to your VM via SSH.
2.  Copy the `deploy-vm.sh` file to the VM, or create it directly by pasting its contents.
3.  Make the script executable:
    ```bash
    chmod +x deploy-vm.sh
    ```
4.  Run the script:
    ```bash
    ./deploy-vm.sh
    ```

## Step 2: Configure Environment Variables

The setup script creates a `~/gemara-deploy` directory containing a `.env.template` file. You need to copy this to a `.env` file and fill in your actual credentials.

1.  Navigate to the deployment directory:
    ```bash
    cd ~/gemara-deploy
    ```
2.  Copy the template:
    ```bash
    cp .env.template .env
    ```
3.  Edit the `.env` file using a text editor:
    ```bash
    # open the file with your favorite editor
    ```
4.  **Important:**
    *   Set strong passwords for `POSTGRES_PASSWORD` and `ADMIN_PASSWORD`.
    *   Set a long, random string for `JWT_SECRET`.
    *   Fill in your Cloudflare R2 credentials.
    *   **CRITICAL:** Replace `<YOUR_VM_PUBLIC_IP_OR_DOMAIN>` in `FRONTEND_API_URL` and `ADMIN_API_URL` with your VM's actual public IP address or domain name (e.g., `http://1.2.3.4:8080/api/v1`). Do **not** use `localhost` here, as the frontend running in the user's browser needs to know how to reach your server.

## Step 3: Start the Application

Once your `.env` file is configured, you can start the application using Docker Compose.

1.  Ensure you are in the deployment directory:
    ```bash
    cd ~/gemara-deploy
    ```
2.  Start the containers in detached mode:
    ```bash
    docker-compose -f docker-compose.prod.yml up -d
    ```
    *Note: If you run into permission errors with Docker, log out and log back in, or run `source ~/.bashrc` to refresh your user groups.*

## Step 4: Verify Deployment

Check the status of your running containers:

```bash
docker-compose -f docker-compose.prod.yml ps
```

You can view the logs for a specific service (e.g., backend) to ensure it started successfully:
```bash
docker-compose -f docker-compose.prod.yml logs -f backend
```

## Step 5: Access the Application

Once all services are running and the backend has successfully connected to the database, you can access your applications:

*   **Frontend Application:** `http://<YOUR_VM_PUBLIC_IP>`
*   **Admin Dashboard:** `http://<YOUR_VM_PUBLIC_IP>:4300`
*   **Backend API:** `http://<YOUR_VM_PUBLIC_IP>:8080/api/v1/...`
