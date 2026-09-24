export const RATING_LABELS: Record<number, string> = {
  0: 'Belum Dinilai',
  1: 'BB - Belum Berkembang',
  2: 'MB - Mulai Berkembang',
  3: 'BSH - Berkembang Sesuai Harapan',
  4: 'BSB - Berkembang Sangat Baik',
}

export const RATING_LABEL_KEYS = {
  0: 'common.assessment.rating0',
  1: 'common.assessment.rating1',
  2: 'common.assessment.rating2',
  3: 'common.assessment.rating3',
  4: 'common.assessment.rating4',
} as const

export const MAX_STAR_RATING = 5
