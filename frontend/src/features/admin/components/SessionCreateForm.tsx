import { Button } from '../../../shared/components/ui/Button'
import type { Program } from '../../../core/types'

interface SessionCreateFormProps {
  programs: Program[]
  newName: string
  setNewName: (v: string) => void
  newProgramId: string
  setNewProgramId: (v: string) => void
  newDate: string
  setNewDate: (v: string) => void
  newLocation: string
  setNewLocation: (v: string) => void
  newNotes: string
  setNewNotes: (v: string) => void
  creating: boolean
  onCancel: () => void
  onSubmit: () => void
}

export function SessionCreateForm({
  programs, newName, setNewName, newProgramId, setNewProgramId,
  newDate, setNewDate, newLocation, setNewLocation,
  newNotes, setNewNotes, creating, onCancel, onSubmit,
}: SessionCreateFormProps) {
  return (
    <form className="space-y-4 max-w-2xl" onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">Nama Sesi *</label>
        <input
          value={newName} onChange={(e) => setNewName(e.target.value)}
          className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
          placeholder="Nama sesi" required disabled={creating}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">Program *</label>
        <select
          value={newProgramId} onChange={(e) => setNewProgramId(e.target.value)}
          className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
          required disabled={creating}
        >
          <option value="">Pilih program</option>
          {programs.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">Tanggal *</label>
        <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
          className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
          required disabled={creating} />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">Lokasi *</label>
        <input value={newLocation} onChange={(e) => setNewLocation(e.target.value)}
          className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
          placeholder="Lokasi sesi" required disabled={creating} />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">Catatan</label>
        <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
          className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
          rows={3} placeholder="Catatan (opsional)" disabled={creating} />
      </div>
      <div className="flex items-center gap-3 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={creating}>Batal</Button>
        <Button type="submit" disabled={creating || !newName.trim() || !newProgramId || !newDate || !newLocation.trim()}>
          {creating ? 'Menyimpan…' : 'Simpan Sesi'}
        </Button>
      </div>
    </form>
  )
}
