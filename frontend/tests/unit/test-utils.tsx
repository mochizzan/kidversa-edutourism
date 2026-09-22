// Custom test utilities that work around the React 19.2.x + @testing-library/react v16.3.x
// incompatibility. React 19.2's act() returns a thenable, but RTL v16.3's
// withGlobalActEnvironment wrapper doesn't flush it synchronously — causing
// empty renders. We use React.act from 'react' directly (which DOES flush
// synchronously) instead of RTL's wrapped version.
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { screen } from '@testing-library/react'
import { afterEach } from 'vitest'

export interface RenderResult {
  container: HTMLElement
  unmount: () => void
  rerender: (ui: ReactElement) => void
}

export interface HookResult<T> {
  result: { current: T }
  rerender: () => void
  unmount: () => void
}

const mountedRoots: Array<{ container: HTMLElement; root: Root; containerElem: HTMLElement }> = []

function cleanup() {
  mountedRoots.forEach(({ root, containerElem }) => {
    try {
      act(() => {
        root.unmount()
      })
    } catch {
      // Ignore unmount errors during cleanup
    }
    if (containerElem.parentNode === document.body) {
      document.body.removeChild(containerElem)
    }
  })
  mountedRoots.length = 0
}

// Auto-cleanup after each test (mirrors @testing-library/react behavior)
afterEach(() => {
  cleanup()
})

export function render(ui: ReactElement): RenderResult {
  const containerElem = document.createElement('div')
  document.body.appendChild(containerElem)
  const root = createRoot(containerElem)
  mountedRoots.push({ container: containerElem, root, containerElem })

  // React.act from 'react' flushes synchronously even in React 19.2.x
  act(() => {
    root.render(ui)
  })

  return {
    container: containerElem,
    unmount: () => {
      const index = mountedRoots.findIndex((r) => r.containerElem === containerElem)
      if (index !== -1) {
        act(() => {
          mountedRoots[index].root.unmount()
        })
        if (containerElem.parentNode === document.body) {
          document.body.removeChild(containerElem)
        }
        mountedRoots.splice(index, 1)
      }
    },
    rerender: (newUi: ReactElement) => {
      act(() => {
        root.render(newUi)
      })
    },
  }
}

export function renderHook<T>(hook: () => T): HookResult<T> {
  const result: { current: T } = { current: null as unknown as T }

  function TestComponent() {
    result.current = hook()
    return null
  }

  const { unmount, rerender: baseRerender } = render(<TestComponent />)

  return {
    result,
    rerender: () => {
      baseRerender(<TestComponent />)
    },
    unmount,
  }
}

// Re-export act from 'react' for wrapping state updates in tests
export { act }

// screen queries work because our container is appended to document.body
export { screen }
