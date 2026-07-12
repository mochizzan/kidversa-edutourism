# CONTRACT — Panduan Sub-Agent Implementasi Backend Kidversa

Backend ini sudah memiliki **fondasi + template Auth lengkap & teruji**. Sub-agent
menambahkan resource handlers tanpa mengubah file yang sudah ada (hindari bentrok).

## Aturan Wajib (sudah terbukti compile + test PASS)
- **Module path:** `kidversa-edutourism-backend`
- **Go 1.26.4, Echo v5.2.1** (PERHATIAN: v5 beda dari v4!):
  - Handler/middleware signature: `func(c *echo.Context) error` — **pointer** Context.
  - Middleware: `func(next echo.HandlerFunc) echo.HandlerFunc` dengan `c *echo.Context`.
  - `c.Bind/Bind`, `c.Validate`, `c.JSON(code, i)`, `c.NoContent`, `c.RealIP`,
    `c.Set/Get`, `c.Cookie`, `c.SetCookie`, `c.Request()`, `c.Response()` (http.ResponseWriter).
  - `HTTPErrorHandler func(c *Context, err error)` — param order berbeda dari v4!
  - Echo v5 **TIDAK** punya `e.Shutdown()` — pakai `&http.Server{Handler: e}.Shutdown(ctx)`.
  - Tidak ada `middleware.NewValidator()` bawaan — validator ada di
    `internal/delivery/http/middleware` (`NewValidator()` / `SetupValidator(e)`).
- **Response:** SELALU pakai `appresp.OK / OKWithMeta / Created / NoContent / Fail / FailMsg`
  (di `internal/pkg/response`). Signature: `func(c *echo.Context, ...)`.
- **Error:** gunakan `apperrors.New/Unauthorized/Forbidden/NotFound/Conflict/BadRequest/Internal`
  (di `internal/pkg/errors`) — otomatis jadi envelope `{error:{code,message}}` via ErrorHandler.
- **Entity:** field sudah didefinisikan di `internal/domain/entity/*.go` (sumber = frontend
  `entities.ts`). TAMBAH field di sana bila ada yang kurang, lalu tambah GORM model & mapper.
- **ID:** semua `string` (CHAR(36) UUID). Generate via `persistence.newUUID()` atau `uuid.NewString()`.
- **Tenant isolation:** pakai `appmiddleware.TenantScope()` + `appmiddleware.GetTenantID(c)`.
  Entity tanpa `tenant_id` (GroupStageProgress, SessionStage, Assessment, TimelineEvent,
  ConsentLog, ParticipantMission) → scope lewat join session→program→tenant.
- **Auth:** `appmiddleware.JWTAuth(jm, sseCookieName)` lalu `RequireRole(...)`.

## Pola per Resource (template = Auth)
Untuk resource X (mis. Users, Programs, ...), buat FILE terpisah (jangan gabung):
1. `internal/domain/repository/x.go` — interface `XRepository` (Create/GetByID/GetByEmail?/List/Update/Delete).
   List terima `page, limit int` + filter struct, return `*repository.Paginated[T]`.
2. `internal/infrastructure/persistence/x_model.go` — GORM model `XModel{ entity.X; DeletedAt gorm.DeletedAt }`
   + `TableName()`, `BeforeCreate` (generate UUID), `ToEntity()`, `xModelFromEntity()`.
3. `internal/infrastructure/persistence/x_repo.go` — impl `XRepository` (copy pola `user_repo.go`).
4. `internal/delivery/http/dto/x.go` — request/response structs + `validate:` tags.
5. `internal/delivery/http/handler/x_handler.go` — `XHandler` + method handlers (copy pola `auth_handler.go`).
6. `internal/delivery/http/handler/router_x.go` — `RegisterXRoutes(g *echo.Group, h *XHandler, jm *auth.JWTManager, ...)`.
7. **Daftarkan di `router.go`**: tambah field ke `handler.Registry` + panggil `handler.RegisterXRoutes(...)`
   di `NewRouter`. JANGAN ubah file lain.
8. **Wire di `cmd/server/main.go`**: buat repo + usecase + handler, isi `registry.X`.

## Endpoint (1:1 dengan frontend `types.ts`)
Lihat plan §3. Format: `GET /api/x` (list paginated + filter), `POST /api/x`, `GET/PUT /api/x/:id`,
`DELETE /api/x/:id`, + sub-routes. Path param selalu validate UUID (`uuid.Parse`) → 400.

## DB
- Semua tabel sudah ada di `migrations/000001_init_schema.up.sql` (jalankan `go run ./cmd/migrate up`).
- Soft-delete via `deleted_at` (GORM `gorm.DeletedAt` di model).
- Connection pool sudah di-set di `persistence.OpenDB`.

## Test
- Minimal 1 handler test (httptest + fake repo) + 1 usecase test, copy pola `auth_handler_test.go`.
- Jalankan: `go test ./internal/delivery/http/handler/...` (pastikan PASS sebelum selesai).

## JANGAN
- Jangan edit `go.mod` manual (sudah benar). Pakai `go get <mod>@<ver>` bila perlu lib baru.
- Jangan ubah `router.go` selain menambah `RegisterXRoutes` (jangan hapus Auth).
- Jangan hardcode secret/credential.
- Jangan buat file yang bentrok nama dengan sub-agent lain (lihat pembagian task).
