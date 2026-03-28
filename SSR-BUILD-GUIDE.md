# Angular SSR Docker Build - Troubleshooting Guide

## Problem Root Cause
The error "Angular app engine manifest is not set" indicates the build output is missing the `angular-app-engine-manifest.mjs` file, which is critical for Angular SSR to initialize properly.

```
Error: Angular app engine manifest is not set. Please ensure you are using the 
'@angular/build:application' builder to build your server application.
```

## What We Fixed

### 1. **Added Production Build Script** (package.json)
```json
"build:prod": "ng build --configuration production",
"build:prod:ssr": "ng build --configuration production && npm run build:validate",
"build:validate": "node scripts/validate-build.js",
```

**Why:** The original `ng build` command was being called without the `--configuration production` flag in Docker, which could cause different optimization levels and potentially skip SSR generation.

### 2. **Added Build Validation Script** (scripts/validate-build.js)
Created a comprehensive script that verifies:
- ✓ Build directory exists
- ✓ Server output directory exists  
- ✓ Browser output directory exists
- ✓ `server.mjs` entry point exists
- ✓ `angular-app-engine-manifest.mjs` manifest exists
- ✓ Browser index file exists

This helps catch build issues early before Docker runtime.

### 3. **Enhanced Frontend Dockerfile**
Updated to:
- Use explicit `npm run build:prod` command
- Add build validation step that fails if SSR output is missing
- Better error messages showing expected vs actual build structure
- Proper verification before exiting build stage

## Current Build Output Structure

```
✓ dist/fusion-angular-tailwind-starter/
  ├── browser/              # Client-side bundle
  │   ├── index.csr.html
  │   ├── main-*.js
  │   ├── polyfills-*.js
  │   └── styles-*.css
  ├── server/               # SSR bundle
  │   ├── server.mjs        # ← Entry point
  │   ├── angular-app-engine-manifest.mjs  # ← Critical!
  │   ├── angular-app-manifest.mjs
  │   ├── main.server.mjs
  │   ├── polyfills.server.mjs
  │   └── chunk-*.mjs       # Lazy-loaded modules
  └── prerendered-routes.json
```

## To Deploy with Docker Compose

1. **Local Testing** - Test the build locally first:
   ```bash
   npm run build:prod          # Build for production
   npm run build:validate      # Validate SSR output
   npm run serve:ssr:fusion-angular-tailwind-starter  # Test server
   ```

2. **Docker Build** - Build Docker image:
   ```bash
   docker-compose build frontend
   ```

3. **Docker Run** - Start containers:
   ```bash
   docker-compose up -d
   ```

## Troubleshooting Steps

### If Docker Build Still Fails

1. **Check npm cache:**
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm ci
   ```

2. **Verify Angular SSR is installed:**
   ```bash
   npm list @angular/ssr @angular/build
   ```

3. **Check typescript compilation:**
   ```bash
   npx tsc --noEmit
   ```

4. **Test production build locally:**
   ```bash
   npm run build:prod 2>&1 | grep -i error
   npm run build:validate
   ```

### If Server Fails to Start

1. **Check if manifest file was generated:**
   ```bash
   ls -la dist/fusion-angular-tailwind-starter/server/angular-app-engine-manifest.mjs
   ```

2. **Verify server.mjs is executable:**
   ```bash
   node dist/fusion-angular-tailwind-starter/server/server.mjs
   ```

3. **Check server logs in Docker:**
   ```bash
   docker logs jewelry-frontend -f
   ```

## Configuration Files

### angular.json (Build Configuration)
- **Builder**: `@angular/build:application` ✓
- **SSR Entry**: `src/server.ts` ✓
- **Server Bootstrap**: `src/main.server.ts` ✓
- **Prerender**: `false` (disabled for dynamic content) ✓

### Dockerfile (Build Process)
- **Build Stage**: Compiles Angular with SSR
- **Validation**: Checks for required files
- **Runtime Stage**: Uses compiled output
- **CMD**: Runs `node dist/server/server.mjs`

### docker-compose.yml (Environment)
- **PORT**: 4000 (default for Node.js Express server)
- **NODE_ENV**: production
- **Mount**: Frontend service maps 4200:4000

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `angular-app-engine-manifest.mjs` not found | Build incomplete or configuration issue | Run `npm run build:validate` locally |
| `browser` directory missing | Build failed silently | Check build output for TypeScript errors |
| `server.mjs` not found | SSR entry configuration missing | Verify `ssr.entry` in angular.json |
| Container exits immediately | Port binding issue or runtime error | Check `docker logs jewelry-frontend` |
| Build takes too long | Node modules not cached | Use Docker layer caching properly |

## Performance Notes

- **Browser Bundle**: ~500KB (gzipped JavaScript/CSS)
- **Server Bundle**: ~2-3MB (ESM modules)
- **Build Time**: ~2-3 minutes for production build
- **Container Size**: ~400MB (with node_modules)

## References

- [Angular SSR Documentation](https://angular.io/guide/prerendering)
- [Angular Build Application](https://angular.io/cli/build)
- [Express.js on Node](https://expressjs.com/)
- [Docker Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)

---

## Next Steps

1. ✅ Local build testing passed
2. 👉 **Now test Docker build**: `docker-compose build frontend`
3. Test Docker runtime: `docker-compose up -d`
4. Verify server is running on http://localhost:4200

