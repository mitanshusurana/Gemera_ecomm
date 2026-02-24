FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run ng -- build admin --configuration production

FROM nginx:alpine
COPY --from=build /app/dist/admin/browser /usr/share/nginx/html
COPY nginx-custom.conf /etc/nginx/conf.d/default.conf
COPY admin-env-subst.sh /docker-entrypoint.d/99-env-subst.sh
RUN chmod +x /docker-entrypoint.d/99-env-subst.sh
EXPOSE 80
