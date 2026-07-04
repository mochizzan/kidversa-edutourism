import { MOCK_DEFAULT_PASSWORD } from '../../../core/config/mock-accounts'

export function DemoHint() {
  return (
    <div className="p-3 rounded-xl bg-primary-container/40 border border-primary-100/60">
      <p className="text-xs text-on-primary-container/60 text-center leading-relaxed">
        <span className="font-semibold text-on-primary-container/80">Demo:</span>{' '}
        admin@kidversa.id / {MOCK_DEFAULT_PASSWORD}
      </p>
      <p className="text-[11px] text-on-primary-container/40 text-center mt-0.5">
        Juga tersedia: koordinator@kidversa.id &bull; f1@kidversa.id
      </p>
    </div>
  )
}
