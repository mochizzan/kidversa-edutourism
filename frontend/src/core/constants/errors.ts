// errors.ts — user-facing error messages (Indonesian) used across the app.
export const ERROR_MESSAGES = {
  LOAD_FAILED: 'Gagal memuat data. Coba lagi.',
  SESSION_EXPIRED: 'Sesi berakhir. Silakan masuk kembali.',
  BACKEND_UNAVAILABLE: 'Backend tidak tersedia. Periksa koneksi lalu coba lagi.',
  SAVE_FAILED: 'Gagal menyimpan data. Coba lagi.',
  DELETE_FAILED: 'Gagal menghapus data. Coba lagi.',
  SEND_FAILED: 'Gagal mengirim laporan. Coba lagi.',
  EMAIL_INVALID: 'Format email tidak valid',
  NETWORK_ERROR: 'Terjadi kesalahan jaringan. Coba lagi.',
  UNKNOWN: 'Terjadi kesalahan. Coba lagi nanti.',
} as const
