// App Constants
export const APP_NAME = 'Kidversa'
export const APP_DESCRIPTION = 'Platform Edutourism Interaktif untuk Anak - Belajar Sambil Berpetualang!'

// Brand Colors
export const COLORS = {
  primary: '#5E2E91', // Purple
  accent: '#F9A01F',  // Orange
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
export const API_ENDPOINTS = {
  AUTH: '/api/auth',
  STORIES: '/api/stories',
  DESTINATIONS: '/api/destinations',
} as const
