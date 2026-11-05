# syntax=docker/dockerfile:1.7

FROM node:24.15.0-alpine AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS production-build
COPY angular.json tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM dependencies AS demo-build
COPY angular.json tsconfig*.json ./
COPY src ./src
RUN npm run build:demo

FROM nginx:1.27.4-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:8080/ping || exit 1

FROM runtime AS demo
COPY --from=demo-build /workspace/dist/storecore-demo/browser /usr/share/nginx/html

# Keep production as the default final target so a plain `docker build .` can
# never publish the isolated Demo fixtures by accident.
FROM runtime AS production
COPY --from=production-build /workspace/dist/storecore-frontend/browser /usr/share/nginx/html
