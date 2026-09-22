# Design: Participant Form Validation, Phone E.164 Storage & WhatsApp Consent Fix

**Date:** 2026-09-22
**Status:** Approved
**Scope:** Participant create/edit forms (`/admin/participants/new` + session `ParticipantFormModal`), participant DTO/usecase validation on the backend, a shared phone utility package, and de-hardcoding the Indonesia assumption from the WhatsApp consent pipeline. No DB migration.

## Problem

1. **Hardcoded age default.** The age field initializes to `PARTICIPANT_AGE.DEFAULT` (`6`), so a submit-blind user records age 6 without ever typing it. The placeholder also renders `6`, blurring value vs. hint.
2. **Rigid age window.** Frontend hard-rejects any age outside 4–10 (`PARTICIPANT_AGE.MIN/MAX`) on both participant forms; the backend only checks `gte=0`. The product wants **no** age cap/floor restriction, but still needs anomaly protection (a 90-year-old or 2-year-old should be confirmable, not silently accepted or blocked).
3. **Weak field validation — dirty data reaches the database.**
   - Backend `CreateParticipantRequest`: `ChildName`/`ParentName` only `required` (no length, no "is this a name"), `ParentPhone` only `required`, `ParentEmail` has **no** `email` tag. `UpdateParticipantRequest` has **no validation at all**.
   - Frontend checks name/phone only for non-empty; email format is checked FE-side only.
4. **Indonesia hardcodes in the WhatsApp consent path** (`consent_handler.go`):
   - `isValidWhatsAppPhone()` accepts only numbers whose digits start with `0` or `62` → international parents are **silently skipped** in bulk sends.
   - `normalizeWhatsAppPhone()` rewrites a leading `0` to `62` before building `<digits>@c.us` for both the batch worker and `SendSingle`.
   - Participant `parent_phone` is stored raw as typed (`0812…`, `62812…`, `+62 812-…` all coexist), so the gateway has to guess the country and duplicate detection (`LOWER(child_name), LOWER(parent_phone)`) misses matches.
   - The OpenWA gateway itself (`messaging/whatsapp.go`) is country-agnostic — it forwards `chatId` verbatim; the hardcodes live in the consent handler.

## Decisions (user-confirmed)

| Topic | Decision |
|---|---|
| Age default | **Remove** `DEFAULT: 6`; create form starts empty; placeholder `Contoh: 6` |
| Age hard bounds | **1–120** integer, enforced FE **and** BE (0 and >120 rejected outright) |
| Age anomaly guard | Confirmation modal when age **< 4 or > 17** — not a rejection; message echoes the entered age |
| Age bounds in UI | No product window (4–10 gone); `min`/`max` HTML attrs mirror the hard 1–120 |
| Name rules | After trim: **2–200 chars, ≥1 letter** (rejects `123`, `---`, whitespace-only; allows `Budi (Jr.)`) |
| Phone validation split | **Backend strict** (library), **frontend cleanup-only** — no FE format/length rejection beyond *required* |
| Phone entry UX | **Uniform `+<country code>` prefix inside the input**; user types the national number **without** `08` (e.g. `8895551234`); a single typed leading `0` is auto-stripped |
| Country picker | All countries, default 🇮🇩 +62; data from `libphonenumber-js`, names via `Intl.DisplayNames('id')`, flag = emoji from ISO code |
| Phone storage | **E.164** (`+628895551234`) — single uniform format; backend normalizes on every write path |
| Migration | **None** — project is pre-release/dev; database content is expected to become uniformly clean going forward. A backend function handles any raw input at write time |
| Consent hardcode | Replaced by the shared backend phone function (any valid country reaches WhatsApp; chat ID = E.164 digits + `@c.us`) |
| Email | FE: trim only (no format rule); BE: `omitempty,email,max=200` |
| Out of scope | `users.phone` / `normalizePhone()` (FE, hardcodes `+62`) — not part of the participant/consent flow; consent page UI unchanged (retry/force already exist) |

## Design

### 1. Frontend

**1a. Constants** — `frontend/src/core/constants/participant.ts`

