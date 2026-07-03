// Core Types

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatar?: string
  createdAt: Date
  updatedAt: Date
}

export type UserRole = 'admin' | 'fasilitator' | 'parent'

export interface Story {
  id: string
  title: string
  description: string
  content: string
  imageUrl?: string
  category: string
  ageGroup: string
  createdAt: Date
  updatedAt: Date
}

export interface Destination {
  id: string
  name: string
  description: string
  address: string
  imageUrl?: string
  latitude?: number
  longitude?: number
  category: string
  createdAt: Date
  updatedAt: Date
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}
