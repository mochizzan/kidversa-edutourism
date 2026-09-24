import type { ComponentType, ReactElement, SVGProps } from 'react'
import CN from 'country-flag-icons/string/3x2/CN'
import GB from 'country-flag-icons/string/3x2/GB'
import ID from 'country-flag-icons/string/3x2/ID'
import JP from 'country-flag-icons/string/3x2/JP'
import KR from 'country-flag-icons/string/3x2/KR'
import MY from 'country-flag-icons/string/3x2/MY'
import PH from 'country-flag-icons/string/3x2/PH'
import TH from 'country-flag-icons/string/3x2/TH'
import VN from 'country-flag-icons/string/3x2/VN'

export type FlagRegistry = Readonly<Record<string, ComponentType<SVGProps<SVGSVGElement>>>>

const SVG_TAG_RE = /^<svg\s+([^>]*)>([\s\S]*)<\/svg>$/
const ATTR_RE = /([A-Za-z][\w-]*)="([^"]*)"/g

/**
 * Parse string flag per-flag package (`export default '<svg …'`) SEKALI di module
 * scope: kumpulkan atribut outer tag (wajib `viewBox`, `xmlns` dibuang — React
 * yang menanganinya) + inner markup. Markup tidak berbentuk `<svg …>` atau tanpa
 * `viewBox` → throw saat init module (fail-loud, bukan diam-diam render kosong).
 */
function parseSvgString(raw: string): { outerAttrs: Record<string, string>; inner: string } {
 const matched = SVG_TAG_RE.exec(raw)
 if (!matched) throw new Error(`FlagIcon: string flag bukan '<svg …</svg>': ${raw.slice(0, 80)}`)
 const outerAttrs: Record<string, string> = {}
 for (const [, name, value] of matched[1].matchAll(ATTR_RE)) {
  if (name !== 'xmlns') outerAttrs[name] = value
 }
 if (!('viewBox' in outerAttrs)) {
  throw new Error(`FlagIcon: string flag tanpa viewBox: ${raw.slice(0, 80)}`)
 }
 return { outerAttrs, inner: matched[2] }
}

// `SVGProps` tidak memuat `title` (komponen library punya via HTMLAttributes);
// wrapper sendiri yang memisahkannya dari props sehingga tidak bocor ke DOM.
type SvgFlagProps = { title?: string } & SVGProps<SVGSVGElement>

/**
 * Bungkus string flag jadi komponen React: atribut hasil parse di-forward lebih
 * dulu (caller boleh override), `title` dipisah dari props sehingga TIDAK PERNAH
 * jadi atribut `title` DOM — ada title → `aria-label` (accessible name), tanpa
 * title → tanpa aria-label (caller FlagIcon yang urus `aria-hidden` default).
 */
function makeSvgFlag(raw: string): ComponentType<SvgFlagProps> {
 const { outerAttrs, inner } = parseSvgString(raw)
 return function Flag({ title, ...restProps }: SvgFlagProps): ReactElement {
  const ariaProps = title ? { 'aria-label': title } : {}
  return (
   <svg
    {...(outerAttrs as SVGProps<SVGSVGElement>)}
    {...restProps}
    {...ariaProps}
    dangerouslySetInnerHTML={{ __html: inner }}
   />
  )
 }
}

// Sembilan kode bahasa/region (language switcher) di-bundle statis dari string
// per-flag — BUKAN barrel react. Barrel react me-re-export inline 265 komponen;
// satu static import pun menarik seluruh registry ke graph eager dan melemahkan
// lazy-load loadFlagRegistry.
const STATIC_FLAGS = {
 ID: makeSvgFlag(ID),
 GB: makeSvgFlag(GB),
 MY: makeSvgFlag(MY),
 TH: makeSvgFlag(TH),
 PH: makeSvgFlag(PH),
 KR: makeSvgFlag(KR),
 CN: makeSvgFlag(CN),
 JP: makeSvgFlag(JP),
 VN: makeSvgFlag(VN),
} as unknown as FlagRegistry

let registryPromise: Promise<FlagRegistry> | null = null
let registry: FlagRegistry | null = null

/**
 * Load registry penuh (±265 component) sekali via dynamic import; hasil di-cache
 * module-scope dan di-reuse pada open berikutnya.
 *
 * Saat gagal: lepas cache promise DULU baru reject — open berikutnya boleh retry
 * (spec §5). Caller wajib catch. FlagIcon sendiri TIDAK PERNAH memanggil fungsi ini;
 * loading milik consumer (PhoneInput saat panel dibuka).
 */
export function loadFlagRegistry(): Promise<FlagRegistry> {
 if (!registryPromise) {
  registryPromise = import('country-flag-icons/react/3x2')
   .then((mod) => {
    registry = mod as unknown as FlagRegistry
    return registry
   })
   .catch((error: unknown) => {
    registryPromise = null
    throw error
   })
 }
 return registryPromise
}

type FlagIconProps = { iso?: string; title?: string } & SVGProps<SVGSVGElement>

/**
 * Bendera SVG negara — dua mode resolusi di balik satu komponen (spec §3):
 * statis untuk 9 kode bahasa, lazy (registry hasil `loadFlagRegistry`) untuk yang lain.
 * Fallback: ISO tak tercakup / registry belum load → `null`, tanpa crash, tanpa emoji.
 *
 * Aksesibilitas: tanpa `title` → dekoratif (`aria-hidden` default true, boleh dioverride);
 * dengan `title` → `role="img"` + accessible name dari `title`.
 */
export function FlagIcon({ iso, title, ...svgProps }: FlagIconProps): ReactElement | null {
 const code = iso?.toUpperCase()
 const Flag: ComponentType<FlagIconProps> | undefined = code
  ? STATIC_FLAGS[code] ?? registry?.[code]
  : undefined
 if (!Flag) return null
 if (title) return <Flag {...svgProps} title={title} role="img" />
 return <Flag {...svgProps} aria-hidden={svgProps['aria-hidden'] ?? true} />
}