```ts
export const PARTICIPANT_AGE = {
  HARD_MIN: 1, HARD_MAX: 120,   // hard reject (FE + BE)
  SOFT_MIN: 4, SOFT_MAX: 17,    // outside → confirmation modal
} as const
export const PARTICIPANT_AGE_ERROR = 'Usia anak harus 1–120 tahun'
```
`DEFAULT` and the old 4–10 window are removed everywhere.

**1b. Shared validation util** — `frontend/src/core/utils/participantValidation.ts` (new)

- `validateParticipantForm(state): ParticipantFormErrors` — single source for both forms (removes the duplicated `validate()` logic in `ParticipantFormPage` and `ParticipantFormModal`):
  - `child_name` / `parent_name`: non-empty (`… harus diisi`), then 2–200 chars + ≥1 Unicode letter (`… harus 2–200 karakter dan mengandung huruf`).
  - `child_age`: required, integer, `HARD_MIN..HARD_MAX` → `PARTICIPANT_AGE_ERROR`.
  - `parent_phone`: non-empty only (`No. HP orang tua harus diisi`) — format is the backend's job.
  - `parent_email`: trimmed, **no format check** (backend validates).
  - `school_name`: max 200 only.
- `needsAgeConfirm(age): boolean` — `age < SOFT_MIN || age > SOFT_MAX`.

**1c. Age field & confirmation modal** — `ParticipantFormPage.tsx` + `ParticipantFormModal.tsx`

- `emptyForm.child_age = ''` (modal state becomes string-based like the page; parsed to number on submit). Placeholder `Contoh: 6`, hint `Usia dalam tahun (1–120)`, `min={1} max={120}` (form is `noValidate`, so these are hints only).
- Submit flow: `validate()` → if `needsAgeConfirm(age)` open a confirmation `Modal` → **Kembali** (close, stay on form) / **Ya, lanjutkan** (proceed with the existing submit path). Applies to create **and** edit in both forms.
- Modal copy: title `Konfirmasi Usia`; body `Usia {n} tahun terlihat tidak biasa. Apakah benar usia anak {nama} {n} tahun?`
- The session modal stacks this modal alongside its existing migrate-confirm modal.

**1d. Phone input** — `frontend/src/shared/components/ui/PhoneInput.tsx` (new)

- Layout: `<country select> <static "+62" adornment> <digit input>`.
- Select: `getCountries()` + `getCountryCallingCode()` from `libphonenumber-js`, country names via `new Intl.DisplayNames(['id'], { type: 'region' })`, flag emoji from ISO code; default `ID`.
- Input: national significant number only. Placeholder `8123456789`, hint `Tanpa 0 di depan — kode negara otomatis`.
- Cleanup on change (no strict rules): strip non-digits, strip **one** leading `0`.
- Value contract: emits E.164 (`+<cc><national>`). On load, a `+…` value is split back into select + national part (round-trip safe); a leading `0` value (legacy) displays with `0` stripped and re-saves normalized.
- API: label/required/error props mirroring the existing `Input`, so both forms swap `<Input type="tel">` for `<PhoneInput>` without layout changes.
- Helper functions live in `core/utils/phone.ts` (`combinePhone(national, cc)`, `detectCountry(e164)`); the existing `normalizePhone` stays untouched for the users feature.

**1e. Dependency** — `frontend/package.json`: add `libphonenumber-js` (route is lazy-loaded; loaded on demand).

### 2. Backend

**2a. Phone utility package** — `backend/internal/pkg/phoneutil/phone.go` (new; dependency `github.com/nyaruka/phonenumbers`)

- `Normalize(raw string) (string, error)` — trims; parses **without region when input starts with `+`**, else with default region `ID` (a convenience for locally typed numbers coming from API/import, not an acceptance restriction — any `+<cc>…` passes); requires `IsValidNumber`; returns E.164. Used for validation (tag) and for write-time normalization.
- `WhatsAppDigits(raw string) (string, error)` — `Normalize`, then strip `+`; result feeds `<digits>@c.us`.
- This is the **only** place phone parsing logic lives.

**2b. Validator registration** — `backend/internal/delivery/http/middleware/validator.go`

Register two custom tags in `NewValidator()`:
- `phone` → `phoneutil.Normalize` succeeds;
- `hasletter` → ≥1 `unicode.IsLetter` rune.

**2c. DTO tags** — `backend/internal/delivery/http/dto/session.go`

Create (`CreateParticipantRequest` — also used by bulk import via `dive`):

