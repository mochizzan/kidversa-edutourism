import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { formatDateTime } from '../../../shared/utils'
import { Pencil, Trash2, School2, UserRound, Phone, Mail, CalendarDays, Camera, Mic } from 'lucide-react'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Card } from '../../../shared/components/ui/Card'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { participantService } from '../../../core/services/participants'
import { sessionService } from '../../../core/services/sessions'
import type { Participant } from '../../../core/types'

const ParticipantDetailPage = () => {
  const { participantId } = useParams<{ participantId: string }>()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()

  const [participant, setParticipant] = useState<Participant | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!participantId) {
      setLoading(false)
      return
    }

    let cancelled = false

    const loadParticipant = async () => {
      try {
        const result = await participantService.getById(participantId)
        if (!cancelled) setParticipant(result)
      } catch {
        if (!cancelled) setParticipant(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadParticipant()
    return () => { cancelled = true }
  }, [participantId])

  const handleDelete = async () => {
    if (!participant) return
    try {
      // Global participant deletes are not exposed by the backend; remove the
      // participant from its session instead.
      if (!participant.session_id) {
        addToast({ type: 'error', message: 'Peserta tanpa sesi tidak dapat dihapus dari sini' })
        setConfirmOpen(false)
        return
      }
      await sessionService.removeParticipant(participant.session_id, participant.id)
      addToast({ type: 'success', message: 'Peserta berhasil dihapus' })
      navigate(ROUTES.ADMIN.PARTICIPANTS)
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal menghapus peserta' })
    } finally {
      setConfirmOpen(false)
    }
  }

  if (loading) {
    return <div className="text-on-surface-variant">Memuat detail peserta...</div>
  }

  if (!participant) {
    return (
      <ErrorState
        title="Peserta tidak ditemukan"
        message="Data peserta yang dicari tidak tersedia."
        action={{ label: 'Kembali', onClick: () => navigate(ROUTES.ADMIN.PARTICIPANTS) }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Peserta', href: ROUTES.ADMIN.PARTICIPANTS },
          { label: participant.child_name },
        ]}
        title={participant.child_name}
        subtitle={`${participant.child_age} tahun${participant.school_name ? ` · ${participant.school_name}` : ''} · ${participant.parent_name}`}
        actions={
          <div className="flex items-center gap-2">
            <Link to={`/admin/participants/${participant.id}/edit`}>
              <Button variant="secondary" icon={<Pencil className="w-4 h-4" />}>Edit</Button>
            </Link>
            <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirmOpen(true)}>Hapus</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Identitas">
          <div className="space-y-3 text-sm text-on-surface-variant">
            <p className="flex items-center gap-2"><UserRound className="w-4 h-4" /> {participant.child_name}</p>
            <p className="flex items-center gap-2"><CalendarDays className="w-4 h-4" /> {participant.child_age} tahun</p>
            <p className="flex items-center gap-2"><School2 className="w-4 h-4" /> {participant.school_name || 'Tidak ada sekolah'}</p>
            <p className="flex items-center gap-2"><Phone className="w-4 h-4" /> {participant.parent_phone}</p>
            <p className="flex items-center gap-2"><Mail className="w-4 h-4" /> {participant.parent_email || '-'}</p>
          </div>
        </Card>

        <Card title="Sesi">
          {participant.session_id ? (
            <div className="space-y-3 text-sm text-on-surface-variant">
              <p>Peserta sudah masuk sesi.</p>
              <Badge variant="primary">Status terikat sesi</Badge>
            </div>
          ) : (
            <EmptyState title="Peserta belum masuk sesi" description="Peserta ini masih master data dan belum memiliki progres sesi." />
          )}
        </Card>

        <Card title="Persetujuan">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={participant.consent_recording ? 'success' : 'danger'} size="sm">
                <Mic className="w-3 h-3 mr-1" />
                Rekaman: {participant.consent_recording ? 'Diizinkan' : 'Tidak Diizinkan'}
              </Badge>
              <Badge variant={participant.consent_photo ? 'success' : 'danger'} size="sm">
                <Camera className="w-3 h-3 mr-1" />
                Foto: {participant.consent_photo ? 'Diizinkan' : 'Tidak Diizinkan'}
              </Badge>
            </div>
            {participant.consent_at && (
              <p className="text-xs text-on-surface-variant">
                Disetujui: {formatDateTime(participant.consent_at)}
              </p>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Hapus Peserta"
        message={`Yakin ingin menghapus peserta "${participant.child_name}"?\n\nPeserta yang sudah terhubung ke sesi atau memiliki aktivitas tidak dapat dihapus. Tindakan ini tidak dapat dibatalkan.`}
        onConfirm={handleDelete}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  )
}

export default ParticipantDetailPage
