import { useState, useEffect, useCallback } from 'react'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { useClientList, makeTextFilter } from '../../../shared/hooks/useClientList'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { missionService } from '../../../core/services/missions'
import { programService } from '../../../core/services/programs'
import type { MissionBank, Program, ProgramStage } from '../../../core/types'

export function useMissionBank() {
  const { addToast } = useGlobalToast()
  const { tenantId } = useTenantScope()

  const [selectedProgram, setSelectedProgram] = useState('')
  const [programs, setPrograms] = useState<Program[]>([])
  const [stageMap, setStageMap] = useState<Record<string, ProgramStage>>({})

  const [deactivateTarget, setDeactivateTarget] = useState<MissionBank | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<MissionBank | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    programService.getAll({ limit: 100 }).then((res) => setPrograms(res.data))
  }, [])

  const textFilter = makeTextFilter<MissionBank>(['title'])

  const filterFn = useCallback(
    (items: MissionBank[], search: string) => {
      let result = items
      if (selectedProgram) {
        result = result.filter((m) => m.program_id === selectedProgram)
      }
      return textFilter(result, search)
    },
    [selectedProgram, textFilter],
  )

  const {
    data: missions,
    allData,
    loading,
    error,
    page,
    totalItems,
    totalPages,
    setPage,
    setSearch,
    refresh,
  } = useClientList<MissionBank>({
    fetchFn: () => missionService.getAll({ limit: 1000 }).then((r) => r.data),
    filterFn,
    deps: [tenantId],
  })

  // Reset page when program filter changes
  useEffect(() => {
    setPage(1)
  }, [selectedProgram, setPage])

  // Build stage map from all mission data so stages are available across pages
  useEffect(() => {
    let cancelled = false

    const loadStages = async () => {
      const programIds = [
        ...new Set(allData.map((m) => m.program_id).filter(Boolean)),
      ]
      if (programIds.length === 0) return

      const stageLookup: Record<string, ProgramStage> = {}
      await Promise.all(
        programIds.map(async (pid) => {
          try {
            const stages = await programService.getStages(pid)
            stages.forEach((s) => { stageLookup[s.id] = s })
          } catch {
            /* ignore per-program stage fetch errors */
          }
        }),
      )

      if (!cancelled) {
        setStageMap(stageLookup)
      }
    }

    void loadStages()
    return () => { cancelled = true }
  }, [allData])

  const handleToggleActive = useCallback(
    async (mission: MissionBank) => {
      setDeactivateTarget(mission)
    },
    [],
  )

  const confirmToggle = useCallback(async () => {
    if (!deactivateTarget) return
    setDeactivating(true)
    try {
      await missionService.toggleActive(deactivateTarget.id)
      addToast({
        type: 'success',
        message: deactivateTarget.is_active ? 'Misi dinonaktifkan' : 'Misi diaktifkan',
      })
      refresh()
    } catch {
      addToast({ type: 'error', message: 'Gagal mengubah status misi' })
    } finally {
      setDeactivating(false)
      setDeactivateTarget(null)
    }
  }, [deactivateTarget, addToast, refresh])

  const handleDelete = useCallback(
    async (mission: MissionBank) => {
      setDeleteTarget(mission)
    },
    [],
  )

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await missionService.delete(deleteTarget.id)
      addToast({ type: 'success', message: 'Misi berhasil dihapus' })
      refresh()
    } catch {
      addToast({ type: 'error', message: 'Gagal menghapus misi' })
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }, [deleteTarget, addToast, refresh])

  const searchQuery = '' // controlled by DataTable via setSearch only

  const changeProgram = useCallback((value: string) => {
    setSelectedProgram(value)
  }, [])

  return {
    missions,
    programs,
    loading,
    error,
    page,
    total: totalItems,
    totalPages,
    selectedProgram,
    searchQuery,
    deactivateTarget,
    deactivating,
    deleteTarget,
    deleting,
    setSearchQuery: setSearch,
    setPage,
    setSelectedProgram: changeProgram,
    setDeactivateTarget,
    setDeleteTarget,
    loadMissions: refresh,
    handleToggleActive,
    confirmToggle,
    handleDelete,
    confirmDelete,
    stageMap,
  }
}
