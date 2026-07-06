# Fix Duplikasi Error & Konsistensi Error Handling — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Menghilangkan duplikasi pesan error, silent errors, dan inkonsistensi penggunaan komponen error (ErrorState vs inline vs toast) di 8 file frontend.

**Architecture:** Setiap file diperbaiki secara independen dengan pola yang sudah mapan di codebase: fetch-error → `<ErrorState>` shared component, action-error → `addToast()`, validasi form → per-field error (bukan banner global). Tidak ada perubahan arsitektural.

**Tech Stack:** React 19 + TypeScript + Tailwind CSS v4

**Berdasarkan audit:** 14 lokasi diperiksa, 8 prioritas aktif untuk diperbaiki (1 sudah disetujui). Semua perubahan kecil dan terisolasi.

---

## Hasil Validasi Audit

| # | Lokasi | Klaim Audit | Status Validasi |
|---|--------|-------------|-----------------|
| 1 | SmartPhotoPage.tsx | Inline + toast duplicate | ✅ KONFIRMASI — 2 pesan paralel di 6 cabang error |
| 2 | RecordingPage.tsx | Inline only, inkonsisten dgn SmartPhoto | ✅ KONFIRMASI — 0 addToast, 100% setError |
| 3 | ChildAssessmentPage.tsx | Silent error (setError tak pernah render) | ✅ KONFIRMASI — ErrorState hanya render saat `!childDetail`, padahal childDetail sudah ada |
| 4 | ConsentFormPage.tsx | Per-field + global banner duplicate | ✅ KONFIRMASI — Input.error + banner global bisa muncul simultan |
| 5 | ChildAssessmentPage.tsx L211-225 | Dua blok error bisa double | ✅ BUKAN MASALAH — guard ordering benar |
| 6 | RecordingDetailPage.tsx | Inline ErrorState markup sendiri | ✅ KONFIRMASI — <ErrorState> shared tersedia tapi tidak dipakai |
| 7 | ConsentMonitorPage.tsx | Fetch-error inline, action-error toast | ✅ BUKAN MASALAH — pola rasional (page-level vs action) |
| 8 | ReportList/Session/ReviewPage | Inline ErrorState markup sendiri | ✅ KONFIRMASI — 3 file pakai custom div, bukan <ErrorState> |
| 9 | FrameUploadPage.tsx | Hook-managed errorMessage/warnings | ✅ BUKAN DUPLIKASI — single source, opsional refactor |
| 10 | SmartPhotoPage.tsx early-return | "more hooks" exception | ❌ FALSE ALARM — semua hooks di atas early return L531, participant dari static seed |

---

## Task 1: SmartPhotoPage.tsx — Hapus Duplikasi Inline + Toast (#1 ✅ sudah disetujui)

**Objective:** Hapus `cameraError` state + inline `<h3>/<p>` di overlay error, pertahankan CTA inline + toast.

**Files:**
- Modify: `frontend/src/features/fasilitator/pages/SmartPhotoPage.tsx`

**Step 1:** Hapus `cameraError` state di line 58 dan semua referensi `setCameraError` di error handler (line 235 `setCameraError(inlineMessage)`).

**Step 2:** Hapus inline message variabel di switch-case (line 200, 207, 213, 219, 225, 231 — semua `inlineMessage = ...`). Pertahankan `toastMessage`.

**Step 3:** Hapus `<p className="text-sm...">{cameraError}</p>` di line 597 pada blok `cameraState === 'error'`.

**Step 4:** Di blok `cameraState === 'denied'` (line 575-591), hapus `<h3>` dan `<p>` — pertahankan hanya ikon + tombol CTA.

**Verifikasi:** `pnpm build` — harus sukses tanpa error. Tidak ada `cameraError` state yang tersisa.

---

## Task 2: RecordingPage.tsx — Tambah Toast + Hapus Inline Text Duplikasi (#2)

**Objective:** Tambah `addToast` di handler error kamera, hapus inline `<h3>/<p>` di overlay error.

**Files:**
- Modify: `frontend/src/features/fasilitator/pages/RecordingPage.tsx`

**Step 1:** Import `useGlobalToast`:
```typescript
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
```

**Step 2:** Di komponen, tambahkan:
```typescript
const { addToast } = useGlobalToast()
```

**Step 3:** Ubah handler error (line 195-208):
```typescript
    } catch (err: unknown) {
      const e = err as DOMException
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setCameraState('denied')
        setError('Izinkan akses kamera dan mikrofon di pengaturan browser')
        addToast({ type: 'error', message: 'Izinkan akses kamera dan mikrofon di pengaturan browser untuk melanjutkan.', duration: 6000 })
      } else if (e.name === 'NotFoundError') {
        setCameraState('not-found')
        setError('Kamera atau mikrofon tidak terdeteksi.')
        addToast({ type: 'error', message: 'Kamera atau mikrofon tidak terdeteksi. Pasang webcam lalu coba lagi.', duration: 6000 })
      } else {
        setFacingMode(f => f === 'environment' ? 'user' : 'environment')
        setCameraState('denied')
        setError('Gagal mengakses kamera atau mikrofon')
        addToast({ type: 'error', message: 'Gagal mengakses kamera atau mikrofon. Periksa koneksi perangkat.', duration: 6000 })
      }
    }
```

