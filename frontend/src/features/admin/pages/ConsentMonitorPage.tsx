import { Shield, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { useConsentMonitor } from '../hooks/useConsentMonitor'
import { ConsentSessionCard } from '../components/ConsentSessionCard'

const ConsentMonitorPage = () => {
  const {
    sessions,
    consentData,
    loading,
    error,
    expandedSession,
    sending,
    activeBatch,
    progress,
    loadData,
    handleSendWhatsApp,
    getConsentStatus,
    toggleSession,
  } = useConsentMonitor()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitor Consent"
        subtitle="Pantau status persetujuan orang tua untuk setiap sesi."
      />

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-on-surface-variant">Memuat data consent...</span>
        </div>
      )}

      {!loading && error && (
        <div className="bg-error-container/30 rounded-2xl p-6 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-on-error-container" />
          <p className="text-sm font-medium text-on-error-container mb-2">{error}</p>
          <Button variant="secondary" size="sm" onClick={loadData}>
            Coba Lagi
          </Button>
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <EmptyState
          icon={<Shield className="w-12 h-12" />}
          title="Belum ada sesi"
          description="Belum ada sesi yang membutuhkan monitoring consent."
        />
      )}

      {!loading && !error && sessions.length > 0 && (
        <div className="space-y-3">
          {sessions.map((session) => {
            const data = consentData[session.id]
            if (!data) return null
            const isActiveBatch = activeBatch?.sessionId === session.id

            return (
              <ConsentSessionCard
                key={session.id}
                data={data}
                expanded={expandedSession === session.id}
                isActiveBatch={isActiveBatch}
                activeBatchTotal={activeBatch?.total ?? 0}
                progress={progress}
                sending={!!sending[session.id]}
                getConsentStatus={getConsentStatus}
                onSend={(force) => handleSendWhatsApp(session.id, force)}
                onToggle={() => toggleSession(session.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ConsentMonitorPage
