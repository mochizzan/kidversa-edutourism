import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { render } from './test-utils'

// ── Mocks (registered before importing the layout) ────────────────────────
vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

// Import after mocks are registered
import FasilitatorLayout from '@/shared/layouts/FasilitatorLayout'
import { useAuth } from '@/core/hooks/useAuth'

function renderNav(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/fasilitator/*" element={<FasilitatorLayout />} />
      </Routes>
    </MemoryRouter>,
  )
}

function navHrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('nav a')).map(
    (a) => a.getAttribute('href') ?? '',
  )
}

function linkByHref(container: HTMLElement, href: string): HTMLAnchorElement {
  const link = container.querySelector<HTMLAnchorElement>(`nav a[href="${href}"]`)
  if (!link) throw new Error(`No nav link found for ${href}`)
  return link
}

describe('FasilitatorLayout: bottom navbar entries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1', name: 'Budi Santoso', role: 'FASILITATOR' },
    } as never)
  })

  it('renders exactly three entries — Dashboard, Galeri, Profile — with no duplicate targets', () => {
    const { container } = renderNav('/fasilitator/dashboard')

    const hrefs = navHrefs(container)
    expect(hrefs).toHaveLength(3)
    // Uniqueness: every href first appears at its own index
    expect(hrefs.every((href, index) => hrefs.indexOf(href) === index)).toBe(true)
    expect(hrefs).toEqual([
      '/fasilitator/dashboard',
      '/fasilitator/galeri',
      '/fasilitator/profile',
    ])
    // No camera/groups entries in the bottom navbar
    expect(container.querySelector('nav a[href="/fasilitator/camera"]')).toBeNull()
    expect(container.querySelector('nav a[href="/fasilitator/groups"]')).toBeNull()
  })

  it('marks Galeri active on a galeri subroute', () => {
    const { container } = renderNav('/fasilitator/galeri/sesi/x')

    expect(linkByHref(container, '/fasilitator/galeri')).toHaveClass('text-primary')
    expect(linkByHref(container, '/fasilitator/dashboard')).not.toHaveClass('text-primary')
    expect(linkByHref(container, '/fasilitator/profile')).not.toHaveClass('text-primary')
  })
})
