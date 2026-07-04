import { useState, useEffect } from 'react'

const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION = 5 * 60 * 1000
const ATTEMPTS_KEY = 'kidversa_login_attempts'
const LOCKOUT_KEY = 'kidversa_lockout_until'

function getLoginAttempts(): number {
  const v = sessionStorage.getItem(ATTEMPTS_KEY)
  return v ? parseInt(v, 10) : 0
}

function setLoginAttempts(c: number) {
  sessionStorage.setItem(ATTEMPTS_KEY, String(c))
}

function getLockoutUntil(): number {
  const v = sessionStorage.getItem(LOCKOUT_KEY)
  return v ? parseInt(v, 10) : 0
}

function setLockoutUntil(ts: number) {
  sessionStorage.setItem(LOCKOUT_KEY, String(ts))
}

function clearRateLimit() {
  sessionStorage.removeItem(ATTEMPTS_KEY)
  sessionStorage.removeItem(LOCKOUT_KEY)
}

interface UseRateLimitResult {
  isLocked: boolean
  lockoutTimeLeft: number
  recordFailedAttempt: () => boolean
  clearRateLimit: () => void
  getRemainingAttempts: () => number
}

export function useRateLimit(): UseRateLimitResult {
  const [isLocked, setIsLocked] = useState(false)
  const [lockoutTimeLeft, setLockoutTimeLeft] = useState(0)

  useEffect(() => {
    const check = () => {
      const until = getLockoutUntil()
      if (until > Date.now()) {
        setIsLocked(true)
        setLockoutTimeLeft(Math.ceil((until - Date.now()) / 1000))
      } else {
        setIsLocked(false)
        setLockoutTimeLeft(0)
      }
    }
    check()
    const iv = setInterval(check, 1000)
    return () => clearInterval(iv)
  }, [])

  const recordFailedAttempt = (): boolean => {
    const attempts = getLoginAttempts() + 1
    setLoginAttempts(attempts)
    if (attempts >= MAX_ATTEMPTS) {
      const end = Date.now() + LOCKOUT_DURATION
      setLockoutUntil(end)
      setIsLocked(true)
      return true
    }
    return false
  }

  const getRemainingAttempts = (): number => {
    return MAX_ATTEMPTS - getLoginAttempts()
  }

  return { isLocked, lockoutTimeLeft, recordFailedAttempt, clearRateLimit, getRemainingAttempts }
}
