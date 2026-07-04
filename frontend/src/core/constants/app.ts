// App Constants
export const APP_NAME = 'Kidversa'
export const APP_DESCRIPTION = 'Platform Edutourism Interaktif untuk Anak - Belajar Sambil Berpetualang!'

// Brand Colors (matched to logo)
// For dynamic JS usage. For Tailwind classes, use theme tokens: bg-primary, text-accent, etc.
export const COLORS = {
  primary: '#5B2C8D',    // Deep Purple (logo background)
  primaryLight: '#7B4DB5',
  primaryDark: '#4A2370',
  accent: '#F5A623',     // Orange/Amber (logo accent)
  accentLight: '#FFC04D',
  accentDark: '#D48B1C',
  white: '#FFFFFF',
  black: '#000000',
} as const

// Routes
export const ROUTES = {
  HOME: '/',
  AUTH: '/auth',
  ADMIN: '/admin',
  FASILITATOR: '/fasilitator',
  PARENT: '/parent',
} as const

// API
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
