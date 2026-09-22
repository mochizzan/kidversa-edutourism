# Design: Align /admin/users Validation with Participants Form & Register Password Rules

**Date:** 2026-09-23
**Status:** Approved
**Scope:** `UserFormPage` (users/new + users/:id/edit), `ParticipantFormPage` + `ParticipantFormModal` email validation, `RegisterPage`, `ChangePasswordPage`, a new shared frontend validation module, a bug fix in `normalizePhone`, and two backend DTO validation tags. No DB migration, no UI redesign.

## Problem

The user-create form (`/admin/users/new`) diverges from the reference participant form (`/admin/participants/new`) and from the register page:

1. **Phone.** Participants use `PhoneInput` (country picker, E.164 output, required). Users use a plain text `Input`, optional, with **no FE format validation** — and the service-boundary `normalizePhone` force-prefixes `+62` to *any* number, **corrupting non-Indonesian input** (`+6512345678` → `+626512345678`). The backend `CreateUserRequest`/`UpdateUserRequest` carry no `phone` format tag, unlike participant DTOs (`required,phone` / `omitempty,phone`).
2. **Email.** Users validate with an inline `z.string().email()`; participants validate **nothing** FE-side (the code comment says *"school_name & parent_email sengaja TIDAK divalidasi FE"*), so a malformed email on `/admin/participants/new` is only caught by the backend after submit. There is no single shared email rule.
3. **Password.** `registerSchema` and `createUserSchema` happen to duplicate identical rules (min 8 + upper + lower + digit + confirm), but as copy-paste they will drift. `changePasswordSchema.new_password` is **weaker** than both (min 8 only) despite rendering the same `PasswordStrengthBar`.

## Decisions (user-confirmed)

| Topic | Decision |
|---|---|
| Email direction | **Shared validator.** Users/new: **required**. Participants: **optional but format-validated when filled**. Nothing is downgraded. |
| Phone on users/new | **`PhoneInput` + optional** — identical widget/behavior to participants; contract unchanged (backend `phone,omitempty`). Filled ⇒ must be valid E.164. |
| Password | **Extract to shared schema** used by register + users/new + ChangePassword so rules cannot drift. |
| ChangePassword | **Joins shared schema** — `new_password` becomes min 8 + upper + lower + digit (behavior change: strengthened). `old_password` stays `min(8)` (a legitimately weak legacy password must still be verifiable). |
| Testing | Unit tests must be **comprehensive**; **no UI smoke test**. Proof of work = full unit matrix + CI build gates. |

## Design

### 1. Shared validation module — `frontend/src/core/utils/validation.ts` (new)

One source of truth: plain functions are the core; zod schemas only wrap them.

```ts
import { z } from 'zod'
import { isValidPhoneNumber } from 'libphonenumber-js'
import { normalizePhone } from './phone'

// 1. Password rules (zod) — moved verbatim from register/users; messages identical.
export const zPassword = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .regex(/[A-Z]/, 'Harus ada huruf besar')
  .regex(/[a-z]/, 'Harus ada huruf kecil')
  .regex(/[0-9]/, 'Harus ada angka')

// 2. Email core (plain function — also consumed by the manual participant validator).
//    required && empty (after trim) → 'Email wajib diisi'
//    filled && bad format          → 'Format email tidak valid'
//    otherwise                     → undefined
export function emailError(value: string | undefined, opts: { required: boolean }): string | undefined

// 3. Zod wrapper — delegates to emailError; never re-implements the rule.
export function zEmail(opts: { required: boolean }): z.ZodType<string>

// 4. Phone core + wrapper.
//    empty && !required → undefined; empty && required → wajib-isi error.
//    filled → normalizePhone(value) first (legacy '0812…' passes as '+62…';
//    already-E.164 '+…' passes through), then isValidPhoneNumber on the result.
//    invalid → 'Nomor telepon tidak valid'
export function phoneError(value: string | undefined, opts: { required: boolean }): string | undefined
export function zPhone(opts: { required: boolean }): z.ZodType<string | undefined>
```

Key design point: `phoneError` validates the **normalized** value, not the raw one — legacy local numbers in edit forms still pass, while `PhoneInput`-produced E.164 (any country) is checked by `libphonenumber-js` (already a dependency).

