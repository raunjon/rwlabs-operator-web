# Build: Node compiles the static app into dist/.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime: nginx only (no Node). Serves dist/ and proxies API paths to the gateway.
FROM nginx:1.28-alpine
# Where API calls go, and the Host header the gateway expects (staging's gateway only accepts localhost and
# 10.0.0.0/24 hosts until OS-29). NGINX_ENTRYPOINT_LOCAL_RESOLVERS makes the image's entrypoint export
# NGINX_LOCAL_RESOLVERS from /etc/resolv.conf, so the gateway's address is re-resolved after it is recreated.
ENV GATEWAY_UPSTREAM=http://gateway:3000 \
    GATEWAY_HOST_HEADER=localhost:3000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
