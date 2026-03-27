# Stage 1: Build the Angular SSR application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the SSR application (produces /dist/fusion-angular-tailwind-starter with browser and server subdirectories)
RUN npm run build

# Stage 2: Runtime image
FROM node:20-alpine

WORKDIR /app

# Copy only the built application from the builder stage
COPY --from=builder /app/dist/fusion-angular-tailwind-starter ./dist

# Copy package files and install production dependencies only
COPY package*.json ./

RUN npm ci --only=production

# Expose the default Angular SSR port
EXPOSE 4000

# Set the working directory to the dist root so server.mjs can find ../browser
WORKDIR /app/dist

# Run the server.mjs file
CMD ["node", "server/server.mjs"]
