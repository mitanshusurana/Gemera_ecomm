# Admin SPA served by nginx. Build context is the repository root.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps && npm cache clean --force
COPY . .
RUN npx ng build admin --configuration production

FROM nginx:alpine
COPY --from=build /app/dist/admin/browser /usr/share/nginx/html
COPY nginx-custom.conf /etc/nginx/conf.d/default.conf
# 99-env-subst.sh injects API_URL and STOREFRONT_URL into the bundle at container start and refuses to start without API_URL.
COPY admin-env-subst.sh /docker-entrypoint.d/99-env-subst.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/99-env-subst.sh && chmod +x /docker-entrypoint.d/99-env-subst.sh
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
