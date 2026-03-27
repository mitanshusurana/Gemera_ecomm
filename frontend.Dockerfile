FROM node:22-alpine AS build

# Use explicit commands instead of WORKDIR that might trigger the overlayfs issue
RUN mkdir /app
COPY package*.json /app/
RUN cd /app && npm install --legacy-peer-deps
COPY . /app/
RUN cd /app && npm run build -- --configuration production

FROM node:22-alpine

RUN mkdir /app

# Copy the built artifacts
COPY --from=build /app/dist/fusion-angular-tailwind-starter /app/dist

# Copy the environment substitution script
COPY env-subst.sh /app/env-subst.sh
RUN chmod +x /app/env-subst.sh

# We expose 4000 as it's the default Node Express port for Angular SSR
EXPOSE 4000

ENV PORT=4000
ENV TARGET_DIR="/app/dist"

# Run environment variable substitution then start the SSR server
CMD ["/bin/sh", "-c", "/app/env-subst.sh && cd /app && node dist/server/server.mjs"]