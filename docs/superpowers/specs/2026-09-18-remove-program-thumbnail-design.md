# Remove Unused Program Thumbnail URL

**Date:** 2026-09-18
**Status:** Approved
**Scope:** Frontend, backend API, and database schema

## 1. Problem

The Program create/edit form exposes a **Thumbnail URL** field, but the product does not use or display program thumbnails. The field is still carried through the frontend types and service payload, accepted by the backend request contract, mapped into the Program entity and repository update, and persisted in the `programs.thumbnail_url` database column.

This creates an unused API and storage surface. The field should be removed end to end.

## 2. Goals

- Remove the Thumbnail URL input from Program create/edit UI.
- Remove `thumbnail_url` from the active frontend Program types, DTOs, and request payloads.
- Remove `thumbnail_url` from the backend Program request, entity, handler mapping, and repository mapping.
- Drop `programs.thumbnail_url` from the database.
- Reject legacy requests that still send `thumbnail_url`, because the payload no longer matches the backend contract.
- Preserve all other Program behavior, including name, description, active status, and final badge fields.

## 3. Non-Goals

- Do not add a replacement thumbnail, image upload, or preview feature.
- Do not change final badge name or image behavior.
- Do not change Program routes, list behavior, or unrelated API endpoints.
- Do not add a compatibility shim for old clients.
- Do not preserve old thumbnail values; the data is intentionally discarded.

## 4. Decisions and Contract

### 4.1 Rollout

Use a **hard cutover**. The database migration, backend, and frontend must be deployed together. There is no support window for clients that continue sending `thumbnail_url`.

### 4.2 Legacy payload behavior

`POST /api/programs` and `PUT /api/programs/:id` must reject a body containing `thumbnail_url`.

Expected response:

- HTTP status: `400`
- Error code: `invalid_body`
- No repository write or database mutation occurs.

The error is a general payload-contract error, not a thumbnail-specific error. A valid request without `thumbnail_url` continues to work normally.

### 4.3 Data loss

Dropping the column permanently removes existing thumbnail values. The down migration may restore the column structure, but it cannot restore the discarded data.

## 5. Frontend Design

### 5.1 Program form

In `frontend/src/features/admin/pages/ProgramFormPage.tsx`:

- Remove `thumbnailUrl` state.
- Remove loading-time assignment from `program.thumbnail_url`.
- Remove `thumbnail_url` from the create/update payload.
- Remove the Thumbnail URL `Input`.

The form remains limited to:

1. Nama Program
2. Deskripsi
3. Program Aktif on edit
4. Badge Final Program

### 5.2 Frontend types and service

In `frontend/src/core/types/entities.ts` and `frontend/src/core/types/api.ts`:

- Remove `thumbnail_url` from `Program`.
- Remove `thumbnail_url` from `CreateProgramDTO`.
- Remove `thumbnail_url` from `UpdateProgramDTO`.

In `frontend/src/core/services/programs.ts`:

- Remove `thumbnail_url` from the `create` payload.
- Remove `thumbnail_url` from the `update` payload.

`ProgramInfoTab` currently has no thumbnail input. It requires no feature change beyond compiling against the revised `Program` type.

## 6. Backend Design

### 6.1 Request and entity contracts

In `backend/internal/delivery/http/dto/program.go`:

- Remove `ThumbnailURL` from `ProgramRequest`.

In `backend/internal/domain/entity/program.go`:

- Remove `ThumbnailURL` from `Program`.

### 6.2 Handler behavior

In `backend/internal/delivery/http/handler/program_handler.go`:

- Remove thumbnail assignment from Program creation.
- Remove thumbnail assignment from Program update.
- Replace the Program create/update binding call with a Program-scoped strict binder. The binder must decode the JSON body once with `json.Decoder.DisallowUnknownFields()`, then run the existing validator.
- Any unknown field, including `thumbnail_url`, returns `400 invalid_body` before repository access.
- Validator failures continue to return `400 validation_error`.
- Keep the existing validation for a missing/empty Program name.
- Do not change the shared `bindAndValidate` helper used by unrelated endpoints.

The strict decoder is scoped to Program create/update only and preserves the existing standard error envelope.

### 6.3 Persistence

In `backend/internal/infrastructure/persistence/program_repo.go`:

- Remove `thumbnail_url` from the update field map.
- Leave create/list/get/delete behavior otherwise unchanged.

`ProgramModel` embeds `entity.Program`; removing the entity field removes the GORM field mapping without adding a separate model change.

## 7. Database Design

Add a new migration pair after the current `000002` migration.

### 7.1 Up migration

File: `backend/migrations/000003_remove_program_thumbnail.up.sql`

```sql
ALTER TABLE `programs` DROP COLUMN `thumbnail_url`;
```

### 7.2 Down migration

File: `backend/migrations/000003_remove_program_thumbnail.down.sql`

```sql
ALTER TABLE `programs` ADD COLUMN `thumbnail_url` varchar(512) DEFAULT NULL;
```

The down migration restores only the nullable column. It does not restore historical values.

## 8. Data Flow After Change

```text
Program form
  -> frontend Program DTO without thumbnail_url
  -> POST/PUT /api/programs
  -> strict JSON decoder
  -> ProgramRequest without thumbnail_url
  -> entity.Program without thumbnail_url
  -> repository
  -> programs table without thumbnail_url
```

A legacy body containing `thumbnail_url` stops at strict decoding and returns `400 invalid_body`.

## 9. Verification Plan

### Frontend

- Confirm no active `thumbnail_url` reference remains in Program form, types, DTOs, or service payload.
- Run `pnpm build` from `frontend/`.

### Backend

- Confirm Program create/update rejects a body containing `thumbnail_url` before writing to the repository.
- Confirm a valid Program create/update body without `thumbnail_url` still succeeds.
- Run `gofmt -l .`, `go vet ./...`, `go build ./...`, and `go test ./...` from `backend/`.

### Database

- Apply the new migration and confirm `programs.thumbnail_url` is absent.
- Run the down migration in a disposable database and confirm the nullable column is restored.
- Confirm rollback does not imply restoration of old thumbnail data.

## 10. Deployment Checklist

1. Back up the database according to normal deployment procedure, while acknowledging that thumbnail values are intentionally not restorable by the down migration.
2. Deploy the migration, backend, and frontend as one hard-cutover release.
3. Verify Program create/edit with a payload that omits `thumbnail_url`.
4. Verify a legacy payload containing `thumbnail_url` returns `400 invalid_body`.
5. Confirm no Program UI displays or accepts Thumbnail URL.
