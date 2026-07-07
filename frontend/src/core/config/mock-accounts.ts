import { UserRole } from '../types'

export interface MockAccount {
  id: string
  tenant_id: string
  email: string
  password: string // plain text for mock only
  role: UserRole
  name: string
  phone?: string
  is_active: boolean
}

export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    id: 'u-1',
    tenant_id: 't-1',
    email: 'admin@kidversa.id',
    password: 'password123',
    role: UserRole.ADMIN,
    name: 'Admin',
    phone: '081234567890',
    is_active: true,
  },
  {
    id: 'u-2',
    tenant_id: 't-1',
    email: 'koordinator@kidversa.id',
    password: 'password123',
    role: UserRole.KOORDINATOR,
    name: 'Koordinator Program',
    phone: '081234567891',
    is_active: true,
  },
  {
    id: 'u-3',
    tenant_id: 't-1',
    email: 'f1@kidversa.id',
    password: 'password123',
    role: UserRole.FASILITATOR,
    name: 'Fasilitator Sapi',
    phone: '081234567892',
    is_active: true,
  },
  {
    id: 'u-5',
    tenant_id: 't-1',
    email: 'f3@kidversa.id',
    password: 'password123',
    role: UserRole.FASILITATOR,
    name: 'Fasilitator Ikan',
    phone: '081234567894',
    is_active: false,
  },
]

export const MOCK_DEFAULT_PASSWORD = 'password123'
