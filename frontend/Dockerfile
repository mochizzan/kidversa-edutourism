# syntax=docker/dockerfile:1
# Multi-stage: build the React app, serve static files with nginx (Gzip compression).
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
# pnpm non-interactive mode — respects allowBuilds in pnpm-workspace.yaml
ENV CI=true
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ─── Production runtime (default nginx:stable-alpine) ─────────
FROM nginx:stable-alpine
# Remove the stock default site; the server config is mounted at runtime from
# ./nginx/default.conf (Gzip only — no Brotli build complexity).
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
