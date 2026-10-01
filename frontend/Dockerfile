# syntax=docker/dockerfile:1
# Multi-stage: build the React app, serve static files with nginx (Gzip compression).
FROM node:22-alpine AS build
# pnpm version intentionally NOT pinned to an exact release: neither
# package.json carries a `packageManager` field, nor does pnpm-lock.yaml
# (lockfileVersion '9.0' is shared by pnpm 9.x and 10.x) — the exact version
# is not derivable from this repo, and guessing would risk a mismatched pin.
# Add `"packageManager": "pnpm@<version>"` to package.json to pin it here.
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
