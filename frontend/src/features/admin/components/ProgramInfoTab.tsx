import { useTranslation } from 'react-i18next'
import { Badge } from '../../../shared/components/ui/Badge'
import { Card } from '../../../shared/components/ui/Card'
import type { Program } from '../../../core/types'

interface ProgramInfoTabProps {
  program: Program
}

/** Read-only detail view for a program. Editing lives only in ProgramFormPage. */
export function ProgramInfoTab({ program }: ProgramInfoTabProps) {
  const { t } = useTranslation()

  return (
    <Card title={t('admin.common.detail')}>
      <dl className="space-y-4 max-w-2xl">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('admin.col.programName')}</dt>
          <dd className="mt-1 text-sm text-on-surface">{program.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('admin.programs.descLabel')}</dt>
          <dd className="mt-1 text-sm text-on-surface whitespace-pre-wrap">{program.description || '-'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('admin.programs.activeLabel')}</dt>
          <dd className="mt-1">
            <Badge variant={program.is_active ? 'success' : 'neutral'}>
              {program.is_active ? t('admin.status.active') : t('admin.status.inactive')}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('admin.programs.finalBadgeTitle')}</dt>
          <dd className="mt-1 flex items-center gap-3">
            {program.final_badge_image_url ? (
              <img
                src={program.final_badge_image_url}
                alt={program.final_badge_name || t('admin.programs.badgeAlt')}
                className="h-10 w-10 rounded-full object-cover border border-outline-variant"
              />
            ) : null}
            <span className="text-sm text-on-surface">{program.final_badge_name || '-'}</span>
          </dd>
        </div>
      </dl>
    </Card>
  )
}