| Field | Tag |
|---|---|
| `ChildName`, `ParentName` | `required,min=2,max=200,hasletter` |
| `ChildAge` | `gte=1,lte=120` |
| `ParentPhone` | `required,phone` |
| `ParentEmail` | `omitempty,email,max=200` |
| `SchoolName` | `omitempty,max=200` |

Update (`UpdateParticipantRequest`): same tags prefixed `omitempty` (empty = not provided; keeps the handler's `ChildAge != 0` → `hasAge` semantics intact).

**2d. Write-time sanitation** — `backend/internal/usecase/session.go`

In `CreateParticipant`, `UpdateParticipant`, and `ImportParticipants`, before the repository write: `strings.TrimSpace` on child/parent/school names and email; `phoneutil.Normalize` on the phone (400 `validation_error` if it fails — belt-and-braces for raw API calls). Guarantees uniform E.164 storage regardless of client.

**2e. Consent pipeline de-hardcode** — `backend/internal/delivery/http/handler/consent_handler.go`

- Delete `isValidWhatsAppPhone` and `normalizeWhatsAppPhone`.
- Eligibility filter: participant qualifies when `phoneutil.WhatsAppDigits(p.ParentPhone)` succeeds — any country, no silent Indonesia-only skip.
- Chat ID (both `processWhatsAppBatch` and `SendSingle`): `phoneutil.WhatsAppDigits(phone) + "@c.us"`.
- Retry semantics untouched: bulk `?force=true` and per-row "Kirim ulang" (`SendSingle`) reprocess as before — they now work reliably because stored numbers are clean E.164.

### 3. Data flow (after)

```
PhoneInput (+62 | 8895551234)
  → FE combine → "+628895551234"
  → POST/PUT participant DTO   [BE tag `phone` → phoneutil.Normalize → 400 if invalid]
  → usecase sanitize (trim + Normalize) → DB (uniform E.164)
Consent send → phoneutil.WhatsAppDigits → "<digits>@c.us" → OpenWA gateway (verbatim forward)
```

## Error handling

- **FE inline** (red field error): empty required fields, name length/letter rule, age hard bounds.
- **FE modal**: age anomaly confirmation — cancel never submits, keeps form state.
- **BE 400** `validation_error` via DTO tags → surfaced as the existing generic Indonesian toast through `friendlyError` (no new envelope behavior).
- Consent: invalid stored phone → participant skipped by eligibility (as today, but now library-based and country-agnostic); send failures keep the existing per-row `failed` SSE status + retry buttons.

## Testing

**Go** — `backend/tests/participant_validation_test.go` (pure unit, no DB; follows `users_usecase_test.go` patterns; validator via `middleware.NewValidator()`):
- Age: `0` and `121` rejected; `1` and `120` accepted (create tag); update tag skips `0`.
- Name: rejected — `123`, `"   "`, `A` (1 char); accepted — `Ab`, `Budi (Jr.)`; length boundary at 201 chars rejected.
- Phone: `08123123456` valid (ID fallback), `+1 650-555-1234` valid, `abc` / `+999000000` invalid.
- Email: `bukan-email` rejected; empty accepted (optional).
- `phoneutil`: `Normalize("08123123456") == "+628123123456"`; `WhatsAppDigits("+1 650-555-1234") == "16505551234"`.

**Vitest** (already set up in repo):
- `participantValidation`: hard bounds 1/120; soft boundaries 3→confirm, 4→pass, 17→pass, 18→confirm; name rules; phone/email "cleanup-only" (no format error thrown for odd but non-empty input).
- `combinePhone`/`detectCountry`: `('8895551234', ccID)` → `+628895551234`; `('0889…', ccID)` → leading `0` stripped; `detectCountry('+628895551234')` → `{cc: '+62', national: '8895551234'}`.

## Verification

1. `cd frontend && pnpm build && pnpm test` (tsc gate + vitest).
2. `cd backend && gofmt -l .` (empty) `&& go vet ./... && go build ./... && go test ./...`.
3. UI smoke on the real page (`/admin/participants/new`): age field empty with placeholder; submit age `2` → confirmation modal (Kembali restores form, Ya proceeds); age `0` → inline hard error; phone `08123456789` with 🇮🇩 saves as `+628123456789`; invalid email rejected by backend toast.
