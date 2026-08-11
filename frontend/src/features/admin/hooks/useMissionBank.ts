import { useState, useEffect, useCallback } from 'react'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { missionService } from '../../../core/services/missions'
import { programService } from '../../../core/services/programs'
import type { MissionBank, Program, ProgramStage } from '../../../core/types'

const PAGE_SIZE = 10

export function useMissionBank() {
  const { addToast } = useGlobalToast()

  const [selectedProgram, setSelectedProgram] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [missions, setMissions] = useState<MissionBank[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [programs, setPrograms] = useState<Program[]>([])
  const [stats, setStats] = useState<Record<string, number>>({ HOME: 0, PARENT: 0, SCHOOL: 0 })

  const [stageMap, setStageMap] = useState<Record<string, ProgramStage>>({})

  const [deactivateTarget, setDeactivateTarget] = useState<MissionBank | null>(null)
  const [deactivating, setDeactivating] = useState(false)

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
          ...(selectedCategory ? { category: selectedCategory } : {}),
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
  }, [page, debouncedSearch, selectedProgram, selectedCategory])

  useEffect(() => {
    loadMissions()
  }, [loadMissions])

  const loadStats = useCallback(async () => {
    const counts: Record<string, number> = { HOME: 0, PARENT: 0, SCHOOL: 0 }
    for (const cat of ['HOME', 'PARENT', 'SCHOOL'] as const) {
      try {
        const res = await missionService.getAll({
          page: 1,
          limit: 1,
          filters: {
            ...(selectedProgram ? { program_id: selectedProgram } : {}),
            category: cat,
          },
        })
        counts[cat] = res.total
      } catch {
        counts[cat] = 0
      }
    }
    setStats(counts)
  }, [selectedProgram])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const handleToggleActive = useCallback(
    async (mission: MissionBank) => {
      if (mission.is_active) {
        try {
          const res = await missionService.getAll({
            page: 1,
            limit: 100,
            filters: { program_id: mission.program_id, category: mission.category },
          })
          const activeCount = res.data.filter((m) => m.is_active && m.id !== mission.id).length
          if (activeCount < 3) {
            addToast({
              type: 'warning',
              message: `Tidak dapat menonaktifkan. Minimal 3 misi aktif diperlukan untuk kategori ${mission.category} di program ini. Saat ini hanya ${activeCount} misi aktif lainnya.`,
            })
            return
          }
        } catch {
          // If we can't check, proceed with toggle
        }
      }
      setDeactivateTarget(mission)
    },
    [addToast],
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
      loadStats()
    } catch {
      addToast({ type: 'error', message: 'Gagal mengubah status misi' })
    } finally {
      setDeactivating(false)
      setDeactivateTarget(null)
    }
  }, [deactivateTarget, addToast, loadMissions, loadStats])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const changeProgram = useCallback((value: string) => {
    setSelectedProgram(value)
    setPage(1)
  }, [])

  const changeCategory = useCallback((value: string) => {
    setSelectedCategory(value)
    setPage(1)
  }, [])

  return {
    missions,
    programs,
    stats,
    loading,
    error,
    page,
    total,
    totalPages,
    selectedProgram,
    selectedCategory,
    searchQuery,
    deactivateTarget,
    deactivating,
    setSearchQuery,
    setPage,
    setSelectedProgram: changeProgram,
    setSelectedCategory: changeCategory,
    setDeactivateTarget,
    loadMissions,
    handleToggleActive,
    confirmToggle,
    stageMap,
  }
}
