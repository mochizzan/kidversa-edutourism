export const RATING_ABBREVIATIONS: Record<number, string> = {
  0: '–',
  1: 'BB',
  2: 'MB',
  3: 'BSH',
  4: 'BSB',
}

export const RATING_LABEL_KEYS = {
  0: 'common.assessment.rating0',
  1: 'common.assessment.rating1',
  2: 'common.assessment.rating2',
  3: 'common.assessment.rating3',
  4: 'common.assessment.rating4',
} as const

export const MAX_STAR_RATING = 5
