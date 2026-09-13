# Mini Rapor Layout Revision

## Context

The mini rapor (participant report card) template at `frontend/src/shared/templates/miniRaport.ts` needs structural adjustments: removing the facilitator message card, replacing the Kidversa placeholder logo with the real asset, repositioning the badge section above the summary, adding a facilitator signature block, renaming the home mission title, and compacting the footer.

This spec covers all layout changes in a single cohesive revision. No backend or data-fetching changes are needed — only the HTML template generation and its callers.

## Affected Files

| File | Change |
|------|--------|
| `frontend/src/shared/templates/miniRaport.ts` | Template layout, data interface, helper functions |
| `frontend/src/features/admin/hooks/useReportReview.ts` | Remove `facilitatorMessage` from `buildRaportHtml` |
| `frontend/src/features/parent/pages/ReportPage.tsx` | Remove `facilitatorMessage` from `buildHtml` |

No Tailwind CSS changes (`miniRaport.tailwind.css` / `miniRaport.styles.css`) are needed — all styling uses existing utility classes.

## Data Model Change

### `MiniRaportData` interface

Remove the `facilitatorMessage` and `galleryTitle` fields. All other fields remain unchanged.

```typescript
// BEFORE
export interface MiniRaportData {
  // ...
  facilitatorMessage: string   // REMOVED — no longer rendered
  missions: string[]
  // ...
  galleryTitle: string         // REMOVED — footer uses fixed "Galeri Digital"
  // ...
}

// AFTER
export interface MiniRaportData {
  // ...
  missions: string[]
  // ...
}
```

**Rationale:** `facilitatorMessage` is no longer rendered (Pesan Fasilitator section removed). `galleryTitle` is no longer rendered (footer uses fixed "Galeri Digital" text). Removing both from the interface makes the change type-safe — any caller that still passes them will get a compile error.

### Caller cleanup

- `useReportReview.ts` → `buildRaportHtml`: remove `facilitatorMessage: DEFAULT_FACILITATOR_MESSAGE` and `galleryTitle: \`Galeri ${participant.child_name}\`` from the `generateMiniRaportHTML(...)` call. Remove `DEFAULT_FACILITATOR_MESSAGE` from the import (no longer used). `DEFAULT_FACILITATOR_NAME` and `RAPORT_LAYOUT` imports stay.
- `ReportPage.tsx` → `buildHtml`: remove `facilitatorMessage: DEFAULT_FACILITATOR_MESSAGE` and `galleryTitle: 'Galeri Peserta'` from the call. Remove `DEFAULT_FACILITATOR_MESSAGE` from the import. `DEFAULT_FACILITATOR_NAME` and `A4_SHEET_WIDTH` imports stay.

## Layout Changes

### Current Grid (12-column)

```
Row 1-3:  [Foto col-4 row-span-3] [Profil Anak col-8]
Row 4:    [Level Kegiatan col-8]
Row 5:    [Pesan Fasilitator col-8]
Row 6:    [Ringkasan col-12]
Row 7:    [Misi Lanjutan col-6] [Badge Pencapaian col-6]
```

### New Grid (12-column)

```
Row 1-3:  [Foto col-4 row-span-3] [Profil Anak col-8]
Row 4:    [Level Kegiatan col-8]
Row 5:    [Badge Pencapaian col-8]        ← NEW POSITION (was Pesan Fasilitator)
Row 6:    [Ringkasan col-12]
Row 7:    [Misi Rumah Bersama Keluarga col-6] [Pengesahan col-6]
```

### Section Details

#### 1. Header (no change)

Kidversa logo (left) / Title center / Partner logo (right). The Kidversa logo fallback changes:

```typescript
// BEFORE
const kidversaLogo = data.kidversaLogoUrl
  ? `<img src="..." alt="Kidversa" .../>`
  : '<div class="...">[ LOGO BRAND KIDVERSA ]</div>'

// AFTER
const kidversaLogo = data.kidversaLogoUrl
  ? `<img src="${esc(data.kidversaLogoUrl)}" alt="Kidversa" class="w-full h-12 object-contain" />`
  : '<img src="/logo.png" alt="Kidversa" class="w-full h-12 object-contain" />'
```

Uses the existing `frontend/public/logo.png` (163KB). The `srcDoc` iframe and `html-to-image` capture both resolve `/logo.png` correctly from same-origin.

#### 2. Foto Momen Terbaik + Profil Anak + Level Kegiatan (no change)

Rows 1-4 of the grid remain identical.

#### 3. Badge Pencapaian — NEW position (replaces Pesan Fasilitator)

**Grid:** `col-span-8`, sits right of the Foto card (which spans rows 1-3).

**Structure:**
- Header: FontAwesome `fa-award` icon + label `BADGE PENCAPAIAN`
- Body: single horizontal flex row (not 2-column grid). Each badge = 32x32 image + name text. Flex-wrap enabled so badges wrap to a second row if >4.
- Compact padding: `py-2 px-3`, minimum height ~70px.
- Empty state unchanged: "Belum ada badge yang diraih."

