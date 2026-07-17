import { CheckCircle2, XCircle, Clock, Send } from 'lucide-react'
import type { ConsentStatus } from '../hooks/useConsentMonitor'

interface ConsentStatusBadgeProps {
  status: ConsentStatus
}

export const ConsentStatusBadge = ({ status }: ConsentStatusBadgeProps) => {
  switch (status) {
    case 'granted':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
          <CheckCircle2 className="w-3.5 h-3.5" /> Setuju
        </span>
      )
    case 'denied':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
          <XCircle className="w-3.5 h-3.5" /> Tolak
        </span>
      )
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-600">
          <Clock className="w-3.5 h-3.5" /> Menunggu
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
          <Send className="w-3.5 h-3.5" /> Belum Dikirim
        </span>
      )
  }
}
