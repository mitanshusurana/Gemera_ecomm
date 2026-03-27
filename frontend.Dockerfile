FROM node:22-alpine AS build

# Use explicit commands instead of WORKDIR that might trigger the overlayfs issue
RUN mkdir /app
COPY package*.json /app/
RUN cd /app && npm install --legacy-peer-deps
COPY . /app/
RUN cd /app && npm run build -- --configuration production

FROM node:22-alpine

RUN mkdir -p /app/dist

# Copy the entire built dist folder structure (includes both browser and server subdirectories)
COPY --from=build /app/dist/fusion-angular-tailwind-starter /app/dist/fusion-angular-tailwind-starter

# Copy package.json for reference (optional)
COPY package*.json /app/

# We expose 4000 as it's the default Node Express port for Angular SSR
EXPOSE 4000

ENV PORT=4000

# Set working directory to dist so server.mjs can correctly resolve ../browser
WORKDIR /app/dist/fusion-angular-tailwind-starter

# Run the SSR server directly - server.mjs will find ../browser relative to its location
CMD ["node", "server/server.mjs"]
