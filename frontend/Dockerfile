FROM node:22-alpine

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# pnpm non-interactive mode — respects allowBuilds in pnpm-workspace.yaml
ENV CI=true

WORKDIR /app

# Install dependencies (leverages Docker layer cache)
# pnpm-workspace.yaml must be present for allowBuilds to work
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

EXPOSE 5173

# Vite dev server with HMR — binds to 0.0.0.0 for Docker access
CMD ["pnpm", "dev"]
