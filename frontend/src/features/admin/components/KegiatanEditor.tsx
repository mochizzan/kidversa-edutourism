import { useState } from 'react'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Loader2, Camera } from 'lucide-react'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programSubstageService } from '../../../core/services/programSubstages'
import type { ProgramSubstage } from '../../../core/types'
import { friendlyError } from '../../../core/utils/errorMessages'

interface KegiatanEditorProps {
  programStageId: string
  items: ProgramSubstage[]
  loading: boolean
  onChange: (items: ProgramSubstage[]) => void
  onReload: () => Promise<void>
  onRequestDelete: (item: ProgramSubstage) => void
}

interface DraftState {
  editing: ProgramSubstage | null
  name: string
  description: string
  duration_minutes: number
  is_photo_stage: boolean
}

const emptyDraft = (): DraftState => ({
  editing: null,
  name: '',
  description: '',
  duration_minutes: 0,
  is_photo_stage: true,
})

export function KegiatanEditor({
  programStageId,
  items,
  loading,
  onChange,
  onReload,
  onRequestDelete,
}: KegiatanEditorProps) {
  const { addToast } = useGlobalToast()
  const [draft, setDraft] = useState<DraftState>(emptyDraft())
  const [saving, setSaving] = useState(false)

  const startEdit = (k: ProgramSubstage) => {
    setDraft({
      editing: k,
      name: k.name,
      description: k.description ?? '',
      duration_minutes: k.duration_minutes,
      is_photo_stage: k.is_photo_stage,
    })
  }

  const startAdd = () => setDraft({ ...emptyDraft() })

  const cancel = () => setDraft(emptyDraft())

  const save = async () => {
    if (!draft.name.trim()) {
      addToast({ type: 'error', message: 'Nama kegiatan wajib diisi' })
      return
    }
    setSaving(true)
    try {
      if (draft.editing) {
        const updated = await programSubstageService.update(draft.editing.id, {
          name: draft.name.trim(),
          description: draft.description,
          duration_minutes: draft.duration_minutes,
          is_photo_stage: draft.is_photo_stage,
        })
        onChange(items.map((k) => (k.id === updated.id ? updated : k)))
      } else {
        const created = await programSubstageService.create({
          program_stage_id: programStageId,
          sequence_order: items.length + 1,
          name: draft.name.trim(),
          description: draft.description,
          duration_minutes: draft.duration_minutes,
          is_photo_stage: draft.is_photo_stage,
        })
        onChange([...items, created])
      }
      cancel()
      addToast({ type: 'success', message: 'Kegiatan disimpan' })
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setSaving(false)
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const reordered = [...items]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    const withOrder = reordered.map((k, i) => ({ ...k, sequence_order: i + 1 }))
    onChange(withOrder)
    try {
      await programSubstageService.reorder(withOrder.map((k) => k.id))
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
      await onReload()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-on-surface">Daftar Kegiatan</h4>
        {!draft.editing && (
          <Button icon={<Plus className="w-4 h-4" />} onClick={startAdd}>
            Tambah Kegiatan
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 && !draft.editing ? (
        <Card>
          <EmptyState
            icon={<Plus className="w-12 h-12" />}
            title="Belum ada kegiatan"
            description="Tambahkan kegiatan (Kegiatan) untuk SubTopik ini. Setiap kegiatan dapat dinilai per anak dan memicu badge SubTopik."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((k, i) => (
            <div
              key={k.id}
              className="flex items-center justify-between p-3 bg-surface-variant rounded-lg"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface">{k.name}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-on-surface-variant">
                  <span>{k.duration_minutes} menit</span>
                  {k.is_photo_stage && (
                    <span className="flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5" /> Foto
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Naik"
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  aria-label="Turun"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => startEdit(k)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => onRequestDelete(k)}
                  className="text-error"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft.editing !== undefined && (
        <Card>
          <h5 className="text-sm font-semibold text-on-surface mb-3">
            {draft.editing ? 'Edit Kegiatan' : 'Tambah Kegiatan'}
          </h5>
          <div className="space-y-3">
            <Input
              label="Nama Kegiatan"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              required
              placeholder="Nama kegiatan"
            />
            <Input
              label="Deskripsi"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Deskripsi kegiatan"
            />
            <Input
              label="Durasi (menit)"
              type="number"
              min={0}
              value={String(draft.duration_minutes)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, duration_minutes: Number(e.target.value) || 0 }))
              }
            />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-on-surface">
                <input
                  type="checkbox"
                  checked={draft.is_photo_stage}
                  onChange={(e) => setDraft((d) => ({ ...d, is_photo_stage: e.target.checked }))}
                  className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                />
                Foto
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={cancel} disabled={saving}>
                Batal
              </Button>
              <Button onClick={save} loading={saving}>
                {draft.editing ? 'Simpan' : 'Tambah'}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
