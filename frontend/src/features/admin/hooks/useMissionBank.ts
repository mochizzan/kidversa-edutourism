import { useState, useEffect, useCallback } from 'react'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { missionService } from '../../../core/services/missions'
import { programService } from '../../../core/services/programs'
import type { MissionBank, Program, ProgramStage } from '../../../core/types'

const PAGE_SIZE = 10

export function useMissionBank() {
  const { addToast } = useGlobalToast()

  const [selectedProgram, setSelectedProgram] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [missions, setMissions] = useState<MissionBank[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [programs, setPrograms] = useState<Program[]>([])

  const [stageMap, setStageMap] = useState<Record<string, ProgramStage>>({})

  const [deactivateTarget, setDeactivateTarget] = useState<MissionBank | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<MissionBank | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    programService.getAll({ limit: 100 }).then((res) => setPrograms(res.data))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const loadMissions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await missionService.getAll({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        filters: {
          ...(selectedProgram ? { program_id: selectedProgram } : {}),
        },
      })
      setMissions(res.data)
      setTotal(res.total)

      // Build stage lookup from unique program_ids in displayed missions
      const programIds = [
        ...new Set(res.data.map((m) => m.program_id).filter(Boolean)),
      ]
      if (programIds.length > 0) {
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
        setStageMap(stageLookup)
      }
    } catch {
      setError('Gagal memuat data misi')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, selectedProgram])

  useEffect(() => {
    loadMissions()
  }, [loadMissions])

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
      loadMissions()
    } catch {
      addToast({ type: 'error', message: 'Gagal mengubah status misi' })
    } finally {
      setDeactivating(false)
      setDeactivateTarget(null)
    }
  }, [deactivateTarget, addToast, loadMissions])

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
      loadMissions()
    } catch {
      addToast({ type: 'error', message: 'Gagal menghapus misi' })
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }, [deleteTarget, addToast, loadMissions])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const changeProgram = useCallback((value: string) => {
    setSelectedProgram(value)
    setPage(1)
  }, [])

  return {
    missions,
    programs,
    loading,
    error,
    page,
    total,
    totalPages,
    selectedProgram,
    searchQuery,
    deactivateTarget,
    deactivating,
    deleteTarget,
    deleting,
    setSearchQuery,
    setPage,
    setSelectedProgram: changeProgram,
    setDeactivateTarget,
    setDeleteTarget,
    loadMissions,
    handleToggleActive,
    confirmToggle,
    handleDelete,
    confirmDelete,
    stageMap,
  }
}
