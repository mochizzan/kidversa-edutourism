// Pure date/series helpers for the admin dashboard Analytics tab.
//
// Backend timestamps are UTC (apputil.Now() = time.Now().UTC()) while the UI
// speaks WIB (UTC+7). Bucketing raw `created_at`/`assessed_at` strings with
// `.slice(0, 10)` would shift any event after 17:00Z into the next day relative
// to what users see, so every timestamp goes through wibDateKey first.

const WIB_TIME_ZONE = 'Asia/Jakarta'

/** Oldest window the "Semua" (all) range will ever render, in days. */
const MAX_RANGE_DAYS = 366

/** Date key (YYYY-MM-DD) of a UTC timestamp as seen in Asia/Jakarta. */
export function wibDateKey(iso: string): string {
 return new Date(iso).toLocaleDateString('en-CA', { timeZone: WIB_TIME_ZONE })
}

/** Today's date key (YYYY-MM-DD) in Asia/Jakarta. */
export function todayWibDateKey(now: Date = new Date()): string {
 return now.toLocaleDateString('en-CA', { timeZone: WIB_TIME_ZONE })
}

/**
 * Inclusive, ordered date keys (YYYY-MM-DD) from `start` to `end`.
 * The window is capped at MAX_RANGE_DAYS keeping the most recent dates, so an
 * "all time" range on old data can never produce an unbounded series.
 * Returns [] for reversed or unparseable input.
 */
export function dateKeysBetween(start: string, end: string): string[] {
 const first = Date.parse(`${start}T00:00:00Z`)
 const last = Date.parse(`${end}T00:00:00Z`)
 if (Number.isNaN(first) || Number.isNaN(last) || first > last) return []

 const dayMs = 86_400_000
 let cursor = first
 if (Math.round((last - first) / dayMs) >= MAX_RANGE_DAYS) {
  cursor = last - (MAX_RANGE_DAYS - 1) * dayMs
 }

 const keys: string[] = []
 for (; cursor <= last; cursor += dayMs) {
  keys.push(new Date(cursor).toISOString().slice(0, 10))
 }
 return keys
}

/** The last `days` days (inclusive) ending today in WIB. */
export function lastNDays(days: number, now: Date = new Date()): string[] {
 const end = Date.parse(`${todayWibDateKey(now)}T00:00:00Z`)
 const start = end - (days - 1) * 86_400_000
 return dateKeysBetween(new Date(start).toISOString().slice(0, 10), new Date(end).toISOString().slice(0, 10))
}

export interface DailyAnalytics {
 date: string
 /** Sessions whose session_date falls on this date. */
 sessions: number
 /** Participants created on this date (WIB). */
 registrations: number
 /** Assessments performed on this date (WIB). */
 assessments: number
 /** Mean star rating that day; null when there were no assessments. */
 avgRating: number | null
}

export interface BuildDailySeriesInput {
 dates: string[]
 sessions: Array<{ session_date?: string }>
 participants: Array<{ created_at: string }>
 assessments: Array<{ star_rating: number; assessed_at?: string }>
}

/**
 * Buckets sessions, registrations, and assessments into one row per date.
 * Items outside `dates` are ignored; days without data are zero-filled so the
 * chart axis stays continuous. avgRating is null (not 0) on days with no
 * ratings so charts can distinguish "no data" from "zero stars".
 */
export function buildDailySeries({
 dates,
 sessions,
 participants,
 assessments,
}: BuildDailySeriesInput): DailyAnalytics[] {
 const inRange = new Set(dates)

 const sessionsByDate = new Map<string, number>()
 for (const s of sessions) {
  if (s.session_date && inRange.has(s.session_date)) {
   sessionsByDate.set(s.session_date, (sessionsByDate.get(s.session_date) ?? 0) + 1)
  }
 }

 const registrationsByDate = new Map<string, number>()
 for (const p of participants) {
  const key = wibDateKey(p.created_at)
  if (inRange.has(key)) {
   registrationsByDate.set(key, (registrationsByDate.get(key) ?? 0) + 1)
  }
 }

 const ratingCountByDate = new Map<string, number>()
 const ratingSumByDate = new Map<string, number>()
 for (const a of assessments) {
  if (!a.assessed_at) continue
  const key = wibDateKey(a.assessed_at)
  if (!inRange.has(key)) continue
  ratingCountByDate.set(key, (ratingCountByDate.get(key) ?? 0) + 1)
  ratingSumByDate.set(key, (ratingSumByDate.get(key) ?? 0) + a.star_rating)
 }

 return dates.map((date) => {
  const count = ratingCountByDate.get(date) ?? 0
  return {
   date,
   sessions: sessionsByDate.get(date) ?? 0,
   registrations: registrationsByDate.get(date) ?? 0,
   assessments: count,
   avgRating: count > 0 ? Math.round(((ratingSumByDate.get(date) ?? 0) / count) * 10) / 10 : null,
  }
 })
}
