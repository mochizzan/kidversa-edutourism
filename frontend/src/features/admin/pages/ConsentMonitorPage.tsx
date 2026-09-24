import { Shield, Loader2, AlertCircle, Search, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/ui/Button'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { Input } from '../../../shared/components/ui/Input'
import { useConsentMonitor, type ConsentStatus } from '../hooks/useConsentMonitor'
import { ConsentTable } from '../components/ConsentTable'

const STATUS_OPTIONS = [
  { value: 'all' as const, labelKey: 'admin.consent.allStatuses' },
  { value: 'not_sent' as const, labelKey: 'admin.consent.notSent' },
  { value: 'pending' as const, labelKey: 'admin.consent.pending' },
  { value: 'granted' as const, labelKey: 'admin.consent.granted' },
  { value: 'denied' as const, labelKey: 'admin.consent.denied' },
] as const

const ConsentMonitorPage = () => {
  const { t } = useTranslation()
  const {
    items,
    paged,
    loading,
    error,
    search,
    setSearch,
    filterStatus,
    setFilterStatus,
    page,
    setPage,
    totalPages,
    totalItems,
    sendSingle,
    sendAll,
    refresh,
    sending,
    batchSending,
  } = useConsentMonitor()

  // Summary stats
  const countNotSent = items.filter((i) => i.consent_status === 'not_sent').length
  const countPending = items.filter((i) => i.consent_status === 'pending').length
  const countGranted = items.filter((i) => i.consent_status === 'granted').length
  const countDenied = items.filter((i) => i.consent_status === 'denied').length

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.consent.title')}
        subtitle={t('admin.consent.subtitle')}
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-on-surface-variant">{t('admin.consent.loading')}</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-error-container/30 rounded-2xl p-6 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-on-error-container" />
          <p className="text-sm font-medium text-on-error-container mb-2">{error}</p>
          <Button variant="secondary" size="sm" onClick={refresh}>
            {t('common.error.retry')}
          </Button>
        </div>
      )}

      {/* Empty state — no data at all */}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={<Shield className="w-12 h-12" />}
          title={t('admin.consent.emptyTitle')}
          description={t('admin.consent.emptyDesc')}
        />
      )}

      {/* Data */}
      {!loading && !error && items.length > 0 && (
        <>
          {/* Summary stats */}
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-surface-container text-on-surface">
              {t('admin.consent.countAll', { count: items.length })}
            </span>
            <span className="px-3 py-1 rounded-full bg-surface-container text-on-surface-variant">
              {t('admin.consent.countNotSent', { count: countNotSent })}
            </span>
            <span className="px-3 py-1 rounded-full bg-yellow-50 text-yellow-700">
              {t('admin.consent.countPending', { count: countPending })}
            </span>
            <span className="px-3 py-1 rounded-full bg-green-50 text-green-700">
              {t('admin.consent.countGranted', { count: countGranted })}
            </span>
            <span className="px-3 py-1 rounded-full bg-red-50 text-red-600">
              {t('admin.consent.countDenied', { count: countDenied })}
            </span>
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder={t('admin.consent.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ConsentStatus | 'all')}
              className="px-3 py-2 rounded-xl border border-outline/30 bg-white text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              size="md"
              icon={<Send />}
              onClick={sendAll}
              loading={batchSending}
            >
              {t('admin.consent.sendAll')}
            </Button>
          </div>

          {/* Table */}
          <ConsentTable
            items={paged}
            sending={sending}
            onSend={sendSingle}
            onResend={(id) => sendSingle(id, true)}
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            onPageChange={setPage}
          />

          {/* Empty filtered state */}
          {paged.length === 0 && totalItems === 0 && (
            <EmptyState
              icon={<Search className="w-12 h-12" />}
              title={t('admin.consent.noResultsTitle')}
              description={t('admin.consent.noResultsDesc')}
            />
          )}
        </>
      )}
    </div>
  )
}

export default ConsentMonitorPage
