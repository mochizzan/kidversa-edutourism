#!/usr/bin/env bash
set -euo pipefail

# Build & push image GHCR secara manual (tanpa GitHub Actions).
# Aman dipanggil dari direktori mana pun: pindah ke root repo dulu.
cd "$(dirname "$0")/.."

OWNER="${GHCR_OWNER:-mochizzan}"
BACKEND_IMAGE="ghcr.io/${OWNER}/kidversa-edutourism-backend:latest"
FRONTEND_IMAGE="ghcr.io/${OWNER}/kidversa-edutourism-frontend:latest"

push_image() {
  local image="$1" context="$2"
  echo "==> docker build -t ${image} ${context}"
  docker build -t "${image}" "${context}"
  echo "==> docker push ${image}"
  if ! docker push "${image}"; then
    echo "Gagal push ${image} — sudah 'docker login ghcr.io'?" >&2
    exit 1
  fi
}

push_image "${BACKEND_IMAGE}" ./backend
push_image "${FRONTEND_IMAGE}" ./frontend
