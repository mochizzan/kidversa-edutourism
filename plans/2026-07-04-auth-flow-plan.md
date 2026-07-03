# Auth Flow Implementation Plan

| Field | Value |
|---|---|
| **Title** | Auth Flow — Login, Register, Protected Routes, Session Management |
| **Date** | 2026-07-04 |
| **Status** | EXECUTED |
| **Requested By** | User |
| **Prepared By** | System Analyst (Plan Builder) |

---

## 1. Overview

Implementasi lengkap alur autentikasi untuk Kidversa Edutourism admin panel. Termasuk mock auth service, form validation robust, route protection, dan session management.

---

## 2. Goals

| # | Goal | Success Criteria |
|---|---|---|
| G-1 | Login/Register functional | User bisa login dan register dengan mock data |
| G-2 | Route protection | Semua `/admin/*`, `/fasilitator/*`, `/parent/*` routes tidak bisa diakses tanpa login |
| G-3 | Session persistence | Token disimpan di sessionStorage, survive page refresh |
| G-4 | Robust validation | Anti-brute-force, honeypot, password strength check |
| G-5 | Role-based redirect | Login → redirect berdasarkan role (admin/fasilitator/parent) |
| G-6 | User info display | AdminLayout tampilkan nama user + tombol logout |

---

## 3. User Entity (from ERD)

Basis validasi diambil dari tabel `users` pada ERD v1.0:

| Field | Type | Constraint | Frontend Validation |
|---|---|---|---|
| `id` | UUID | PK | Auto-generated |
| `tenant_id` | UUID | FK → tenants | Auto-assigned |
| `email` | VARCHAR(255) | UNIQUE per tenant | Required, format email valid |
| `password_hash` | VARCHAR(255) | NOT NULL | Required, min 8 chars, 1 uppercase, 1 lowercase, 1 number |
| `role` | ENUM | NOT NULL | `SUPER_ADMIN` \| `ADMIN_WISATA` \| `KOORDINATOR` \| `FASILITATOR` |
| `name` | VARCHAR(100) | NOT NULL | Required, min 2 chars, max 100 |
| `phone` | VARCHAR(20) | NULL | Optional, format Indonesia |
| `is_active` | BOOLEAN | DEFAULT true | — |

---

## 4. Mock Accounts Configuration

File: `core/config/mock-accounts.ts`

| Email | Password | Role | Name |
|---|---|---|---|
| `admin@kidversa.id` | `password123` | `ADMIN_WISATA` | Admin Wisata |
| `koordinator@kidversa.id` | `password123` | `KOORDINATOR` | Koordinator Program |
| `f1@kidversa.id` | `password123` | `FASILITATOR` | Fasilitator Sapi |

**Note**: Password di config hanya untuk mock. Production akan pakai bcrypt hash.

---

## 5. Auth Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      APP START                          │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  Check sessionStorage      │
        │  for access_token          │
        └─────────────┬───────────────┘
                      │
              ┌───────┴───────┐
              │               │
         Token Found      No Token
              │               │
              ▼               ▼
    ┌─────────────────┐  ┌──────────────┐
    │ Verify token    │  │ Redirect to  │
    │ (mock: always   │  │ /auth/login  │
    │  valid if exist)│  └──────────────┘
    └────────┬────────┘
             │
      ┌──────┴──────┐
      │             │
   Valid        Invalid/Expired
      │             │
      ▼             ▼
┌──────────┐  ┌──────────────────┐
│ Load user│  │ Clear sessionStorage│
│ from store│  │ Show toast "Sesi  │
│ → Dashboard│ │ expired"         │
└──────────┘  │ → /auth/login    │
              └──────────────────┘
```

---

## 6. Login Flow

```
┌─────────────────────────────────────────────────────────┐
│                    LOGIN PAGE                           │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  User enters email + password│
        │  + honeypot field (must be   │
        │  empty)                       │
        └─────────────┬───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  Check rate limit            │
        │  (max 5 attempts / 5 min)    │
        └─────────────┬───────────────┘
                      │
              ┌───────┴───────┐
              │               │
         Under Limit      Over Limit
              │               │
              ▼               ▼
    ┌─────────────────┐  ┌──────────────────┐
    │ Validate form   │  │ Show error:      │
    │ (zod schema)    │  │ "Terlalu banyak  │
    └────────┬────────┘  │  percobaan. Coba  │
             │           │  lagi dalam X     │
      ┌──────┴──────┐    │  menit"           │
      │             │    └──────────────────┘
   Valid        Invalid
      │             │
      ▼             ▼
┌──────────┐  ┌──────────────┐
│ Call mock│  │ Show field   │
│ auth.login│ │ errors       │
└─────┬────┘  └──────────────┘
      │
      ▼
