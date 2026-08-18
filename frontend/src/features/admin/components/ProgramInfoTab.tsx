import { useState, useEffect, type FormEvent } from 'react'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import { friendlyError } from '../../../core/utils/errorMessages'
import type { Program } from '../../../core/types'
import { BadgeEditor } from './BadgeEditor'

interface ProgramInfoTabProps {
  program: Program
  onSaved?: (updated: Program) => void
}

export function ProgramInfoTab({ program, onSaved }: ProgramInfoTabProps) {
  const { addToast } = useGlobalToast()
  const [name, setName] = useState(program.name)
  const [description, setDescription] = useState(program.description ?? '')
  const [isActive, setIsActive] = useState(program.is_active)
  const [finalBadgeName, setFinalBadgeName] = useState(program.final_badge_name ?? '')
  const [finalBadgeImageUrl, setFinalBadgeImageUrl] = useState(program.final_badge_image_url ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(program.name)
    setDescription(program.description ?? '')
    setIsActive(program.is_active)
    setFinalBadgeName(program.final_badge_name ?? '')
    setFinalBadgeImageUrl(program.final_badge_image_url ?? '')
  }, [program.id, program.name, program.description, program.is_active, program.final_badge_name, program.final_badge_image_url])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      addToast({ type: 'error', message: 'Nama program tidak boleh kosong' })
      return
    }
    setSaving(true)
    try {
      const updated = await programService.update(program.id, {
        name: name.trim(),
        description,
        is_active: isActive,
        final_badge_name: finalBadgeName,
        final_badge_image_url: finalBadgeImageUrl,
      })
      addToast({ type: 'success', message: 'Perubahan berhasil disimpan' })
      onSaved?.(updated)
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="space-y-4 max-w-2xl" onSubmit={onSubmit}>
      <Input label="Nama Program" value={name} onChange={(e) => setName(e.target.value)} />
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">Deskripsi</label>
        <textarea value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
          rows={4} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
        <label htmlFor="active" className="text-sm text-on-surface">Program Aktif</label>
      </div>

      <BadgeEditor
        title="Badge Final Program"
        name={finalBadgeName}
        imageUrl={finalBadgeImageUrl}
        onNameChange={setFinalBadgeName}
        onImageChange={setFinalBadgeImageUrl}
      />

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>Simpan Perubahan</Button>
      </div>
    </form>
  )
}
