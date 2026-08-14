export function DemoHint() {
  // Hanya untuk dev/staging (VITE_DEMO_MODE=true). Production: tidak dirender.
  return (
    <div className="p-3 rounded-xl bg-primary-container/40 border border-primary-100/60">
      <p className="text-xs text-on-primary-container/60 text-center leading-relaxed">
        Mode demo aktif. Akun seed tersedia untuk evaluasi; segera ubah password
        setelah login.
      </p>
    </div>
  )
}
