import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Upload, UserPlus, ChevronDown, ChevronRight, Users, User as UserIcon } from 'lucide-react'
import { Badge } from '../../../shared/components/ui/Badge'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Select } from '../../../shared/components/ui/Select'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { sessionService } from '../../../core/services/sessions'
import { participantService } from '../../../core/services/participants'
import { GroupFormModal } from './GroupFormModal'
import { ParticipantFormModal } from './ParticipantFormModal'
import { CsvImportModal } from './CsvImportModal'
import { ROUTES } from '../../../core/constants/app'
import type { SessionGroup, Participant, CreateParticipantDTO, User } from '../../../core/types'
import type { ImportRow } from '../utils/csvParser'
import { friendlyError } from '../../../core/utils/errorMessages'

interface SessionGroupsTabProps {
  sessionId: string
  sessionStatus: string
  groups: (SessionGroup & { participants: Participant[] })[]
  facilitators: User[]
  onRefresh: () => void
}

const groupStatusVariant: Record<string, 'neutral' | 'warning' | 'success'> = {
  WAITING: 'neutral',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
}

const groupStatusLabel: Record<string, string> = {
  WAITING: 'Menunggu',
  IN_PROGRESS: 'Berlangsung',
  COMPLETED: 'Selesai',
}

export function SessionGroupsTab({ sessionId, sessionStatus, groups, facilitators, onRefresh }: SessionGroupsTabProps) {
  const { addToast } = useGlobalToast()
  const navigate = useNavigate()
  const isDraft = sessionStatus === 'DRAFT'
  const canModifyParticipants = sessionStatus === 'DRAFT' || sessionStatus === 'ACTIVE'

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, true]))
  )
  const [pendingFacilitator, setPendingFacilitator] = useState<Record<string, boolean>>({})
  const [facilitatorOverride, setFacilitatorOverride] = useState<Record<string, string | null>>({})

  const [groupFormOpen, setGroupFormOpen] = useState(false)
  const [groupFormMode, setGroupFormMode] = useState<'create' | 'edit'>('create')
  const [editingGroup, setEditingGroup] = useState<SessionGroup | null>(null)

  const [participantFormOpen, setParticipantFormOpen] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const [csvImportOpen, setCsvImportOpen] = useState(false)

  const [confirmGroup, setConfirmGroup] = useState<SessionGroup & { participants: Participant[] } | null>(null)
  const [confirmParticipant, setConfirmParticipant] = useState<Participant | null>(null)

  const [availableParticipants, setAvailableParticipants] = useState<Participant[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setFacilitatorOverride((prev) => {
      const next = { ...prev }
      let changed = false
      for (const group of groups) {
        if (group.id in next && (next[group.id] ?? null) === (group.facilitator_id ?? null)) {
          delete next[group.id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [groups])

  const linkedParticipantIds = groups.flatMap((g) => g.participants.map((p) => p.id))
  const facilitatorOptions = useMemo(
    () => [{ value: '', label: 'Pilih Fasilitator' }, ...facilitators.map((f) => ({ value: f.id, label: f.name }))],
    [facilitators]
  )

  const loadAvailableParticipants = async () => {
    try {
      const res = await participantService.getAll({ limit: 100 })
      setAvailableParticipants(res.data)
    } catch {
      setAvailableParticipants([])
    }
  }

  useEffect(() => {
    loadAvailableParticipants()
  }, [refreshKey])

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev }
      for (const g of groups) if (!(g.id in next)) next[g.id] = true
      return next
    })
  }, [groups])

  const existingGroupNames = groups.map((g) => g.name)

  const handleCreateGroup = async (name: string) => {
    try {
      await sessionService.createGroup(sessionId, name)
      addToast({ type: 'success', message: 'Kelompok berhasil ditambahkan' })
      onRefresh()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      throw new Error(friendlyError(err))
    }
  }

  const handleEditGroup = async (name: string) => {
    if (!editingGroup) return
    try {
      await sessionService.updateGroup(sessionId, editingGroup.id, { name, facilitatorId: editingGroup.facilitator_id ?? null })
      addToast({ type: 'success', message: 'Kelompok berhasil diperbarui' })
      onRefresh()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      throw new Error(friendlyError(err))
    }
  }

  const handleAssignFacilitator = async (group: SessionGroup & { participants: Participant[] }, facilitatorId: string) => {
    const normalized = facilitatorId || null
    const previous = group.id in facilitatorOverride
      ? facilitatorOverride[group.id]
      : (group.facilitator_id ?? null)
    if (normalized === previous) return
    setFacilitatorOverride((p) => ({ ...p, [group.id]: normalized }))
    setPendingFacilitator((p) => ({ ...p, [group.id]: true }))
    try {
      await sessionService.updateGroup(sessionId, group.id, { name: group.name, facilitatorId: normalized })
      onRefresh()
    } catch (err) {
      setFacilitatorOverride((p) => ({ ...p, [group.id]: previous }))
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setPendingFacilitator((p) => ({ ...p, [group.id]: false }))
    }
  }

  const handleDeleteGroup = (group: SessionGroup & { participants: Participant[] }) => {
    if (group.participants.length > 0) {
      addToast({ type: 'error', message: 'Tidak dapat menghapus kelompok yang memiliki peserta' })
      return
    }
    setConfirmGroup(group)
  }

  const confirmDeleteGroup = async () => {
    if (!confirmGroup) return
    try {
      await sessionService.deleteGroup(sessionId, confirmGroup.id)
      addToast({ type: 'success', message: 'Kelompok berhasil dihapus' })
      onRefresh()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setConfirmGroup(null)
    }
  }

  const handleLinkParticipant = async (participantId: string) => {
    if (!selectedGroupId) return
    await sessionService.linkParticipant(sessionId, selectedGroupId, participantId)
    addToast({ type: 'success', message: 'Peserta berhasil ditambahkan ke kelompok' })
    onRefresh()
    setRefreshKey((k) => k + 1)
  }

  const handleDeleteParticipant = (participant: Participant) => {
    setConfirmParticipant(participant)
  }

  const confirmDeleteParticipant = async () => {
    if (!confirmParticipant) return
    try {
      await sessionService.removeParticipant(sessionId, confirmParticipant.id)
      addToast({ type: 'success', message: 'Peserta berhasil dilepas dari kelompok' })
      onRefresh()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setConfirmParticipant(null)
    }
  }

  const handleCsvImport = async (rows: ImportRow[]) => {
    const groupMap = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]))
    const newGroups: { sessionId: string; groupId: string }[] = []

    try {
      for (const row of rows) {
        const key = row.group_name.toLowerCase()
        if (!groupMap.has(key)) {
          const newGroup = await sessionService.createGroup(sessionId, row.group_name)
          groupMap.set(key, newGroup.id)
          newGroups.push({ sessionId, groupId: newGroup.id })
        }
      }

      const participantDTOs: CreateParticipantDTO[] = rows.map((row) => ({
        child_name: row.child_name,
        child_age: row.child_age,
        school_name: row.school_name,
        parent_name: row.parent_name,
        parent_phone: row.parent_phone,
        parent_email: row.parent_email,
        group_id: groupMap.get(row.group_name.toLowerCase())!,
      }))

      await sessionService.importParticipants(sessionId, participantDTOs)
    } catch (err) {
      for (const g of newGroups) {
        await sessionService.deleteGroup(g.sessionId, g.groupId).catch(() => {})
      }
      throw err
    }
  }

  const openAddGroupModal = () => {
    setGroupFormMode('create')
    setEditingGroup(null)
    setGroupFormOpen(true)
  }

  const openEditGroupModal = (group: SessionGroup) => {
    setGroupFormMode('edit')
    setEditingGroup(group)
    setGroupFormOpen(true)
  }

  const openAddParticipantModal = (groupId: string) => {
    setSelectedGroupId(groupId)
    setParticipantFormOpen(true)
  }

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }))

  const totalParticipants = groups.reduce((sum, g) => sum + g.participants.length, 0)
  const assignedGroups = groups.filter((g) => g.facilitator_id).length
  const facilitatorPool = new Set(facilitators.map((f) => f.id))
  const usedFacilitators = groups.filter((g) => g.facilitator_id && facilitatorPool.has(g.facilitator_id)).length

  return (
    <div className="space-y-4">
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-on-surface-variant">
            Kelompok: <span className="font-semibold text-on-surface">{groups.length}</span>
          </span>
          <span className="text-on-surface-variant">
            Peserta: <span className="font-semibold text-on-surface">{totalParticipants}</span>
          </span>
          <span className="text-on-surface-variant">
            Kelompok berfasilitator: <span className="font-semibold text-on-surface">{assignedGroups}</span> / {groups.length}
          </span>
          {!isDraft && (
            <span className="text-on-surface-variant">
              Fasilitator terpakai: <span className="font-semibold text-on-surface">{usedFacilitators}</span> / {facilitators.length}
            </span>
          )}
        </div>
      </Card>

      {isDraft && (
        <div className="flex gap-2">
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAddGroupModal}>
            Tambah Kelompok
          </Button>
          <Button variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={() => setCsvImportOpen(true)}>
            Import CSV
          </Button>
        </div>
      )}

      {groups.length === 0 ? (
        <Card>
          <div className="text-center py-8 text-on-surface-variant">
            <p>Belum ada kelompok. {isDraft && 'Tambahkan kelompok atau import CSV untuk memulai.'}</p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const isOpen = expanded[group.id]
            const effectiveFacilitatorId = (group.id in facilitatorOverride ? facilitatorOverride[group.id] : group.facilitator_id) ?? ''
            const facilitator = facilitators.find((f) => f.id === effectiveFacilitatorId)
            const participants = group.participants
            return (
              <Card key={group.id} padding="none">
                <div className="p-4">
                  {/* Tingkat 1: Kelompok (akar) */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggle(group.id)}
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-primary-50 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? `Tutup kelompok ${group.name}` : `Buka kelompok ${group.name}`}
                      >
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <Users className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-semibold text-on-surface">{group.name}</span>
                      <Badge variant={groupStatusVariant[group.status] || 'neutral'}>
                        {groupStatusLabel[group.status] || group.status}
                      </Badge>
                      <Badge variant="accent">{group.participants.length} anak</Badge>
                    </div>

                    {isDraft && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Pencil className="w-4 h-4" />}
                          onClick={() => openEditGroupModal(group)}
                          tooltip="Edit kelompok"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 className="w-4 h-4" />}
                          onClick={() => handleDeleteGroup(group)}
                          tooltip={group.participants.length > 0 ? 'Tidak dapat menghapus kelompok yang memiliki peserta' : 'Hapus kelompok'}
                          disabled={group.participants.length > 0}
                        />
                      </div>
                    )}
                  </div>

                  {/* Tingkat 2 + 3: pohon dengan garis border (tidak terputus) */}
                  {isOpen && (
                    <div className="mt-2 border-l-2 border-primary-200 ml-2.5 pl-4 space-y-2">
                      {/* Cabang fasilitator */}
                      <div className="relative flex items-center gap-2">
                        <span aria-hidden className="pointer-events-none absolute -left-4 top-1/2 h-px w-4 -translate-y-1/2 bg-primary-200" />
                        <UserIcon className="w-4 h-4 shrink-0 text-primary-400" />
                        <span className="text-sm font-medium text-on-surface-variant">Fasilitator</span>
                        {isDraft ? (
                          <div className="w-auto min-w-[180px] max-w-[240px] flex-1">
                            <Select
                              value={effectiveFacilitatorId ?? ''}
                              options={facilitatorOptions}
                              disabled={pendingFacilitator[group.id]}
                              onChange={(e) => handleAssignFacilitator(group, e.target.value)}
                              aria-label={`Fasilitator kelompok ${group.name}`}
                            />
                          </div>
                        ) : (
                          <span className="text-sm font-semibold text-on-surface truncate">
                            {facilitator?.name || 'Belum ada fasilitator'}
                          </span>
                        )}
                      </div>

                      {/* Tingkat 3: Peserta sebagai anak fasilitator */}
                      <div className="relative border-l-2 border-primary-200 pl-4 space-y-1.5">
                        {participants.length === 0 ? (
                          <div className="relative flex items-center">
                            <span aria-hidden className="pointer-events-none absolute -left-4 top-1/2 h-px w-4 -translate-y-1/2 bg-primary-200" />
                            <p className="py-0.5 text-sm text-on-surface-variant italic">
                              Belum ada peserta di kelompok ini.
                            </p>
                          </div>
                        ) : (
                          participants.map((participant) => (
                            <div
                              key={participant.id}
                              className="relative flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5 hover:bg-surface-container-low/60"
                            >
                              <span aria-hidden className="pointer-events-none absolute -left-4 top-1/2 h-px w-4 -translate-y-1/2 bg-primary-200" />
                              <UserIcon className="w-3.5 h-3.5 shrink-0 text-on-surface-variant" />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-on-surface">{participant.child_name}</p>
                                <p className="mt-0.5 text-xs text-on-surface-variant">
                                  Umur {participant.child_age} · {participant.parent_name}
                                  {participant.school_name ? ` · ${participant.school_name}` : ''}
                                </p>
                              </div>

                              <div className="flex shrink-0 items-center gap-1.5">
                                <Badge variant={participant.consent_recording ? 'success' : 'danger'}>Recording</Badge>
                                <Badge variant={participant.consent_photo ? 'success' : 'danger'}>Photo</Badge>
                              </div>

                              {canModifyParticipants && (
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={<Pencil className="w-4 h-4" />}
                                    onClick={() => navigate(`${ROUTES.ADMIN.PARTICIPANTS}/${participant.id}/edit`)}
                                    tooltip="Edit peserta"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={<Trash2 className="w-4 h-4" />}
                                    onClick={() => handleDeleteParticipant(participant)}
                                    tooltip="Lepas peserta"
                                  />
                                </div>
                              )}
                            </div>
                          ))
                        )}

                        {canModifyParticipants && (
                          <div className="flex justify-end pt-0.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<UserPlus className="w-4 h-4" />}
                              onClick={() => openAddParticipantModal(group.id)}
                            >
                              Tambah Peserta
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <GroupFormModal
        open={groupFormOpen}
        onClose={() => setGroupFormOpen(false)}
        onSubmit={groupFormMode === 'create' ? handleCreateGroup : handleEditGroup}
        mode={groupFormMode}
        initialName={editingGroup?.name || ''}
        existingNames={existingGroupNames}
      />

      <ParticipantFormModal
        open={participantFormOpen}
        onClose={() => setParticipantFormOpen(false)}
        mode="create"
        selectOnly
        availableParticipants={availableParticipants}
        onLinkExisting={handleLinkParticipant}
        linkedParticipantIds={linkedParticipantIds}
      />

      <CsvImportModal open={csvImportOpen} onClose={() => setCsvImportOpen(false)} onImport={handleCsvImport} />

      <ConfirmDialog
        open={!!confirmGroup}
        title="Hapus Kelompok"
        message={`Yakin ingin menghapus kelompok "${confirmGroup?.name || ''}"? Tindakan ini tidak dapat dibatalkan.`}
        onConfirm={confirmDeleteGroup}
        onClose={() => setConfirmGroup(null)}
      />

      <ConfirmDialog
        open={!!confirmParticipant}
        title="Lepas Peserta"
        message={`Yakin ingin melepaskan peserta "${confirmParticipant?.child_name || ''}" dari kelompok ini? Peserta masih bisa ditambahkan kembali.`}
        confirmLabel="Lepas"
        onConfirm={confirmDeleteParticipant}
        onClose={() => setConfirmParticipant(null)}
      />
    </div>
  )
}
