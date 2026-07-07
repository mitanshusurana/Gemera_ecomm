FROM node:22-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with clean npm cache
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Copy all source files
COPY . .

# Build the Angular application for production with SSR
RUN npm run build:prod

# Validate the build output - exit if validation fails
RUN npm run build:validate || { echo "Build validation failed - SSR configuration incomplete"; exit 1; }

# Verify the build output structure
RUN echo "Build output structure:" && \
    ls -la dist/fusion-angular-tailwind-starter/ && \
    if [ -d "dist/fusion-angular-tailwind-starter/server" ]; then \
      echo "✓ Server folder found"; \
      echo "Server folder contents:"; \
      ls -la dist/fusion-angular-tailwind-starter/server/; \
      if [ ! -f "dist/fusion-angular-tailwind-starter/server/angular-app-engine-manifest.mjs" ]; then \
        echo "ERROR: angular-app-engine-manifest.mjs not found!"; \
        exit 1; \
      fi; \
    else \
      echo "ERROR: Server folder not found in build output"; \
      exit 1; \
    fi

FROM node:22-alpine

WORKDIR /app

# Copy the entire dist folder from build stage
COPY --from=build /app/dist/fusion-angular-tailwind-starter ./dist

# Copy package.json and package-lock.json for production dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm ci --legacy-peer-deps --omit=dev

# Expose the default Node Express port for Angular SSR
EXPOSE 4000

ENV PORT=4000 \
    NODE_ENV=production

# Copy environment substitution script
COPY env-subst.sh ./
RUN sed -i 's/\r$//' ./env-subst.sh && chmod +x ./env-subst.sh

# Verify the final file structure
RUN echo "Final dist structure:" && \
    ls -la dist/ && \
    ls -la dist/browser/ && \
    ls -la dist/server/ && \
    head -20 dist/server/angular-app-engine-manifest.mjs && \
    echo "Server.mjs first 30 lines:" && \
    head -30 dist/server/server.mjs

# Run the SSR server with verbose logging
# The server.mjs is at dist/server/server.mjs and it will resolve ../browser correctly
CMD ["sh", "-c", "./env-subst.sh && node --enable-source-maps --trace-warnings dist/server/server.mjs"]
