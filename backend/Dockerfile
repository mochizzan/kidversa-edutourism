# syntax=docker/dockerfile:1.7
# Multi-stage build: compile with golang:1.26-alpine, run on minimal Alpine.
# Pin the builder to a digest in production for reproducibility, e.g.:
#   FROM golang:1.26-alpine@sha256:<digest>

# ─── Builder ───────────────────────────────────────────────
FROM golang:1.26-alpine AS build
WORKDIR /src
# Cache module downloads: only re-run when go.mod/go.sum change.
COPY go.mod go.sum ./
RUN go mod download
# Copy source; .dockerignore excludes .env, uploads/, Dockerfile.dev, .air.toml, etc.
COPY . .
# Static, CGO-free build -> runs natively on musl (Alpine).
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ./cmd/server && \
    CGO_ENABLED=0 GOOS=linux go build -o /out/migrate ./cmd/migrate

# ─── Runtime ───────────────────────────────────────────────
FROM alpine:3.24
# ffmpeg provides ffprobe at /usr/bin/ffprobe (runtime dep for video-duration).
# ca-certificates: TLS for MariaDB/HTTP.
RUN apk add --no-cache ffmpeg ca-certificates
WORKDIR /app
COPY --from=build /out/server /app/server
COPY --from=build /out/migrate /app/migrate
COPY migrations ./migrations
RUN mkdir -p uploads
# In-image healthcheck (busybox wget has no --spider; GET -> /dev/null).
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=20s \
  CMD wget -q -O /dev/null http://localhost:8080/health || exit 1
EXPOSE 8080
# Fail-closed bootstrap: migrate (3 attempts) then start the server ONLY on
# success. If all attempts fail, the backend MUST NOT boot (broken schema).
CMD ["sh", "-c", "for i in 1 2 3; do /app/migrate && exec /app/server; echo \"migrate attempt $i failed\"; [ \"$i\" = 3 ] || { echo \"retrying in 3s...\"; sleep 3; }; done; echo \"migration failed after 3 attempts: backend will not start\"; exit 1"]