### 2. Bug fix — `normalizePhone` in `frontend/src/core/utils/phone.ts`

```ts
// BEFORE: '+6512345678' → digits '6512345678' → no 0/62 prefix strip
//                              → returns '+626512345678'  (CORRUPTED)
// AFTER:  input starting with '+' → trim and return as-is (assumed E.164 from PhoneInput)
```

The legacy `0…` / `62…` → `+62…` handling stays for raw local input from other callers (`authStore.register`). This fix is a prerequisite for putting a country-agnostic `PhoneInput` on users/new.

### 3. `UserFormPage.tsx` — schemas + phone field

```ts
const createUserSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter').max(100, 'Nama maksimal 100 karakter'), // unchanged
  email: zEmail({ required: true }),
  password: zPassword,
  confirmPassword: z.string(),
  phone: zPhone({ required: false }),
  role: z.nativeEnum(UserRole),
}).refine((d) => d.password === d.confirmPassword, { message: 'Password tidak cocok', path: ['confirmPassword'] })

const updateUserSchema = z.object({
  name: /* unchanged */,
  email: zEmail({ required: true }),
  phone: zPhone({ required: false }),
  role: z.nativeEnum(UserRole),
})
// Exported as named exports for the cross-schema parity tests (see Testing).
```

The plain phone `Input` is replaced by `PhoneInput` (the exact component used on participants/new) wrapped in react-hook-form's `Controller`, because `PhoneInput` uses a `(value, onChange)` signature rather than DOM events:

```tsx
<Controller
  control={control}
  name="phone"
  render={({ field, fieldState }) => (
    <PhoneInput
      id="user_phone"
      label="No. HP"
      value={field.value || ''}
      onChange={field.onChange}          // always emits E.164 or ''
      error={fieldState.error?.message}
      hint="Opsional — kode negara otomatis"
      placeholder="8123456789"
    />
  )}
/>
```

Data flow on submit (create & edit): `PhoneInput (E.164)` → `phoneError` passes → `users.ts` service `normalizePhone` (now `+`-aware pass-through) → backend DTO.

### 4. Participants — email format validation when filled

`core/utils/participantValidation.ts`:

- `ParticipantFormErrors` gains `parent_email?: string`.
- In `validateParticipantForm`: trim; **if non-empty**, apply shared `emailError(email, { required: false })`. Empty stays valid (backend `omitempty,email,max=200` contract unchanged).
- Update the stale comment: only `school_name` remains intentionally FE-unvalidated.

Surfaces that display the new error:

1. `ParticipantFormPage.tsx` — the "Email Orang Tua" `Input` gets `error={errors.parent_email}`.
2. `ParticipantFormModal.tsx` — local `FormErrors` interface gains `parent_email?: string`, and its email input gets the `error` prop (it currently cannot show email errors at all).

Unchanged: participant phone (required-only FE; format enforced by the backend `phone` tag — this is the reference behavior users/new now mirrors, minus requiredness), name/age rules, `needsAgeConfirm`.

### 5. Register & ChangePassword

`RegisterPage.tsx` (`registerSchema`):

```ts
email: zEmail({ required: true }),   // was z.string().email('Format email tidak valid')
password: zPassword,                 // identical rules — now imported, not copied
```

