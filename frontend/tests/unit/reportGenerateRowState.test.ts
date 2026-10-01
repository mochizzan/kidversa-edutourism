import { describe, it, expect } from 'vitest'
import { i18n } from '@/core/i18n'
import {
 getGenerateRowState,
 GENERATE_ROW_LABEL,
 GENERATE_PHASE_LABEL,
} from '@/core/constants/reportStatus'
import type { ReportGenerateOperation, ReportGenerateItem } from '@/core/services/types'

/**
 * Row statuses are a pure function of (report id, persistent evidence,
 * active_generate extras, watch/error sets derived from those extras).
 * Nothing local is persisted: a reload refetches the SAME extras and must
 * compute the SAME status — simulated below by rebuilding every input from
 * scratch for the second call.
 */

const activeRun = (items: ReportGenerateItem[]): ReportGenerateOperation => ({
 session_id: 's1',
 started_at: '2026-09-30T00:00:00Z',
 queued_ids: items.filter((i) => i.status === 'queued').map((i) => i.report_id),
 processing_ids: items.filter((i) => i.status === 'processing').map((i) => i.report_id),
 items,
 total: items.length,
 queued: items.filter((i) => i.status === 'queued').length,
 processing: items.filter((i) => i.status === 'processing').length,
 succeeded: items.filter((i) => i.status === 'success').length,
 failed: items.filter((i) => i.status === 'error').length,
})

const evidence = (draft: string, missionIds: string[]) => ({
 ai_narrative_draft: draft,
 mission_ids: missionIds,
})

describe('getGenerateRowState — live run (active_generate items authoritative)', () => {
 it('maps queued/processing/success items, showing the phase when the server reports one', () => {
  const gen = activeRun([
   { report_id: 'r1', status: 'queued' },
   { report_id: 'r2', status: 'processing', phase: 'narrative' },
   { report_id: 'r3', status: 'processing', phase: 'missions' },
   { report_id: 'r4', status: 'success' },
  ])
  expect(getGenerateRowState('r1', null, { activeGenerate: gen })).toEqual({ status: 'queued' })
  expect(getGenerateRowState('r2', null, { activeGenerate: gen })).toEqual({
   status: 'processing',
   phase: 'narrative',
  })
  expect(getGenerateRowState('r3', null, { activeGenerate: gen })).toEqual({
   status: 'processing',
   phase: 'missions',
  })
  expect(getGenerateRowState('r4', null, { activeGenerate: gen })).toEqual({ status: 'success' })
 })

 it('error item carries its phase and failure message', () => {
  const gen = activeRun([
   { report_id: 'r1', status: 'error', phase: 'missions', error: 'mission_selection_failed: kandidat misi kosong' },
  ])
  expect(getGenerateRowState('r1', null, { activeGenerate: gen })).toEqual({
   status: 'error',
   phase: 'missions',
   message: 'mission_selection_failed: kandidat misi kosong',
  })
 })

 it('identical extras without any local state → identical status (reload rebuilds it)', () => {
  const buildFlags = () => ({
   activeGenerate: activeRun([
    { report_id: 'r1', status: 'queued' },
    { report_id: 'r2', status: 'error', phase: 'narrative', error: 'generation boom' },
   ]),
   watchedIds: new Set(['r1', 'r2']),
   recordedErrors: new Map([['r2', { message: 'generation boom', phase: 'narrative' as const }]]),
  })
  const first = getGenerateRowState('r2', null, buildFlags())
  const afterReload = getGenerateRowState('r2', null, buildFlags()) // fresh mount, no local state
  expect(first).toEqual(afterReload)
  expect(first).toEqual({ status: 'error', phase: 'narrative', message: 'generation boom' })
 })

 it('row outside the run and every watch set → null (persisted UI unchanged)', () => {
  const gen = activeRun([{ report_id: 'r1', status: 'queued' }])
  expect(getGenerateRowState('r9', evidence('', []), { activeGenerate: gen })).toBe(null)
  expect(getGenerateRowState('r1', evidence('', []), { activeGenerate: null })).toBe(null)
  expect(getGenerateRowState(null, null, { activeGenerate: gen })).toBe(null)
  expect(getGenerateRowState('', null, {})).toBe(null)
 })

 it('active run without items for a row still resolves the legacy id views', () => {
  const gen = activeRun([])
  gen.queued_ids = ['r1']
  gen.processing_ids = ['r2']
  expect(getGenerateRowState('r1', null, { activeGenerate: gen })).toEqual({ status: 'queued' })
  expect(getGenerateRowState('r2', null, { activeGenerate: gen })).toEqual({ status: 'processing' })
 })
})

describe('getGenerateRowState — registry gone (persisted evidence decides)', () => {
 it('watched row with complete evidence → success (selesai), never a fake gap', () => {
  expect(
   getGenerateRowState('r1', evidence('Naskah narasi', ['m-1']), {
    activeGenerate: null,
    watchedIds: ['r1'],
    recordedErrors: new Map(),
   }),
  ).toEqual({ status: 'success' })
 })

 it('watched row with incomplete evidence → interrupted (terputus), never "selesai"', () => {
  // Draft persisted but the mission phase never confirmed (restart mid-run).
  expect(
   getGenerateRowState('r1', evidence('Naskah narasi', []), {
    activeGenerate: null,
    watchedIds: ['r1'],
    recordedErrors: new Map(),
   }),
  ).toEqual({ status: 'interrupted' })
  // Nothing persisted at all.
  expect(
   getGenerateRowState('r1', evidence('', []), {
    activeGenerate: null,
    watchedIds: ['r1'],
    recordedErrors: new Map(),
   }),
  ).toEqual({ status: 'interrupted' })
 })

 it('recorded per-item failure survives the registry with phase + message', () => {
  expect(
   getGenerateRowState('r1', evidence('', []), {
    activeGenerate: null,
    watchedIds: ['r1'],
    recordedErrors: new Map([['r1', { message: 'kandidat misi kosong', phase: 'missions' }]]),
   }),
  ).toEqual({ status: 'error', phase: 'missions', message: 'kandidat misi kosong' })
 })

 it('recorded failure plus complete evidence resolves to success (the retry persisted)', () => {
  expect(
   getGenerateRowState('r1', evidence('Naskah narasi', ['m-1']), {
    activeGenerate: null,
    watchedIds: ['r1'],
    recordedErrors: new Map([['r1', { message: 'kandidat misi kosong', phase: 'missions' }]]),
   }),
  ).toEqual({ status: 'success' })
 })

 it('never-watched row without a run → null (legacy sessions keep the persisted UI)', () => {
  expect(
   getGenerateRowState('r1', evidence('', []), {
    activeGenerate: null,
    watchedIds: new Set(),
    recordedErrors: new Map(),
   }),
  ).toBe(null)
 })
})

describe('generate row labels — resolvable through i18n', () => {
 it('every status and phase label translates to a distinct non-empty string', () => {
  const statuses = Object.values(GENERATE_ROW_LABEL).map((key) => i18n.t(key))
  const phases = Object.values(GENERATE_PHASE_LABEL).map((key) => i18n.t(key))
  for (const label of [...statuses, ...phases]) {
   expect(typeof label).toBe('string')
   expect(label.length).toBeGreaterThan(0)
   expect(label).not.toMatch(/^(admin|common)\./) // resolved, not a missing key
  }
  expect(new Set(statuses).size).toBe(statuses.length)
  expect(new Set(phases).size).toBe(phases.length)
 })
})
