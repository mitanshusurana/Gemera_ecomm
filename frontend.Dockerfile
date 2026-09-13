# Storefront (Angular SSR). Build context is the repository root.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps && npm cache clean --force
COPY . .
RUN npm run build:prod && npm run build:validate

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --omit=dev && npm cache clean --force
COPY --from=build /app/dist/fusion-angular-tailwind-starter ./dist
COPY env-subst.sh ./
RUN sed -i 's/\r$//' ./env-subst.sh && chmod +x ./env-subst.sh && addgroup -S -g 10001 app && adduser -S -u 10001 -G app app && chown -R app:app /app
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:4000/ > /dev/null || exit 1
# env-subst.sh injects API_URL / SSR_API_URL and the company placeholders into the built bundles at start-up.
CMD ["sh", "-c", "./env-subst.sh && node dist/server/server.mjs"]