┌─────────────────────────────┐
│ Check if user.is_active     │
└─────────────┬───────────────┘
              │
      ┌───────┴───────┐
      │               │
   Active         Inactive
      │               │
      ▼               ▼
┌──────────┐  ┌──────────────────┐
│ Store    │  │ Show error:      │
│ token in │  │ "Akun tidak      │
│ session- │  │  aktif. Hubungi   │
│ Storage  │  │  admin"          │
│ Store    │  └──────────────────┘
│ user in  │
│ zustand  │
│          │
│ Redirect │
│ by role  │
└──────────┘
```

### Role-Based Redirect

| Role | Redirect To |
|---|---|
| `SUPER_ADMIN` | `/admin/dashboard` |
| `ADMIN_WISATA` | `/admin/dashboard` |
| `KOORDINATOR` | `/admin/dashboard` |
| `FASILITATOR` | `/fasilitator/dashboard` |
| `PARENT` | `/parent/dashboard` |

---

## 7. Register Flow

```
┌─────────────────────────────────────────────────────────┐
│                   REGISTER PAGE                         │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  User fills:                │
        │  - Name (required)          │
        │  - Email (required)         │
        │  - Password (required)      │
        │  - Confirm Password         │
        │  - Role (select)            │
        │  - Terms checkbox           │
        │  - Honeypot (hidden)        │
        └─────────────┬───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  Validate with zod          │
        │  - Email format             │
        │  - Password strength        │
        │  - Confirm match            │
        │  - Name length              │
        │  - Honeypot empty           │
        └─────────────┬───────────────┘
                      │
              ┌───────┴───────┐
              │               │
          Valid           Invalid
              │               │
              ▼               ▼
    ┌─────────────────┐  ┌──────────────┐
    │ Check if email  │  │ Show field   │
    │ already exists  │  │ errors       │
    └────────┬────────┘  └──────────────┘
             │
      ┌──────┴──────┐
      │             │
   Available    Exists
      │             │
      ▼             ▼
┌──────────┐  ┌──────────────────┐
│ Create   │  │ Show error:      │
│ new user │  │ "Email sudah     │
│ in mock  │  │  terdaftar"      │
│ storage  │  └──────────────────┘
│          │
│ Redirect │
│ to login │
│ + toast  │
│ success  │
└──────────┘
```

---

## 8. File Specifications

### 8.1 NEW: `core/config/mock-accounts.ts`

**Purpose**: Centralized mock account configuration

```typescript
export interface MockAccount {
  id: string
  tenant_id: string
  email: string
  password: string  // plain text for mock only
  role: UserRole
  name: string
  phone?: string
  is_active: boolean
}

export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    id: 'u-1',
    tenant_id: 't-1',
    email: 'admin@kidversa.id',
    password: 'password123',
    role: 'ADMIN_WISATA',
    name: 'Admin Wisata',
    phone: '081234567890',
    is_active: true,
  },
  // ... other accounts
]

export const MOCK_DEFAULT_PASSWORD = 'password123'
```

### 8.2 NEW: `core/services/mock/auth.ts`

**Purpose**: Mock AuthService implementation

**Methods**:
- `login(data: LoginDTO): Promise<LoginResponse>`
  - Find account by email
  - Compare password (plain text for mock)
  - Check `is_active`
  - Generate mock JWT token
  - Return `{ access_token, refresh_token, user }`

- `register(data: CreateUserDTO): Promise<User>`
  - Check email uniqueness
  - Create new user with generated UUID
  - Store in localStorage via mockStorage
  - Return created user

- `getMe(): Promise<User>`
  - Read token from sessionStorage
  - Find user by stored user_id
  - Return user data

- `logout(): Promise<void>`
  - Clear sessionStorage
  - Return success

### 8.3 NEW: `core/stores/authStore.ts`

**Purpose**: Zustand store for auth state

```typescript
interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean

  login: (email: string, password: string) => Promise<void>
  register: (data: CreateUserDTO) => Promise<void>
  logout: () => Promise<void>
  checkSession: () => Promise<void>
  setUser: (user: User) => void
}
```

**Behavior**:
- `login()`: Call mock auth, store token in sessionStorage, update state
- `register()`: Call mock auth, redirect to login
- `logout()`: Clear sessionStorage, reset state
- `checkSession()`: On app init, verify token exists and valid

### 8.4 NEW: `core/hooks/useAuth.ts`

**Purpose**: Convenience hook to access auth store

```typescript
export const useAuth = () => {
  const { user, isAuthenticated, isLoading, login, logout, register } = useAuthStore()
  return { user, isAuthenticated, isLoading, login, logout, register }
}
```

### 8.5 NEW: `shared/components/auth/ProtectedRoute.tsx`

**Purpose**: Route guard component

**Props**:
- `children: React.ReactNode`
- `allowedRoles?: UserRole[]` (optional, if not provided → any authenticated user)

**Behavior**:
1. Check `isAuthenticated` from auth store
2. If not authenticated → redirect to `/auth/login` with `returnUrl`
3. If `allowedRoles` provided → check if user.role is in allowedRoles
4. If role not allowed → redirect to `/` with toast "Akses ditolak"
5. If loading → show `<LoadingSpinner />`
6. If passes → render `children`

### 8.6 UPDATE: `features/auth/pages/LoginPage.tsx`

**Changes**:
- Replace `useState` with `react-hook-form`
- Add zod validation schema
- Add honeypot hidden field
- Add rate limiting logic (5 attempts / 5 min)
- Add demo account hint (small text below form)
- Add loading state on submit
- Add error display (field errors + general errors)
- Handle inactive user error

**Validation Schema**:
```typescript
const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  honeypot: z.string().max(0, 'Robot terdeteksi'), // must be empty
})
```

**Demo Hint UI**:
```tsx
<div className="mt-4 p-3 bg-primary-50 rounded-lg">
  <p className="text-xs text-primary-700">
    <strong>Demo:</strong> admin@kidversa.id / password123
  </p>
