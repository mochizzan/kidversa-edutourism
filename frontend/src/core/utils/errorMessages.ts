import { ApiError } from '../services/backendClient'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email atau password salah. Periksa kembali data Anda.',
  unauthorized: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
  forbidden: 'Anda tidak memiliki akses untuk melakukan ini.',
  not_found: 'Data tidak ditemukan.',
  conflict: 'Data sudah ada. Gunakan data yang berbeda.',
  validation_error: 'Data tidak valid. Periksa kembali input Anda.',
  token_expired: 'Tautan sudah kedaluwarsa. Silakan hubungi koordinator.',
  token_invalid: 'Tautan tidak valid.',
  token_consumed: 'Tautan ini sudah digunakan sebelumnya.',
  tenant_required: 'Silakan pilih tenant terlebih dahulu.',
  internal_error: 'Terjadi kesalahan pada server. Silakan coba lagi.',
  kiosk_invalid: 'Sesi berakhir atau tautan tidak valid.',
  session_not_deletable: 'Sesi ini tidak dapat dihapus.',
  participant_not_deletable: 'Peserta ini tidak dapat dihapus.',
  bad_request: 'Permintaan tidak dapat diproses.',
  network: 'Gagal terhubung ke server. Periksa koneksi internet Anda.',
}

export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    return ERROR_MESSAGES[err.code] || 'Terjadi kesalahan. Silakan coba lagi.'
  }
  if (err instanceof Error) {
    // Network / fetch failures
    if (err.name === 'TypeError' || err.message.includes('fetch')) {
      return 'Gagal terhubung ke server. Periksa koneksi internet Anda.'
    }
  }
  return 'Terjadi kesalahan. Silakan coba lagi.'
}
