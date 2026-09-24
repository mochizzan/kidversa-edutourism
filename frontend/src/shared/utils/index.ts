export { cn } from '../../core/utils/cn'

import { WIB } from '../../core/constants/timezone'
import { i18n } from '../../core/i18n'

export function formatDate(date: string | Date) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'id', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: WIB,
  }).format(d)
}

export function formatDateTime(date: string | Date) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'
  const formatted = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'id', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: WIB,
  }).format(d)
  return `${formatted} WIB`
}

export function formatFileSize(bytes: number) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function truncate(str: string, length: number) {
  if (!str || str.length <= length) return str
  return `${str.slice(0, length)}...`
}