**Step 4:** Hapus `<h3>` dan `<p>` di blok `cameraState === 'denied'` (line 482-491) — sisakan hanya ikon + tombol Kembali. Lakukan hal yang sama di blok `cameraState === 'not-found'` (line 495-506).

**Step 5:** Hapus prop `error` dari `<p>` di kedua blok.

**Verifikasi:** `pnpm build` — sukses. Render error kamera hanya menampilkan ikon + tombol Kembali, pesan muncul via toast.

---

## Task 3: ChildAssessmentPage.tsx handleSave — Ganti setError → addToast (#3)

**Objective:** Perbaiki silent error di handleSave dengan menggunakan addToast.

**Files:**
- Modify: `frontend/src/features/fasilitator/pages/ChildAssessmentPage.tsx`

**Step 1:** Import `useGlobalToast`:
```typescript
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
```

**Step 2:** Di komponen, tambahkan:
```typescript
const { addToast } = useGlobalToast()
```

**Step 3:** Ubah catch block di handleSave (line 171-172):
```typescript
    } catch {
      addToast({ type: 'error', message: 'Gagal menyimpan penilaian' })
    }
```

**Verifikasi:** `pnpm build` — sukses. Error menyimpan penilaian muncul sebagai toast, tidak silent.

---

## Task 4: ConsentFormPage.tsx — Hapus Banner Global Duplikasi (#4)

**Objective:** Hapus banner error global untuk validasi form-level, pertahankan per-field error di Input.

**Files:**
- Modify: `frontend/src/features/parent/pages/ConsentFormPage.tsx`

**Step 1:** Hapus block global error banner (line 255-261):
```typescript
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-error bg-error-container rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
```

**Step 2:** Ganti dengan toast untuk submit error (line 61-65):
```typescript
    } catch (err) {
      const message =
        err instanceof Error && err.message === 'INVALID_TOKEN'
          ? 'Tautan tidak valid. Silakan hubungi koordinator.'
          : 'Gagal mengirim persetujuan. Silakan coba lagi.'
      addToast({ type: 'error', message })
    }
```

Tambahkan import dan hook call:
```typescript
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
// ...
const { addToast } = useGlobalToast()
```

**Step 3:** Ubah validation di handleSubmit (line 38-44) untuk juga pakai toast:
```typescript
    if (!parentName.trim()) {
      addToast({ type: 'error', message: 'Silakan masukkan nama Anda.' })
      return
    }
    if (recordingConsent === null || photoConsent === null) {
      addToast({ type: 'error', message: 'Silakan pilih Ya/Tidak untuk kedua izin.' })
      return
    }
```

**Step 4:** Hapus state `error` + `setError` jika sudah tidak dipakai lagi (periksa apakah `error` digunakan di tempat lain selain validasi dan catch). 

**CATATAN:** Jika `error` masih dipakai untuk Input (line 252: `error={!parentName.trim() && error ? 'Nama wajib diisi' : undefined}`), pertahankan state tersebut tapi ganti expression menjadi `!parentName.trim() ? 'Nama wajib diisi' : undefined`.

**Verifikasi:** `pnpm build` — sukses. Submit tanpa nama → toast error, tidak ada banner global ganda.

---

## Task 5: RecordingDetailPage.tsx — Refactor ke <ErrorState> Shared (#6)

**Objective:** Ganti custom inline error markup dengan komponen `<ErrorState>` shared.

**Files:**
- Modify: `frontend/src/features/admin/pages/RecordingDetailPage.tsx`

**Step 1:** Import ErrorState jika belum:
```typescript
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
```

**Step 2:** Ganti blok error (line 149-163) dengan:
```tsx
  if (error || !recording) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/admin/recordings')}>
          Kembali
        </Button>
        <ErrorState
          message={error || 'Rekaman tidak ditemukan'}
          onRetry={loadRecording}
        />
      </div>
    )
  }
```

**Verifikasi:** `pnpm build` — sukses. Halaman error recording menggunakan `<ErrorState>` yang konsisten dengan halaman lain.

---

## Task 6: ReportListPage.tsx — Refactor ke <ErrorState> Shared (#8a)

**Objective:** Ganti custom inline error dengan `<ErrorState>`.

**Files:**
- Modify: `frontend/src/features/admin/pages/ReportListPage.tsx`

