import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import type { Program } from '../../../core/types'

interface ProgramInfoTabProps {
  program: Program
}

export function ProgramInfoTab({ program }: ProgramInfoTabProps) {
  return (
    <form className="space-y-4 max-w-2xl" onSubmit={(e) => { e.preventDefault(); /* TODO: wire programService.update when backend is ready */ }}>
      <Input label="Nama Program" defaultValue={program.name} />
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">Deskripsi</label>
        <textarea defaultValue={program.description}
          className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
          rows={4} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="active" defaultChecked={program.is_active} className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
        <label htmlFor="active" className="text-sm text-on-surface">Program Aktif</label>
      </div>
      <div className="flex justify-end">
        <Button type="submit">Simpan Perubahan</Button>
      </div>
    </form>
  )
}
