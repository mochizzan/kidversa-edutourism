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
# Run migrations first (CREATE DATABASE + schema + bootstrap) with a bounded
# retry (handles cold-start MariaDB), then start the server. The migration
# runner also self-heals a dirty schema state internally.
CMD ["sh", "-c", "for i in 1 2 3 4 5; do /app/migrate && break; echo \"migrate attempt $i failed, retrying in 3s...\"; sleep 3; done && exec /app/server"]