**Step 1:** Import ErrorState:
```typescript
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
```

**Step 2:** Ganti blok error (line 111-123) dengan:
```tsx
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Laporan" subtitle="Kelola laporan penilaian untuk setiap sesi." />
        <ErrorState message={error} onRetry={loadData} />
      </div>
    )
  }
```

**Step 3:** Hapus import `RefreshCw` jika sudah tidak dipakai.

**Verifikasi:** `pnpm build` — sukses.

---

## Task 7: ReportSessionPage.tsx — Refactor ke <ErrorState> Shared (#8b)

**Objective:** Ganti custom inline error dengan `<ErrorState>`.

**Files:**
- Modify: `frontend/src/features/admin/pages/ReportSessionPage.tsx`

**Step 1:** Import ErrorState:
```typescript
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
```

**Step 2:** Ganti blok error (line 204-228) dengan:
```tsx
  if (error || !session) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Error"
          breadcrumbs={[
            { label: 'Laporan', href: '/admin/reports' },
            { label: 'Detail' },
          ]}
        />
        <div className="flex gap-2 justify-center">
          <Button variant="secondary" onClick={() => navigate('/admin/reports')}>
            Kembali
          </Button>
        </div>
        <ErrorState message={error || 'Sesi tidak ditemukan.'} onRetry={loadData} />
      </div>
    )
  }
```

> **Desain note:** Tombol Kembali dipisah dari ErrorState agar tetap konsisten dengan layout halaman. ErrorState menyediakan "Coba Lagi" secara built-in.

**Verifikasi:** `pnpm build` — sukses.

---

## Task 8: ReportReviewPage.tsx — Refactor ke <ErrorState> Shared (#8c)

**Objective:** Ganti custom inline error dengan `<ErrorState>`.

**Files:**
- Modify: `frontend/src/features/admin/pages/ReportReviewPage.tsx`

**Step 1:** Import ErrorState:
```typescript
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
```

**Step 2:** Ganti blok error (line 245-268) dengan:
```tsx
  if (error || !report) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Error"
          breadcrumbs={[
            { label: 'Laporan', href: '/admin/reports' },
            { label: 'Review' },
          ]}
        />
        <div className="flex gap-2 justify-center">
          <Button
            variant="secondary"
            onClick={() => navigate(`/admin/reports/${sessionId}`)}
          >
            Kembali
          </Button>
        </div>
        <ErrorState message={error || 'Data tidak ditemukan.'} onRetry={loadData} />
      </div>
    )
  }
```

> **Desain note:** Sama dengan ReportSessionPage — tombol Kembali dipisah dari <ErrorState>.

**Verifikasi:** `pnpm build` — sukses.

---

## Ringkasan Perubahan

| # | File | Perubahan | Prioritas |
|---|------|-----------|-----------|
| 1 | `SmartPhotoPage.tsx` | Hapus cameraError state + inline text | ✅ Disetujui |
| 2 | `RecordingPage.tsx` | Tambah addToast, hapus inline text | Tinggi |
| 3 | `ChildAssessmentPage.tsx` | Ganti setError → addToast di handleSave | Tinggi |
| 4 | `ConsentFormPage.tsx` | Hapus banner global, tambah toast | Sedang |
| 5 | `RecordingDetailPage.tsx` | Pakai <ErrorState> shared | Sedang |
| 6 | `ReportListPage.tsx` | Pakai <ErrorState> shared | Sedang |
| 7 | `ReportSessionPage.tsx` | Pakai <ErrorState> shared | Sedang |
| 8 | `ReportReviewPage.tsx` | Pakai <ErrorState> shared | Sedang |

**Total:** 8 file dimodifikasi, ~100 baris dihapus/diganti. Semua perubahan kecil, terisolasi, dan mengikuti pola yang sudah ada di codebase.

## Verifikasi Final

Setelah semua task selesai:
```bash
cd frontend
pnpm build
```
Expected: Build sukses tanpa error TypeScript (strict mode dengan `noUnusedLocals` dan `noUnusedParameters`).

## Risiko & Catatan

- **Tidak ada risiko regresi fungsional:** Semua perubahan hanya di UI rendering error path, tidak mempengaruhi logika bisnis.
- **Import cleanup:** Beberapa file mungkin memiliki unused imports setelah perubahan (`RefreshCw`, `AlertTriangle`, dll.) — TypeScript strict akan mendeteksi ini.
- **#10 false alarm:** SmartPhotoPage early-return tidak menyebabkan "more hooks" karena semua hooks sudah dideklarasikan sebelum early return. Tidak perlu perbaikan.
- **FrameUploadPage.tsx (#9):** Opsional, tidak termasuk dalam plan ini. Jika ingin konsistensi penuh, refactor ke <ErrorState> bisa ditambahkan sebagai task opsional.
