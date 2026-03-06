# Deployment Guide (Oracle Free Tier VM)

This guide walks you through the entire process of deploying the Gemara/Caratloop application from scratch. It covers renting the Virtual Machine on Oracle Cloud, configuring firewalls, and deploying the application using pre-built Docker images from GitHub Container Registry (GHCR).

---

## Phase 1: Renting and Configuring the Virtual Machine

### Step 1: Create the Compute Instance (VM)

1. Log in to your [Oracle Cloud Console](https://cloud.oracle.com/).
2. Open the navigation menu (top-left hamburger icon) -> **Compute** -> **Instances**.
3. Click the **Create Instance** button.
4. **Name:** Give your instance a name (e.g., `gemara-server`).
5. **Placement:** Leave the default Availability Domain.
6. **Image and Shape:**
   * Click **Edit**.
   * Click **Change Image** -> Select **Oracle Linux** -> Click **Select Image**.
   * Click **Change Shape** -> Select **Virtual Machine** -> Choose a shape. The **VM.Standard.E2.1.Micro** (Always Free eligible) is the standard free tier AMD64 shape. *(Note: Our current Docker images are built for standard AMD64 architectures. If you choose the ARM-based Ampere A1 shape, you will need to enable multi-architecture builds in your GitHub Actions workflow).*
7. **Networking:**
   * Ensure it creates a new Virtual Cloud Network (VCN) and a Public Subnet (or select existing ones).
   * Ensure **Assign a public IPv4 address** is checked.
8. **Add SSH keys:**
   * Select **Generate a key pair for me**.
   * **CRITICAL:** Click **Save private key** to download the `.key` file to your computer. You will need this to log in to the server. Do not lose it!
9. **Boot volume:** Leave defaults (typically 47 GB or 50 GB is fine).
10. Click **Create** at the bottom. Wait a few minutes for the status to change from "Provisioning" to "Running".
11. Note down the **Public IP Address** (`129.159.18.63`) displayed on the instance details page.

### Step 2: Open Ports in the Cloud Provider Firewall (Oracle Cloud)

Before your VM can receive traffic, you must open the required ports in the Oracle Cloud Console.

1. On your Instance Details page, click on the **Subnet** link under the "Primary VNIC" section.
2. Under "Security Lists", click on the **Default Security List**.
3. Click **Add Ingress Rules** and add the following rules:
   *   **Stateless:** Leave unchecked
   *   **Source Type:** CIDR
   *   **Source CIDR:** `0.0.0.0/0`
   *   **IP Protocol:** TCP
   *   **Destination Port Range:** `80`
   *   **Description:** Allow HTTP for Frontend
4. Repeat Step 3 for the other required ports:
   *   **Destination Port Range:** `4300` (Admin App)
   *   **Destination Port Range:** `8080` (Backend API)

---

## Phase 2: Connecting to the VM and OS Setup

### Step 3: SSH into your VM

You will use the private key you downloaded in Step 1 to connect to your server.

**On Mac / Linux / Windows 10+ (using Command Prompt/PowerShell):**
1. Open your terminal.
2. Change the permissions of your private key so only you can read it:
   ```bash
   chmod 400 path/to/your-private-key.key
   ```
3. Connect to the server using the default Oracle Linux username (`opc`) and your VM's Public IP (`129.159.18.63`):
   ```bash
   ssh -i path/to/your-private-key.key opc@129.159.18.63
   ```
*(Type `yes` if prompted about the authenticity of the host).*

### Step 4: Open Ports in the VM Operating System (firewalld)

Oracle Linux uses `firewalld` by default instead of `iptables`. You need to configure it to allow the traffic you just allowed in the Cloud Console.

1. Run the following commands to open ports 80, 4300, and 8080 permanently:

```bash
sudo firewall-cmd --permanent --zone=public --add-port=80/tcp
sudo firewall-cmd --permanent --zone=public --add-port=4300/tcp
sudo firewall-cmd --permanent --zone=public --add-port=8080/tcp
```

2. Reload the firewall rules for the changes to take effect:

```bash
sudo firewall-cmd --reload
```

---

## Phase 3: Application Deployment

### Step 5: Transfer and Run the Setup Script

The `deploy-vm.sh` script automates the initial setup. It configures 4GB of Virtual RAM (Swap), installs Docker & Docker Compose, and sets up your deployment directory with necessary templates.

1.  Download the deployment script directly from your GitHub repository:
    ```bash
    wget https://raw.githubusercontent.com/mitanshusurana/Gemera_ecomm/main/deploy-vm.sh
    ```
2.  Make the script executable:
    ```bash
    chmod +x deploy-vm.sh
    ```
3.  Run the script:
    ```bash
    ./deploy-vm.sh
    ```

### Step 6: Configure Environment Variables

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
    # edit the file using your preferred text editor
    ```
4.  **Important:**
    *   Set strong passwords for `POSTGRES_PASSWORD` and `ADMIN_PASSWORD`.
    *   Set a long, random string for `JWT_SECRET`.
    *   Fill in your Cloudflare R2 credentials.
    *   **Note:** The script has automatically populated `FRONTEND_API_URL` and `ADMIN_API_URL` with your IP `129.159.18.63`.

### Step 7: Start the Application

Once your `.env` file is configured, you can start the application using Docker Compose.

1.  Ensure you are in the deployment directory:
    ```bash
    cd ~/gemara-deploy
    ```
2.  Start the containers in detached mode:
    ```bash
    docker-compose -f docker-compose.prod.yml up -d
    ```
    *Note: If you run into permission errors with Docker, log out and log back in, or run `newgrp docker` to refresh your user groups.*

### Step 8: Verify Deployment

Check the status of your running containers:

```bash
docker-compose -f docker-compose.prod.yml ps
```

You can view the logs for a specific service (e.g., backend) to ensure it started successfully:
```bash
docker-compose -f docker-compose.prod.yml logs -f backend
```

### Step 9: Access the Application

Once all services are running and the backend has successfully connected to the database, you can access your applications via a web browser:

*   **Frontend Application:** `http://129.159.18.63`
*   **Admin Dashboard:** `http://129.159.18.63:4300`
*   **Backend API:** `http://129.159.18.63:8080/api/v1/...`