</div>
```

### 8.7 UPDATE: `features/auth/pages/RegisterPage.tsx`

**Changes**:
- Replace `useState` with `react-hook-form`
- Add zod validation schema
- Add honeypot hidden field
- Add password strength indicator
- Add loading state on submit
- Handle success → redirect to login with toast

**Validation Schema**:
```typescript
const registerSchema = z.object({
  name: z.string()
    .min(2, 'Nama minimal 2 karakter')
    .max(100, 'Nama maksimal 100 karakter'),
  email: z.string().email('Format email tidak valid'),
  password: z.string()
    .min(8, 'Password minimal 8 karakter')
    .regex(/[A-Z]/, 'Harus ada huruf besar')
    .regex(/[a-z]/, 'Harus ada huruf kecil')
    .regex(/[0-9]/, 'Harus ada angka'),
  confirmPassword: z.string(),
  role: z.enum(['ADMIN_WISATA', 'KOORDINATOR', 'FASILITATOR']),
  terms: z.literal(true, { errorMap: () => ({ message: 'Wajib menyetujui syarat & ketentuan' }) }),
  honeypot: z.string().max(0, 'Robot terdeteksi'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Password tidak cocok',
  path: ['confirmPassword'],
})
```

### 8.8 UPDATE: `app/router.tsx`

**Changes**:
- Import `ProtectedRoute`
- Wrap admin/fasilitator/parent routes with `ProtectedRoute`
- Add `SuspenseWrapper` loading state
- Add `returnUrl` support in login redirect

**Structure**:
```tsx
<Route path="/" element={<Navigate to="/auth/login" replace />} />
<Route path="/auth" element={<AuthLayout />}>
  <Route path="login" element={<LoginPage />} />
  <Route path="register" element={<RegisterPage />} />
</Route>
<Route element={<ProtectedRoute />}>
  <Route path="/admin" element={<AdminLayout />}>
    <Route path="dashboard" element={<DashboardPage />} />
    {/* ... other admin routes */}
  </Route>
</Route>
```

### 8.9 UPDATE: `shared/layouts/AdminLayout.tsx`

**Changes**:
- Import `useAuth` hook
- Add user info display in sidebar header (name, role badge)
- Add logout button
- Handle logout → clear session → redirect to login

**Sidebar Header**:
```tsx
<div className="p-4 border-b">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
      <span className="text-white font-bold">{user.name[0]}</span>
    </div>
    <div>
      <p className="font-medium text-gray-800">{user.name}</p>
      <p className="text-xs text-gray-500">{user.role}</p>
    </div>
  </div>
  <button onClick={handleLogout} className="mt-3 w-full btn-secondary">
    Logout
  </button>
</div>
```

---

## 9. Anti-Abuse Features

### 9.1 Rate Limiting (Brute Force Protection)

**Storage**: `sessionStorage` key `kidversa_login_attempts`

**Logic**:
```typescript
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION = 5 * 60 * 1000 // 5 minutes

// On failed login:
// 1. Increment attempt count
// 2. If count >= MAX_ATTEMPTS → set lockout timestamp
// 3. Show remaining attempts or lockout timer

// On successful login:
// 1. Clear attempt count
// 2. Clear lockout timestamp
```

### 9.2 Honeypot Field

**Implementation**:
- Hidden input field with `position: absolute` + `opacity: 0` + `pointer-events: none`
- Field name should be realistic (e.g., `website`, `url`, `fax`)
- If field has any value → reject submission silently

### 9.3 Password Strength Indicator

**UI Component**:
```tsx
<div className="flex gap-1 mt-1">
  <div className={`h-1 flex-1 ${strength >= 1 ? 'bg-red-500' : 'bg-gray-200'}`} />
  <div className={`h-1 flex-1 ${strength >= 2 ? 'bg-orange-500' : 'bg-gray-200'}`} />
  <div className={`h-1 flex-1 ${strength >= 3 ? 'bg-yellow-500' : 'bg-gray-200'}`} />
  <div className={`h-1 flex-1 ${strength >= 4 ? 'bg-green-500' : 'bg-gray-200'}`} />
</div>
```

**Strength Calculation**:
- 1: Has lowercase
- 2: + Has uppercase
- 3: + Has number
- 4: + Has special char or length >= 12

---

## 10. Session Management

### 10.1 Token Storage

| Item | Storage | Key |
|---|---|---|
| Access Token | sessionStorage | `kidversa_access_token` |
| Refresh Token | sessionStorage | `kidversa_refresh_token` |
| User Data | sessionStorage | `kidversa_user` |
| Login Attempts | sessionStorage | `kidversa_login_attempts` |
| Lockout Until | sessionStorage | `kidversa_lockout_until` |

### 10.2 Token Verification (Mock)

For mock implementation, token is valid if:
1. Token exists in sessionStorage
2. User data exists in sessionStorage
3. Token format is valid (mock JWT structure)

### 10.3 Session Expiry Handling

When token is invalid/expired:
1. Clear all auth data from sessionStorage
2. Show toast: "Sesi telah berakhir. Silakan login kembali."
3. Redirect to `/auth/login`

---

## 11. Error Messages

| Error | Message |
|---|---|
| Invalid credentials | Email atau password salah |
| Account inactive | Akun tidak aktif. Hubungi administrator |
| Email exists | Email sudah terdaftar |
| Rate limited | Terlalu banyak percobaan. Coba lagi dalam {minutes} menit |
| Session expired | Sesi telah berakhir. Silakan login kembali |
| Access denied | Akses ditolak. Anda tidak memiliki hak akses |
| Honeypot detected | Robot terdeteksi |
| Password mismatch | Password tidak cocok |
| Terms required | Wajib menyetujui syarat & ketentuan |

---

## 12. Dependencies

| Package | Purpose |
|---|---|
| `react-hook-form` | Form state management |
| `zod` | Schema validation |
| `@hookform/resolvers` | Zod resolver for react-hook-form |
| `zustand` | State management (auth store) |
| `lucide-react` | Icons |
| `sonner` | Toast notifications (already in project) |

---

## 13. Implementation Order

| Step | Task | Depends On |
|---|---|---|
| 1 | Create `core/config/mock-accounts.ts` | — |
| 2 | Create `core/services/mock/auth.ts` | Step 1 |
| 3 | Create `core/stores/authStore.ts` | Step 2 |
| 4 | Create `core/hooks/useAuth.ts` | Step 3 |
| 5 | Create `shared/components/auth/ProtectedRoute.tsx` | Step 4 |
| 6 | Update `features/auth/pages/LoginPage.tsx` | Step 4 |
| 7 | Update `features/auth/pages/RegisterPage.tsx` | Step 4 |
| 8 | Update `app/router.tsx` | Step 5, 6, 7 |
| 9 | Update `shared/layouts/AdminLayout.tsx` | Step 4 |
| 10 | Build & test all flows | All |

---

## 14. Testing Checklist

| # | Scenario | Expected |
|---|---|---|
| T-1 | Login with valid credentials | Redirect to dashboard by role |
| T-2 | Login with invalid password | Error: "Email atau password salah" |
| T-3 | Login with inactive account | Error: "Akun tidak aktif" |
| T-4 | Login 5 times with wrong password | Lockout 5 minutes |
| T-5 | Refresh page while logged in | Stay logged in |
| T-6 | Refresh page while logged out | Redirect to login |
| T-7 | Access /admin without login | Redirect to /auth/login |
| T-8 | Register new account | Redirect to login with success toast |
| T-9 | Register with existing email | Error: "Email sudah terdaftar" |
| T-10 | Register with weak password | Validation error |
| T-11 | Logout | Clear session, redirect to login |
| T-12 | Submit with honeypot filled | Silent rejection |

---

## 15. Success Criteria

| # | Criteria | Verification |
|---|---|---|
| SC-1 | All mock accounts can login | Manual test each account |
| SC-2 | All protected routes require auth | Try accessing without login |
| SC-3 | Session survives page refresh | Login → refresh → still logged in |
| SC-4 | Rate limiting works | 5 wrong attempts → locked out |
| SC-5 | Form validation shows errors | Submit empty form → see errors |
| SC-6 | Logout clears session | Logout → check sessionStorage empty |
| SC-7 | Build passes with no errors | `pnpm run build` succeeds |

---

**Plan Version**: 1.0
**Last Updated**: 2026-07-04
**Status**: PLANNED → EXECUTED