One deliberate message change: an **empty** email previously failed with *"Format email tidak valid"* (zod's `email()` rejects `''`); now it says *"Email wajib diisi"* — consistent with users/new. All other fields (`name`, `tenant_id`, `role`, `terms`, confirm-refine) unchanged. `registerSchema` also becomes a named export for parity tests.

`ChangePasswordPage.tsx` (`changePasswordSchema`):

```ts
old_password: z.string().min(8, 'Password lama minimal 8 karakter'), // NOT zPassword — legacy passwords must remain verifiable
new_password: zPassword,   // strengthened: +upper/+lower/+digit; messages now shared
confirm: z.string(),       // + existing local refine ('Konfirmasi password tidak sama') unchanged
```

`PasswordStrengthBar` is already rendered here, so the strengthened rule matches the indicator users see. `changePasswordSchema` becomes a named export for parity tests.

### 6. Backend DTO tags — `backend/internal/delivery/http/dto/user_tenant.go`

```go
Phone string `json:"phone,omitempty" validate:"omitempty,phone"`   // was: no validate tag
```

Applied to `CreateUserRequest` **and** `UpdateUserRequest` — server-side parity with participant DTOs (`phoneutil.Normalize` behind the custom `phone` tag is the second line of defense for raw API calls). Requiredness contract unchanged (still optional).

## Error handling

- **FE inline**: all zod/plain-function errors render under their field via the existing `error={…}` props — Indonesian text, no new patterns.
- **BE envelope**: a rejected `phone`/`email` tag returns 400 `validation_error` through the standard `{ error: { code, message } }` envelope → `friendlyError()` → toast, the exact path participants already use.
- No changes to the response envelope, middleware, or route wiring.

## Testing

No UI smoke test (user decision). Proof of work = comprehensive unit tests + CI build gates.

### 1. `frontend/tests/unit/validation.test.ts` (new) — full matrix

`emailError`
- required + `''` / whitespace-only → `'Email wajib diisi'`
- optional + `''` / whitespace-only → `undefined`
- passes: `budi@mail.com`, `budi.santoso+tag@domain.co.id`, ` budi@mail.com ` (trimmed)
- fails → `'Format email tidak valid'`: `budi@`, `budi@mail`, `@mail.com`, `budi mail.com`, `budi@.com`

`phoneError` / `zPhone`
- optional + `''` → `undefined`; required + `''` → wajib-isi error
- passes: `081234567890` (legacy, normalized first), `+6281234567890`, `+6512345678` (foreign), padded with spaces
- fails → `'Nomor telepon tidak valid'`: `123`, `abc`, `+999`, `0812345` (too short)

`zEmail` — `safeParse` mirrors `emailError` exactly for both required and optional modes

`zPassword`
- fails with each exact message: `<8` chars, no uppercase, no lowercase, no digit
- passes at the boundary: `Aaaaaa1a` (exactly 8 chars)

### 2. `frontend/tests/unit/phone.test.ts` (extended) — the pass-through bug fix

- `normalizePhone('+6512345678')` → `'+6512345678'` (untouched — the bug fix)
- `normalizePhone('+6281234567890')` → unchanged
- `normalizePhone('081234567890')` → `'+6281234567890'` (legacy path intact)
- `normalizePhone('6281234567890')` → `'+6281234567890'`
- `normalizePhone('')` / `undefined` / whitespace → `undefined`

### 3. `frontend/tests/unit/participantValidation.test.ts` (extended)

- `parent_email` empty → no error; valid → no error; `budi@` → format error; padded-with-spaces → trimmed and passes
- Regression: existing name/age/phone-required rules still pass their current cases

### 4. Cross-schema parity tests (the "samakan validasi" guarantee)

`createUserSchema`/`updateUserSchema` (from `UserFormPage`), `registerSchema` (from `RegisterPage`), `changePasswordSchema` (from `ChangePasswordPage`) are exported as named exports purely for tests. The test runs **the same fixtures** through `registerSchema` and `createUserSchema` and asserts **identical outcomes** (pass/fail + error path) for every password and email fixture — if either form's schema is ever edited away from the shared rules, this test goes red. Plus:

- `changePasswordSchema` `new_password` validates under `zPassword` (same fixtures); `old_password` still accepts a weak-but-real password (`abcdefgh`).
- `updateUserSchema` accepts empty phone, rejects filled-but-invalid phone.

### 5. Build gates (not smoke tests)

- Frontend: `pnpm build` (strict `tsc -b` catches the `Controller`/`PhoneInput` wiring) and `pnpm test` (vitest).
- Backend: `gofmt -l .` (empty), `go vet ./...`, `go build ./...`, `go test ./...`.

## Out of scope

- Field `name` rules, role handling, avatar upload on users/new.
- Backend `RegisterRequest` / `LoginRequest` tags (no phone field is rendered on the register page).
- Participant phone FE format validation (backend remains the enforcer — reference behavior is unchanged).
- Login/consent/kiosk flows, response envelope, route wiring, DB migration.
