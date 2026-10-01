import { describe, it, expect, vi } from 'vitest'
import { evaluateGroupCompletion } from '@/features/fasilitator/utils/groupCompletion'

/**
 * The attendance-aware group-completion rule:
 *   canComplete = everyExplicitlyPresentParticipantIsFullyAssessed
 *
 * - explicit absent (row with is_present=false) never blocks
 * - unmarked (no row / belum absen) never blocks — not required to be assessed
 * - a participant marked present must be fully assessed or it blocks
 * - fully assessed = leaf scoring WITHOUT any presence check
 */
describe('evaluateGroupCompletion — attendance-aware completion rule', () => {
 it('does not block on an explicitly absent participant (even unassessed)', () => {
  const state = evaluateGroupCompletion({
   participantIds: ['p1', 'p2', 'p3'],
   attendance: new Map([
    ['p1', true],
    ['p2', false], // explicit absent, never assessed → must not block
    ['p3', true],
   ]),
   isFullyAssessed: (id) => id !== 'p2',
  })

  expect(state.canComplete).toBe(true)
  expect(state.unmarkedCount).toBe(0)
  expect(state.presentCount).toBe(2)
  expect(state.assessedPresentCount).toBe(2)
  expect(state.remainingCount).toBe(0)
 })

 it('blocks while an explicitly present participant is not fully assessed', () => {
  const state = evaluateGroupCompletion({
   participantIds: ['p1', 'p2'],
   attendance: new Map([
    ['p1', true],
    ['p2', true],
   ]),
   isFullyAssessed: (id) => id === 'p1',
  })

  expect(state.canComplete).toBe(false)
  expect(state.assessedPresentCount).toBe(1)
  expect(state.presentCount).toBe(2)
  expect(state.remainingCount).toBe(1)
 })

 it('does not block on unmarked participants (belum absen)', () => {
  const state = evaluateGroupCompletion({
   participantIds: ['p1', 'p2'],
   attendance: new Map([['p1', true]]), // p2 unmarked: belum absen
   isFullyAssessed: () => true,
  })

  expect(state.canComplete).toBe(true)
  expect(state.unmarkedCount).toBe(1)
  expect(state.presentCount).toBe(1)
  expect(state.assessedPresentCount).toBe(1)
  expect(state.remainingCount).toBe(0)
 })

 it('allows completion when NO participant has been marked yet (all belum absen)', () => {
  const isFullyAssessed = vi.fn(() => true)
  const state = evaluateGroupCompletion({
   participantIds: ['p1', 'p2'],
   attendance: new Map(), // nobody marked → nobody must be assessed
   isFullyAssessed,
  })

  expect(state.canComplete).toBe(true)
  expect(state.unmarkedCount).toBe(2)
  expect(state.presentCount).toBe(0)
  expect(state.assessedPresentCount).toBe(0)
  expect(state.remainingCount).toBe(0)
  expect(isFullyAssessed).not.toHaveBeenCalled()
 })

 it('allows completion when all are marked and none is present (everyone absent)', () => {
  const isFullyAssessed = vi.fn(() => true)
  const state = evaluateGroupCompletion({
   participantIds: ['p1', 'p2'],
   attendance: new Map([
    ['p1', false],
    ['p2', false],
   ]),
   isFullyAssessed,
  })

  expect(state.canComplete).toBe(true)
  expect(state.presentCount).toBe(0)
  expect(state.remainingCount).toBe(0)
  // Present side is vacuous: nobody present → nobody needs assessment.
  expect(isFullyAssessed).not.toHaveBeenCalled()
 })
})
