import { BOOTSTRAP_USERS, BOOTSTRAP_PASSWORD } from '../../../core/services/local/bootstrap'

export function DemoHint() {
  const displayUsers = BOOTSTRAP_USERS.map((u) => u.email)

  return (
    <div className="p-3 rounded-xl bg-primary-container/40 border border-primary-100/60">
      <p className="text-xs text-on-primary-container/60 text-center leading-relaxed">
        <span className="font-semibold text-on-primary-container/80">Demo:</span>{' '}
        {displayUsers[0]} / {BOOTSTRAP_PASSWORD}
      </p>
      {displayUsers.length > 1 && (
        <p className="text-[11px] text-on-primary-container/40 text-center mt-0.5">
          Juga tersedia: {displayUsers.slice(1).join(' \u2022 ')}
        </p>
      )}
    </div>
  )
}
