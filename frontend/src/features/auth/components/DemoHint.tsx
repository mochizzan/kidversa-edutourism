export function DemoHint() {
  const seededAccounts = [
    { email: 'superadmin@kidversa.id', role: 'Super Admin' },
    { email: 'admin.bandung@kidversa.id', role: 'Admin Bandung' },
    { email: 'admin.subang@kidversa.id', role: 'Admin Subang' },
  ]

  return (
    <div className="p-3 rounded-xl bg-primary-container/40 border border-primary-100/60">
      <p className="text-xs text-on-primary-container/60 text-center leading-relaxed">
        <span className="font-semibold text-on-primary-container/80">Akun demo:</span>{' '}
        {seededAccounts[0].email} / password123
      </p>
      <p className="text-[11px] text-on-primary-container/40 text-center mt-0.5">
        Juga tersedia: {seededAccounts.slice(1).map((a) => `${a.email} (${a.role})`).join(' • ')}
      </p>
      <p className="text-[11px] text-on-primary-container/40 text-center mt-0.5">
        Password wajib diubah pada login pertama.
      </p>
    </div>
  )
}
