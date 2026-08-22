import { Home, Users, School, type LucideIcon } from 'lucide-react'
import { MissionCategory } from '../types/enums'

/**
 * Single source of truth for mission-category presentation.
 *
 * Previously this metadata was triplicated and had already drifted:
 * `constants/report.ts` (label + emoji), `MissionCard.tsx` (emoji + colour) and
 * `MissionBankPage.tsx` (emoji + lucide tab icon) each held their own copy, and
 * the PARENT emoji had diverged between them.
 */
export interface MissionCategoryMeta {
  /** Indonesian UI label shown to staff and parents. */
  label: string
  /** Emoji glyph used in dense summaries and category headings. */
  emoji: string
  /** Tailwind chip classes for the category badge. */
  color: string
  /** Lucide icon component for tab/nav affordances (render as <Icon />). */
  Icon: LucideIcon
}

export const MISSION_CATEGORY_META: Record<MissionCategory, MissionCategoryMeta> = {
  [MissionCategory.HOME]: {
    label: 'Di Rumah',
    emoji: '\u{1F3E0}',
    color: 'bg-blue-100 text-blue-700',
    Icon: Home,
  },
  [MissionCategory.PARENT]: {
    label: 'Bersama Orang Tua',
    emoji: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}',
    color: 'bg-purple-100 text-purple-700',
    Icon: Users,
  },
  [MissionCategory.SCHOOL]: {
    label: 'Di Sekolah',
    emoji: '\u{1F3EB}',
    color: 'bg-amber-100 text-amber-700',
    Icon: School,
  },
}

/** Canonical category order for grouped rendering (headings, tabs, summaries). */
export const MISSION_CATEGORY_ORDER = [
  MissionCategory.HOME,
  MissionCategory.PARENT,
  MissionCategory.SCHOOL,
] as const

/**
 * Resolves a raw (possibly unknown/legacy) category string to its metadata,
 * falling back to HOME so a bad value never blanks the UI.
 */
export const missionCategoryMeta = (category: string): MissionCategoryMeta =>
  MISSION_CATEGORY_META[category as MissionCategory] ?? MISSION_CATEGORY_META[MissionCategory.HOME]
