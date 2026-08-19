# Multi-stage build: compile with golang:1.26, run on slim debian.
FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/server && \
    CGO_ENABLED=0 GOOS=linux go build -o /app/migrate ./cmd/migrate

FROM debian:stable-slim
RUN apt-get update && apt-get install -y ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/server /app/server
COPY --from=build /app/migrate /app/migrate
COPY migrations ./migrations
RUN mkdir -p uploads
EXPOSE 8080
# Run migrations first (CREATE DATABASE + schema + bootstrap) with at most 3
# attempts (cold-start MariaDB), then start the server ONLY on success. If all
# attempts fail the backend MUST NOT boot — fail closed instead of starting on a
# broken schema.
CMD ["sh", "-c", "for i in 1 2 3; do /app/migrate && exec /app/server; echo \"migrate attempt $i failed\"; [ \"$i\" = 3 ] || { echo \"retrying in 3s...\"; sleep 3; }; done; echo \"migration failed after 3 attempts: backend will not start\"; exit 1"]
