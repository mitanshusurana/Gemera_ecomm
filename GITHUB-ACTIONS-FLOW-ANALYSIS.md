# GitHub Actions → Docker Compose Flow Analysis

## Current Setup

**GitHub Actions Workflow**: `.github/workflows/docker-build-push.yml`
- Runs on: Push to `main` branch
- Registry: GitHub Container Registry (GHCR: `ghcr.io`)
- Builds 3 images: backend, frontend, admin

**Production Deployment**: `docker-compose.prod.yml` on Oracle VM
- Pulls pre-built images from GHCR
- No local builds required

---

## ⚠️ CRITICAL ISSUES FOUND

### 1. **Image Name Mismatch** (Most Critical)

**Problem**: 
Your `docker-compose.prod.yml` uses placeholder names:
```yaml
image: ghcr.io/GH_USERNAME/REPO_NAME-backend:latest
image: ghcr.io/GH_USERNAME/REPO_NAME-frontend:latest
image: ghcr.io/GH_USERNAME/REPO_NAME-admin:latest
```

**What GitHub Actions Actually Generates**:
For repo `mitanshusurana/Gemera_ecomm`:
```
ghcr.io/mitanshusurana/gemera_ecomm-backend:latest  ← lowercase!
ghcr.io/mitanshusurana/gemera_ecomm-frontend:latest
ghcr.io/mitanshusurana/gemera_ecomm-admin:latest
```

**Why**: 
- GitHub Actions uses `${GITHUB_REPOSITORY,,}` (lowercase conversion)
- The repo name becomes `mitanshusurana/gemera_ecomm` (lowercase)

**Fix Required**: Update docker-compose.prod.yml before deploying to VM:
```yaml
backend:
  image: ghcr.io/mitanshusurana/gemera_ecomm-backend:latest

frontend:
  image: ghcr.io/mitanshusurana/gemera_ecomm-frontend:latest

admin:
  image: ghcr.io/mitanshusurana/gemera_ecomm-admin:latest
```

---

### 2. **Frontend Port Binding Error**

**Problem**:
```yaml
frontend:
  ports:
    - "80:80"  # ❌ Wrong!
```

**Issue**: 
- Frontend container runs on port **4000** (Node.js Express SSR)
- Port 80 is trying to connect to port 80 inside container
- Request fails immediately

**Fix**:
```yaml
frontend:
  ports:
    - "80:4000"  # Maps VM port 80 → Container port 4000
```

**Verification in frontend.Dockerfile**:
```dockerfile
EXPOSE 4000
ENV PORT=4000 NODE_ENV=production
CMD ["node", "--enable-source-maps", "dist/server/server.mjs"]
```

---

### 3. **Admin Port Mapping** (Minor Concern)

**Current**:
```yaml
admin:
  ports:
    - "4300:80"  # Correct, but unusual port
```

**Better Practice**:
```yaml
admin:
  ports:
    - "81:80"  # Or keep 4300 if there's a reason
    # With reverse proxy, could map directly: "443:80"
```

---

### 4. **Missing imagePullPolicy**

**Problem**:
Without explicit pull policy, Docker might use cached old images even after new push.

**Fix**: Add to both frontend and admin:
```yaml
frontend:
  # ... existing config
  image: ghcr.io/mitanshusurana/gemera_ecomm-frontend:latest
  imagePullPolicy: Always  # ← Add this
```

---

### 5. **Missing Environment Variables for SSR**

**Problem**:
Frontend container missing NODE_ENV:
```yaml
frontend:
  environment:
    API_URL: http://backend:8080/api/v1
    RAZORPAY_KEY: rzp_test_S5goGHXLEuP6hP
    WHATSAPP_NUMBER: 917976091951
```

**Fix**:
```yaml
frontend:
  environment:
    API_URL: http://backend:8080/api/v1
    RAZORPAY_KEY: rzp_test_S5goGHXLEuP6hP
    WHATSAPP_NUMBER: 917976091951
    NODE_ENV: production  # ← Add this
    PORT: 4000            # ← Add this
```

---

## Summary Table

| Issue | Severity | Status | Fix |
|-------|----------|--------|-----|
| Image name lowercase mismatch | 🔴 CRITICAL | Needs fix | Update compose file with actual image names |
| Frontend port 80:80 wrong | 🔴 CRITICAL | Needs fix | Change to 80:4000 |
| Missing imagePullPolicy | 🟡 HIGH | Recommended | Add `imagePullPolicy: Always` |
| Missing NODE_ENV | 🟡 HIGH | Recommended | Add to environment |
| Admin port mapping | 🟢 LOW | Works | Consider using port 81 |

---

## Deployment Flow (Current)

```
1. Developer pushes to main
   ↓
2. GitHub Actions triggers
   ├─ Builds backend image
   ├─ Builds frontend image  
   └─ Builds admin image
   ↓
3. Images pushed to ghcr.io (automatic)
   ├─ ghcr.io/mitanshusurana/gemera_ecomm-backend:latest
   ├─ ghcr.io/mitanshusurana/gemera_ecomm-frontend:latest
   └─ ghcr.io/mitanshusurana/gemera_ecomm-admin:latest
   ↓
4. Manual step on VM:
   - Update docker-compose.prod.yml (if not using env vars)
   - OR use environment variables for image names
   - Run: docker-compose -f docker-compose.prod.yml pull
   - Run: docker-compose -f docker-compose.prod.yml up -d
   ↓
5. Containers start ✓
```

---

## Recommended Fixes (Priority Order)

### IMMEDIATE (Required)
✏️ Create updated `docker-compose.prod.yml` with correct image names

### IMPORTANT (Should do)
✏️ Fix frontend port mapping: `80:4000`
✏️ Add imagePullPolicy: Always
✏️ Add NODE_ENV and PORT environment variables

### NICE-TO-HAVE
🔧 Use environment variables instead of hardcoded image names
🔧 Add version tags for deployments
🔧 Consider using nginx reverse proxy

---

## Next Steps

1. **Verify image names** - Run GitHub Actions and check pushed images:
   ```bash
   # On VM, check what's available
   curl -H "Authorization: Bearer $GH_TOKEN" https://ghcr.io/v2/mitanshusurana/gemera_ecomm-frontend/tags/list
   ```

2. **Create corrected docker-compose.prod.yml**
   - Use exact image names from GitHub Actions output
   - Fix port mappings
   - Add missing environment variables

3. **Test pull and run** on VM:
   ```bash
   docker-compose -f docker-compose.prod.yml pull
   docker-compose -f docker-compose.prod.yml up -d
   docker-compose logs -f
   ```

