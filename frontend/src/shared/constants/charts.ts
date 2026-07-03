// Chart color palette for Kidversa Edutourism
// Colors are harmonious, distinguishable, and accessible

export const CHART_COLORS = {
  rating1: '#EF4444', // Red - Belum terlihat
  rating2: '#F97316', // Orange - Mulai berkembang
  rating3: '#EAB308', // Yellow - Cukup baik
  rating4: '#22C55E', // Green - Sangat baik
  rating5: '#3B82F6', // Blue - Luar biasa
} as const

export const CHART_PALETTE = [
  '#5B2C8D', // Primary (ungu)
  '#7B4DB5', // Primary light
  '#F5A623', // Accent (emas)
  '#3B82F6', // Blue
  '#22C55E', // Green
  '#EF4444', // Red
  '#F97316', // Orange
  '#06B6D4', // Cyan
] as const

// Rating labels mapping
export const RATING_LABELS: Record<number, string> = {
  1: 'Belum terlihat',
  2: 'Mulai berkembang',
  3: 'Cukup baik',
  4: 'Sangat baik',
  5: 'Luar biasa',
}

// Rating colors mapping (for pie charts)
export const RATING_COLORS: Record<number, string> = {
  1: CHART_COLORS.rating1,
  2: CHART_COLORS.rating2,
  3: CHART_COLORS.rating3,
  4: CHART_COLORS.rating4,
  5: CHART_COLORS.rating5,
}
