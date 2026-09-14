# Fix Rapor UI Truncation Issues

## Context

The mini rapor template has three display issues where content is unnecessarily truncated. The narrative (Ringkasan) is cut short, the kegiatan (activities) list shows only 3 of 9, and the "Topik X" label adds visual noise. These are data-layer and template-layer restrictions that should be removed to show full content.

## Root Causes

### Ringkasan (Narrative) Truncated

Two independent truncation layers:

1. **Data layer** — `useReportReview.ts` `buildRaportHtml`:
   ```typescript
   const narrative = narrativeText.length > RAPORT_LAYOUT.MAX_NARRATIVE_CHARS
     ? `${narrativeText.slice(0, RAPORT_LAYOUT.MAX_NARRATIVE_CHARS)}…`
     : narrativeText
   ```
   Truncates at 260 characters (`MAX_NARRATIVE_CHARS`).

2. **Template layer** — `miniRaport.ts` Ringkasan `<p>`:
   ```html
   <p class="... line-clamp-5 ...">
   ```
   CSS `line-clamp-5` limits visible text to 5 lines.

### Level Kegiatan Shows Only 3 Activities

Two independent slicing layers:

1. **Data layer** — `useReportReview.ts` `buildRaportHtml`:
   ```typescript
   kegiatan: si.kegiatan.slice(0, RAPORT_LAYOUT.MAX_KEGIATAN_PER_STAGE).map(...)
   ```
   Slices to 3 activities (`MAX_KEGIATAN_PER_STAGE`).

2. **Template layer** — `miniRaport.ts` `stageRowHTML`:
   ```typescript
   stage.kegiatan.slice(0, 3).map(...)
   ```
   Hardcoded slice to 3.

### "Topik X" Label

`stageRowHTML` renders a label `Topik ${sequenceOrder}` above the topic name. This is redundant — the topic name alone is sufficient.

## Fix

### 1. Remove narrative truncation

**`useReportReview.ts`** — `buildRaportHtml`:
- Remove the ternary truncation. Pass `narrativeText` directly as `narrative`.

**`miniRaport.ts`** — Ringkasan `<p>`:
- Remove `line-clamp-5` class. Keep all other classes.

**`report.ts`**:
- Remove `MAX_NARRATIVE_CHARS` constant.

### 2. Remove kegiatan slicing

**`useReportReview.ts`** — `buildRaportHtml`:
- Remove `.slice(0, RAPORT_LAYOUT.MAX_KEGIATAN_PER_STAGE)` from the kegiatan mapping. Pass all kegiatan.

**`miniRaport.ts`** — `stageRowHTML`:
- Remove `.slice(0, 3)` from the kegiatan mapping. Render all items.

**`report.ts`**:
- Remove `MAX_KEGIATAN_PER_STAGE` constant.

### 3. Remove "Topik X" label

**`miniRaport.ts`** — `stageRowHTML`:
- Remove the `<div class="${cfg.label} font-bold text-[12px] leading-tight">Topik ${esc(stage.sequenceOrder)}</div>` line.

**Before:**
```
Topik 1
Gempa Bumi
```

**After:**
```
Gempa Bumi
```

## Overflow Handling

With full narrative + all kegiatan, content may exceed A4 height (297mm). The existing `__raportBeforePrint` script auto-scales content to fit. No additional handling needed.

## Files Modified

| File | Changes |
|------|---------|
| `frontend/src/core/constants/report.ts` | Remove `MAX_NARRATIVE_CHARS` and `MAX_KEGIATAN_PER_STAGE` |
| `frontend/src/shared/templates/miniRaport.ts` | Remove `line-clamp-5`, remove `slice(0,3)`, remove "Topik X" label |
| `frontend/src/features/admin/hooks/useReportReview.ts` | Remove narrative truncation and kegiatan slicing |

## Verification

1. `pnpm build` — TypeScript compilation succeeds (removed constants are no longer referenced)
2. Visual: open report preview — narrative shows full text, all kegiatan visible, no "Topik X" label
3. Print/PDF: content auto-scales to fit A4 if oversized
