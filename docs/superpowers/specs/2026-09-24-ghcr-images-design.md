# Design: GHCR Images untuk Local & Production

**Date:** 2026-09-24
**Status:** Approved
**Scope:** Deployment tooling only — no Go/TS code changes.

## Goal

Backend & frontend berhenti di-build secara lokal oleh Docker Compose. Sebagai gantinya, image di-build dan di-push ke GitHub Container Registry (GHCR) dari mesin dev secara manual, dan **lokal maupun produksi mengonsumsi image yang sama** (`docker compose pull`).

## Decisions (dari Q&A)

| Keputusan | Pilihan |
|---|---|
| Mekanisme build/push | Script lokal (`scripts/push-ghcr.sh`); **tanpa** GitHub Actions |
| Trigger | Manual, kapan pun dev menjalankan script |
| Tag | `:latest` saja (tanpa SHA/tag tambahan) |
| Nama image | `ghcr.io/mochizzan/kidversa-edutourism-backend`, `ghcr.io/mochizzan/kidversa-edutourism-frontend` |
| Visibility package | Public — pull tanpa login di mesin mana pun |
| Jalur build lokal di compose | Dihapus total; compose murni `image:` + pull |
| CI lama (`backend/.github/workflows/ci.yml`) | Diparkir — tidak dipindah, tidak diubah |
| Registry di compose | Hardcode (Approach A), owner dapat di-override di script via env `GHCR_OWNER` |

## Components

### 1. `compose.yml` (ubah)

- Service `backend`: hapus blok `build:` → `image: ghcr.io/mochizzan/kidversa-edutourism-backend:latest`.
- Service `frontend`: hapus blok `build:` → `image: ghcr.io/mochizzan/kidversa-edutourism-frontend:latest`.
- Header komentar diperbarui: `docker compose up -d --build` → `docker compose pull && docker compose up -d`.
- `mariadb`, `wa-engine` (`ghcr.io/rmyndharis/openwa:latest`), healthcheck, resource limits, bind mounts, port bindings: **tidak berubah**.

### 2. `scripts/push-ghcr.sh` (baru)

- Shell Bash, compatible Git Bash (MSYS2); `set -euo pipefail`.
- Script meng-cd ke root repo (diambil dari lokasi script sendiri) sebelum build, sehingga context `./backend` & `./frontend` benar walau dipanggil dari direktori mana pun.
- `OWNER="${GHCR_OWNER:-mochizzan}"` — default hardcode `mochizzan`. **Catatan:** override ini hanya mempengaruhi tujuan push script; `compose.yml` tetap hardcode `mochizzan`, jadi mengganti owner berarti mengedit compose juga agar pull mengarah ke owner yang sama.
- Image refs:
  - `ghcr.io/$OWNER/kidversa-edutourism-backend:latest` ← build context `./backend`
  - `ghcr.io/$OWNER/kidversa-edutourism-frontend:latest` ← build context `./frontend`
- Urutan **sekuensial**: build+push backend dahulu, baru frontend — jika backend gagal, frontend tidak ter-push dengan keadaan repo yang sama.
- Tidak menyimpan atau membaca token dari file; autentikasi sepenuhnya lewat `docker login ghcr.io` yang sudah dilakukan sekali oleh dev.

### 3. Setup sekali (manual, di GitHub)

- Push pertama ke package yang belum ada otomatis membuatnya (bukan galat).
- Setelah push pertama: package settings → visibility **Public** (default GHCR adalah private).
- Dev menjalankan `docker login ghcr.io` sekali di mesinnya.

## Data Flow

```
Mesin dev
  scripts/push-ghcr.sh
    → docker build backend/ → docker push :latest
    → docker build frontend/ → docker push :latest

Lokal / VPS (identik)
  docker compose pull && docker compose up -d
    → tarik :latest dari GHCR → jalankan stack
```

## Error Handling

- Script `set -euo pipefail`: build gagal ⇒ push tidak dijalankan; push backend gagal ⇒ frontend tidak diproses.
- Push gagal 401 (belum login / token kedaluwarsa): script mencetak hint singkat *belum `docker login ghcr.io`?* lalu exit non-zero. Tidak ada logika login otomatis.
- Package belum ada: push pertama membuatnya otomatis.
- Pull gagal di compose: Docker Compose memberi error jelas; **tidak ada** fallback `build:` terselubung.

## Verification

1. `bash -n scripts/push-ghcr.sh` — cek sintaks.
2. Jalankan `scripts/push-ghcr.sh` sungguhan (PAT valid), lalu `docker manifest inspect ghcr.io/mochizzan/kidversa-edutourism-backend:latest` sukses (dan frontend).
3. Set package → Public di GitHub; uji pull **benar-benar tanpa kredensial**: `docker logout ghcr.io` dulu (mesin dev masih login dari step 2 — tanpa logout, pull akan sukses karena kredensial tersimpan dan tidak membuktikan apa pun), lalu `docker compose pull` berhasil; `docker login ghcr.io` lagi setelahnya. Alternatif: jalankan pull dari VPS yang tidak pernah login.
4. `docker compose up -d` → `docker compose ps`: backend `/health` sehat, frontend & wa-engine naik.
5. `gofmt`/`go vet`/`go test`/`pnpm build` **tidak dijalankan** — tidak ada kode Go/TS yang berubah.

## Out of Scope

- Memindah/mengubah CI yang ada (`backend/.github/workflows/ci.yml`).
- GitHub Actions untuk build/push GHCR.
- Multi-tag / rollback (`:sha`, versi semantik).
- Perubahan service `mariadb` dan `wa-engine`.

## Security Note

Token PAT (`ghp_...`) yang ditempel saat diskusi dianggap terpapar — wajib **di-revoke/di-rotate** di GitHub **setelah seluruh Verification (step 1–4) selesai**, karena step 2 masih membutuhkan token yang valid. Revoke sebelum verifikasi selesai akan mematikan kemampuan push. Tidak ada token yang disimpan di file mana pun dalam desain ini.
