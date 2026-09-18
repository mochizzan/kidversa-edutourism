import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Pencil, Layers, Plus } from 'lucide-react'
import { Badge } from '../../../shared/components/ui/Badge'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import type { Program } from '../../../core/types'
import { formatDate } from '../../../shared/utils'
import { ROUTES, topicListPath, topicNewPath, programListPath } from '../../../core/constants/app'
import { friendlyError } from '../../../core/utils/errorMessages'
import { ProgramInfoTab } from '../components/ProgramInfoTab'

const ProgramDetailPage = () => {
  const { programId } = useParams<{ programId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { addToast } = useGlobalToast()
  const [program, setProgram] = useState<Program | null>(null)
  const [stages, setStages] = useState<import('../../../core/types').ProgramStage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!programId) return
    let cancelled = false
      ; (async () => {
        setLoading(true)
        try {
          const [fetchedProgram, fetchedStages] = await Promise.all([
            programService.getById(programId),
            programService.getStages(programId),
          ])
          if (cancelled) return
          setProgram(fetchedProgram)
          setStages(fetchedStages)
        } catch (err) {
          if (!cancelled) {
            addToast({ type: 'error', message: friendlyError(err) })
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    return () => { cancelled = true }
  }, [programId, addToast])

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>
  if (!program) return <div className="text-center text-on-surface-variant">Program not found</div>

  const showTopicCta = stages.length === 0 || (location.state as { fromCreate?: boolean } | null)?.fromCreate

  return (
    <div className="space-y-6">
      <PageHeader
        title={program.name}
        subtitle={`Dibuat ${formatDate(program.created_at)}`}
        breadcrumbs={[{ label: 'Programs', href: programListPath() }, { label: program.name }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Pencil className="w-4 h-4" />}
              onClick={() => navigate(`${ROUTES.ADMIN.PROGRAMS}/${program.id}/edit`)}
            >
              Edit Program
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Layers className="w-4 h-4" />}
              onClick={() => navigate(topicListPath({ programId: program.id }))}
            >
              Lihat Semua Topik
            </Button>
            <Badge variant={program.is_active ? 'success' : 'neutral'}>
              {program.is_active ? 'Aktif' : 'Nonaktif'}
            </Badge>
          </div>
        }
      />

      {showTopicCta && (
        <Card className="bg-primary-container border-primary-container">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-2">
            <div>
              <h3 className="text-sm font-semibold text-on-primary-container">
                {stages.length === 0 ? 'Program ini belum memiliki topik' : 'Program berhasil dibuat'}
              </h3>
              <p className="text-sm text-on-primary-container/80">
                {stages.length === 0
                  ? 'Tambahkan topik pertama untuk memulai perjalanan edutourism.'
                  : 'Sekarang tambahkan topik pertama untuk melengkapi program.'}
              </p>
            </div>
            <Button
              icon={<Plus className="w-4 h-4" />}
              onClick={() => navigate(topicNewPath({ programId: program.id }))}
            >
              Tambah Topik
            </Button>
          </div>
        </Card>
      )}

      <ProgramInfoTab program={program} onSaved={setProgram} />
    </div>
  )
}

export default ProgramDetailPage
