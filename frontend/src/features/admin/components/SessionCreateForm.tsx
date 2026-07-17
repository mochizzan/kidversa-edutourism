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
  newStartTime: string
  setNewStartTime: (v: string) => void
  newEndTime: string
  setNewEndTime: (v: string) => void
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
  newDate, setNewDate, newStartTime, setNewStartTime, newEndTime, setNewEndTime,
  newLocation, setNewLocation, newNotes, setNewNotes, creating, onCancel, onSubmit,
}: SessionCreateFormProps) {
  const timeValid = (newStartTime === '' && newEndTime === '') || (newStartTime !== '' && newEndTime !== '')

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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Jam Mulai</label>
          <input type="time" value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)}
            className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
            disabled={creating} />
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Jam Selesai</label>
          <input type="time" value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)}
            className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
            disabled={creating} />
        </div>
      </div>
      {!timeValid && (newStartTime !== '' || newEndTime !== '') && (
        <p className="text-xs text-error">Jam mulai dan jam selesai harus diisi bersamaan.</p>
      )}
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
        <Button type="submit" disabled={creating || !newName.trim() || !newProgramId || !newDate || !newLocation.trim() || !timeValid}>
          {creating ? 'Menyimpan…' : 'Simpan Sesi'}
        </Button>
      </div>
    </form>
  )
}
