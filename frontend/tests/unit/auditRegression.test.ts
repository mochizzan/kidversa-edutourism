import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Edge-case audit regression (changes E/F/G/H): the two candidates the audit
// showed had zero test coverage.
//
// G — a session-less `participantService.create` (ParticipantFormPage) must
// NOT put session_id/group_id on the wire. The request builder passes the
// DTO fields through as `undefined`; only JSON.stringify drops those keys.
// If a future "cleanup" serializes them as null / "undefined", the backend
// would read a bogus session_id, run the session gates, and reject the
// standalone create with not_found — a silent breakage of the global form.
//
// H — the camera page's protected bottom bar (gallery count / shutter /
// frame picker, formerly lines 243-272 of CameraViewport.tsx) must keep its
// contract. The H change only trimmed the in-canvas device dropdown (flip/
// grid/mirror moved to the gear panel); a later hunk must not creep into
// the shutter/gallery/frame-picker block.

import { participantService } from '@/core/services/participants'
import { API_ROUTES } from '@/core/constants/apiRoutes'

// Transport-only mock: the real participantService → api-envelope →
// backend-client chain runs, so the assertions below observe the exact
// JSON.stringify output the browser would send.
type FetchCall = [url: string, init?: RequestInit]

let fetchMock: Mock

function sentBody(call: FetchCall): Record<string, unknown> {
  const raw = call[1]?.body
  expect(typeof raw, 'request must carry a JSON body').toBe('string')
  return JSON.parse(raw as string) as Record<string, unknown>
}

describe('participantService.create: session_id only when the caller scopes it', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'p-new', child_name: 'Citra Ayu' } }),
      url,
      init,
    }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('session-less create omits session_id and group_id from the wire entirely', async () => {
    await participantService.create({
      child_name: 'Citra Ayu',
      child_age: 7,
      parent_name: 'Budi',
      parent_phone: '081234567890',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as FetchCall
    expect(url).toBe(API_ROUTES.PARTICIPANTS.BASE)
    expect(init?.method).toBe('POST')

    const sent = sentBody(fetchMock.mock.calls[0] as FetchCall)
    // The key must be ABSENT — not null, not "undefined", not "".
    expect(Object.keys(sent)).not.toContain('session_id')
    expect(Object.keys(sent)).not.toContain('group_id')
    // Sanity: the actual payload did go out.
    expect(sent.child_name).toBe('Citra Ayu')
    expect(sent.consent_photo).toBe(false)
  })

  it('session-scoped create still carries session_id + group_id (contrast)', async () => {
    await participantService.create({
      child_name: 'Citra Ayu',
      child_age: 7,
      parent_name: 'Budi',
      parent_phone: '081234567890',
      session_id: 's-1',
      group_id: 'g-a',
    })

    const sent = sentBody(fetchMock.mock.calls[0] as FetchCall)
    expect(sent.session_id).toBe('s-1')
    expect(sent.group_id).toBe('g-a')
  })
})

describe('CameraViewport protected bottom bar (shutter/gallery/frame picker)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/fasilitator/components/CameraViewport.tsx'),
    'utf8',
  )

  it('bar block keeps its three controls and stays free of camera-toggle creep', () => {
    // The bar is the last block of the component; slice from its container.
    const barStart = src.indexOf('absolute bottom-6 left-1/2')
    expect(barStart, 'bottom bar container not found').toBeGreaterThan(-1)
    const bar = src.slice(barStart)

    // Gallery, shutter, frame picker all still wired and rendered.
    expect(bar).toContain('onOpenGallery')
    expect(bar).toContain('onTakePhoto')
    expect(bar).toContain('onOpenFramePicker')
    expect(bar).toContain('{photoCount}/{maxPhotos}')
    // Shutter disable contract: cap reached, camera inactive, or page-locked.
    expect(bar).toContain(
      "disabled={isMaxPhotos || cameraState !== 'active' || disabled}",
    )

    // Flip/grid/mirror were deliberately MOVED to the gear panel — they must
    // not reappear inside the bar (or anywhere in this trailing block).
    expect(bar).not.toMatch(
      /switchCamera|onSwitchCamera|RefreshCw|FlipHorizontal|camera\.flip|onToggleGrid|onToggleMirror/,
    )
    // The bar must not be merged into the device-picker dropdown.
    expect(bar).not.toContain('cameraPickerOpen')
  })
})
