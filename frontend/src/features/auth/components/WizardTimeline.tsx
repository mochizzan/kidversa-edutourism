import { Check } from 'lucide-react'
import { cn } from '../../../core/utils'

interface WizardStep {
  label: string
  desc: string
}

interface WizardTimelineProps {
  steps: readonly WizardStep[]
  currentStep: number
}

export function WizardTimeline({ steps, currentStep }: WizardTimelineProps) {
  return (
    <div className="mb-7">
      <div className="flex items-center">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            {/* Circle */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 shrink-0',
                  i < currentStep && 'bg-primary text-on-primary shadow-sm',
                  i === currentStep && 'bg-primary text-on-primary shadow-lg shadow-primary/30 animate-[stepPulse_2s_ease-in-out_infinite]',
                  i > currentStep && 'bg-surface-container-high text-on-surface-variant/30 border border-outline-variant/30',
                )}
              >
                {i < currentStep ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-[10px] mt-1.5 font-medium whitespace-nowrap transition-colors',
                  i <= currentStep ? 'text-primary' : 'text-on-surface-variant/30',
                )}
              >
                {s.label}
              </span>
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 rounded-full relative overflow-hidden bg-surface-container-high mb-5">
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500 ease-out',
                    i < currentStep ? 'w-full' : 'w-0',
                  )}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
