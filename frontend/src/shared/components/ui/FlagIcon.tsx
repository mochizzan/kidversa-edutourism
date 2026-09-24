import type { ComponentType, ReactElement, SVGProps } from 'react'
import { CN, GB, ID, JP, KR, MY, PH, TH, VN } from 'country-flag-icons/react/3x2'

export type FlagRegistry = Readonly<Record<string, ComponentType<SVGProps<SVGSVGElement>>>>

// Sembilan kode bahasa/region di-bundle statis (language switcher) tanpa dependensi lazy.
// Cast tipe: package mengetik props component sebagai HTMLAttributes<HTMLSVGElement>,
// tidak kompatibel-varians dengan SVGProps<SVGSVGElement>; keduanya render <svg> yang sama.
const STATIC_FLAGS: FlagRegistry = { ID, GB, MY, TH, PH, KR, CN, JP, VN } as unknown as FlagRegistry

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
 * dengan `title` → `role="img"` + accessible name dari `<title>` yang dirender library.
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
