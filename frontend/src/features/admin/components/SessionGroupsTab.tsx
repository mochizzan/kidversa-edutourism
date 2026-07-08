import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Upload, UserPlus } from 'lucide-react'
import { Badge } from '../../../shared/components/ui/Badge'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { sessionService } from '../../../core/services/sessions'
import { participantService } from '../../../core/services/participants'
import { GroupFormModal } from './GroupFormModal'
import { ParticipantFormModal } from './ParticipantFormModal'
import { CsvImportModal } from './CsvImportModal'
import type { SessionGroup, Participant, CreateParticipantDTO } from '../../../core/types'
import type { ImportRow } from '../utils/csvParser'

interface SessionGroupsTabProps {
  sessionId: string
  sessionStatus: string
  groups: (SessionGroup & { participants: Participant[] })[]
  onRefresh: () => void
}

export function SessionGroupsTab({ sessionId, sessionStatus, groups, onRefresh }: SessionGroupsTabProps) {
  const { addToast } = useGlobalToast()
  const isDraft = sessionStatus === 'DRAFT'
  const canModifyParticipants = sessionStatus === 'DRAFT' || sessionStatus === 'ACTIVE'

  const [groupFormOpen, setGroupFormOpen] = useState(false)
  const [groupFormMode, setGroupFormMode] = useState<'create' | 'edit'>('create')
  const [editingGroup, setEditingGroup] = useState<SessionGroup | null>(null)

  const [participantFormOpen, setParticipantFormOpen] = useState(false)
  const [participantFormMode, setParticipantFormMode] = useState<'create' | 'edit'>('create')
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const [csvImportOpen, setCsvImportOpen] = useState(false)

  const [confirmGroup, setConfirmGroup] = useState<SessionGroup & { participants: Participant[] } | null>(null)
  const [confirmParticipant, setConfirmParticipant] = useState<Participant | null>(null)

  const [availableParticipants, setAvailableParticipants] = useState<Participant[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const loadAvailableParticipants = async () => {
    try {
      const res = await participantService.getAll({ limit: 100 })
      setAvailableParticipants(res.data.filter(p => !p.session_id))
    } catch {
      setAvailableParticipants([])
    }
  }

  useEffect(() => {
    loadAvailableParticipants()
  }, [refreshKey])

  const existingGroupNames = groups.map((g) => g.name)

  const handleCreateGroup = async (name: string) => {
    try {
      await sessionService.createGroup(sessionId, name)
      addToast({ type: 'success', message: 'Kelompok berhasil ditambahkan' })
      onRefresh()
      setRefreshKey(k => k + 1)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Gagal membuat kelompok')
    }
  }

  const handleEditGroup = async (name: string) => {
    if (!editingGroup) return
    try {
      await sessionService.updateGroup(sessionId, editingGroup.id, name)
      addToast({ type: 'success', message: 'Kelompok berhasil diperbarui' })
      onRefresh()
      setRefreshKey(k => k + 1)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Gagal memperbarui kelompok')
    }
  }

  const handleDeleteGroup = async (group: SessionGroup & { participants: Participant[] }) => {
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
      setRefreshKey(k => k + 1)
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal menghapus kelompok' })
    } finally {
      setConfirmGroup(null)
    }
  }

  const handleLinkParticipant = async (participantId: string) => {
    if (!selectedGroupId) return
    await sessionService.linkParticipant(sessionId, selectedGroupId, participantId)
    addToast({ type: 'success', message: 'Peserta berhasil ditambahkan ke kelompok' })
    onRefresh()
    setRefreshKey(k => k + 1)
  }

  const handleEditParticipant = async (data: Omit<CreateParticipantDTO, 'group_id'>) => {
    if (!editingParticipant) return
    try {
      await sessionService.updateParticipant(sessionId, editingParticipant.id, data)
      addToast({ type: 'success', message: 'Peserta berhasil diperbarui' })
      onRefresh()
      setRefreshKey(k => k + 1)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Gagal memperbarui peserta')
    }
  }

  const handleDeleteParticipant = async (participant: Participant) => {
    setConfirmParticipant(participant)
  }

  const confirmDeleteParticipant = async () => {
    if (!confirmParticipant) return
    try {
      await sessionService.removeParticipant(sessionId, confirmParticipant.id)
      addToast({ type: 'success', message: 'Peserta berhasil dihapus' })
      onRefresh()
      setRefreshKey(k => k + 1)
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal menghapus peserta' })
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
    setParticipantFormMode('create')
    setEditingParticipant(null)
    setSelectedGroupId(groupId)
    setParticipantFormOpen(true)
  }

  const openEditParticipantModal = (participant: Participant) => {
    setParticipantFormMode('edit')
    setEditingParticipant(participant)
    setSelectedGroupId(participant.group_id ?? null)
    setParticipantFormOpen(true)
  }

  return (
    <div className="space-y-4">
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
        groups.map((group) => (
          <Card
            key={group.id}
            title={group.name}
            actions={
              isDraft && (
                <div className="flex gap-1">
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
              )
            }
          >
            <div className="space-y-2">
              {group.participants?.map((participant) => (
                <div key={participant.id} className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
                  <div className="flex-1">
                    <p className="font-medium text-on-surface">{participant.child_name}</p>
                    <p className="text-sm text-on-surface-variant">
                      Umur {participant.child_age} · {participant.parent_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={participant.consent_recording ? 'success' : 'danger'}>Recording</Badge>
                    <Badge variant={participant.consent_photo ? 'success' : 'danger'}>Photo</Badge>
                    {canModifyParticipants && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Pencil className="w-4 h-4" />}
                          onClick={() => openEditParticipantModal(participant)}
                          tooltip="Edit peserta"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 className="w-4 h-4" />}
                          onClick={() => handleDeleteParticipant(participant)}
                          tooltip="Hapus peserta"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {canModifyParticipants && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<UserPlus className="w-4 h-4" />}
                  onClick={() => openAddParticipantModal(group.id)}
                  className="w-full"
                >
                  Tambah Peserta
                </Button>
              )}
            </div>
          </Card>
        ))
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
        onSubmit={handleEditParticipant}
        mode={participantFormMode}
        selectOnly={participantFormMode === 'create'}
        availableParticipants={availableParticipants}
        onLinkExisting={handleLinkParticipant}
        initialData={
          editingParticipant
            ? {
                child_name: editingParticipant.child_name,
                child_age: editingParticipant.child_age,
                school_name: editingParticipant.school_name,
                parent_name: editingParticipant.parent_name,
                parent_phone: editingParticipant.parent_phone,
                parent_email: editingParticipant.parent_email,
              }
            : undefined
        }
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
        title="Hapus Peserta"
        message={`Yakin ingin menghapus peserta "${confirmParticipant?.child_name || ''}"? Tindakan ini tidak dapat dibatalkan.`}
        onConfirm={confirmDeleteParticipant}
        onClose={() => setConfirmParticipant(null)}
      />
    </div>
  )
}
