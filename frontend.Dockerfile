FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build -- --configuration production

FROM nginx:alpine
# Check if browser folder exists, if not copy parent.
# But Docker COPY doesn't support conditional.
# We assume standard Angular CLI output for application builder.
COPY --from=build /app/dist/fusion-angular-tailwind-starter/browser /usr/share/nginx/html
COPY nginx-custom.conf /etc/nginx/conf.d/default.conf
COPY env-subst.sh /docker-entrypoint.d/99-env-subst.sh
RUN chmod +x /docker-entrypoint.d/99-env-subst.sh
EXPOSE 80