```html
<div class="col-span-8 bg-white border-2 border-brand-badge rounded-[1.25rem] p-3 pt-5 shadow-sm relative">
  <div class="absolute -top-3 left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold shadow-md flex items-center gap-2 z-10">
    <i class="fas fa-award text-xs"></i> BADGE PENCAPAIAN
  </div>
  <div class="flex flex-wrap gap-3">
    <!-- badge items: image 32x32 + name, no grid -->
  </div>
</div>
```

The `badgeHTML` helper function changes from a 2-column grid to a flex-wrap layout:

```typescript
// BEFORE
function badgeHTML(badges: ...): string {
  // ...
  return `<div class="grid grid-cols-2 gap-x-3 gap-y-4 w-full">${items}</div>`
}

// AFTER
function badgeHTML(badges: ...): string {
  // ...
  return `<div class="flex flex-wrap gap-3">${items}</div>`
}
```

Each badge item also shrinks slightly — image `w-8 h-8` (was `w-9 h-9`), text `text-[11px]` (unchanged).

#### 4. Ringkasan (no change)

Full-width `col-span-12`.

#### 5. Misi Rumah Bersama Keluarga (renamed)

**Grid:** `col-span-6` (unchanged position).

**Change:** Title text only:

```html
<!-- BEFORE -->
<h3 class="font-black text-brand-purple text-base">MISI LANJUTAN</h3>

<!-- AFTER -->
<h3 class="font-black text-brand-purple text-base">MISI RUMAH BERSAMA KELUARGA</h3>
```

Icon (`fa-home`), body, and grid structure unchanged.

#### 6. Pengesahan — NEW (replaces old Badge Pencapaian)

**Grid:** `col-span-6` (same position as old badge card).

**Structure:**
- Header: FontAwesome `fa-pen` icon + label `PENGESAHAN`
- Body:
  - Small label: `Guru Fasilitator`
  - Bold name: `[facilitatorName]`
  - Empty bordered box (~60px tall, `border-2 border-dashed border-gray-300`) for handwritten TTD (tanda tangan)

```html
<div class="col-span-6 bg-white border-2 border-gray-200 rounded-[1.25rem] p-4 pt-5 shadow-sm relative">
  <div class="absolute -top-3 left-5 bg-brand-badge text-white px-5 py-1 rounded-full font-bold shadow-md flex items-center gap-2 z-10">
    <i class="fas fa-pen text-xs"></i> PENGESAHAN
  </div>
  <div class="mt-1">
    <p class="text-[11px] font-semibold text-gray-500 mb-0.5">Guru Fasilitator</p>
    <p class="text-[13px] font-bold text-brand-purple mb-3">${esc(data.facilitatorName)}</p>
    <div class="w-full h-[60px] border-2 border-dashed border-gray-300 rounded-lg bg-gray-50"></div>
  </div>
</div>
```

No avatar, no message text — just name + signature box.

#### 7. Footer — compact

**Current:** `py-3 px-8`, long copyright paragraph, QR + gallery participant name.

**New:** `py-2 px-8`, single-line layout:

| Left | Divider | Right |
|------|---------|-------|
| `© 2026 \| www.kidversa.fun` | vertical line | `[QR 56x56]` + `Galeri Digital` |

Changes:
- Padding: `py-3` → `py-2`
- Copyright: replace long paragraph with `© 2026 | www.kidversa.fun` at `text-[10px]`
- QR caption: replace `{galleryTitle}` (participant-specific) with fixed `Galeri Digital` at `text-[9px]`
- QR size: keep `w-14 h-14`

```html
<div class="bg-[#795db2] text-white px-8 py-2 flex items-center gap-4 relative z-10 rounded-b-[2rem]">
  <div class="flex-1 min-w-0">
    <p class="text-[10px] font-semibold opacity-95">© 2026 | www.kidversa.fun</p>
  </div>
  <div class="raport-divider shrink-0"></div>
  <div class="raport-footer-qr">
    <div class="raport-qr-caption">
      <div class="text-[9px] font-bold text-white/70 tracking-wider">Galeri Digital</div>
      <div class="text-[9px] font-semibold text-white/70 italic">Scan untuk melihat galeri</div>
    </div>
    <div class="w-14 h-14 bg-white rounded-lg flex items-center justify-center text-gray-400 text-[8px] font-bold text-center leading-tight shrink-0 shadow-sm p-1">
      [ QR CODE ]
    </div>
  </div>
</div>
```

## Constraint: No Emojis

All icons must use FontAwesome classes (`fas`, `fa-regular`, `fa-solid`). No Unicode emojis anywhere in the template output.

## Removed Code

The `facilitatorAvatar` block in `generateMiniRaportHTML` can be removed entirely since the Pesan Fasilitator section (which used it) is gone. The facilitator avatar is no longer rendered anywhere.

## Verification

1. `pnpm build` — TypeScript compilation succeeds (interface change catches stale callers)
2. `pnpm build:raport-css` — Tailwind CSS recompilation succeeds (no new utility classes used)
3. Visual: open the report preview in the admin review page, confirm:
   - Badge Pencapaian appears above Ringkasan in the right column
   - Badge items render as a horizontal flex row (not 2-column grid)
   - Pengesahan card shows facilitator name + empty TTD box
   - Footer shows compact copyright + QR
   - No emojis — all icons are FontAwesome SVGs
   - Kidversa logo renders (not placeholder text)
4. PDF/PNG capture: download from the review page, confirm layout renders correctly in the capture
