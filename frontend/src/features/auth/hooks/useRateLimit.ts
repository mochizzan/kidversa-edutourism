import { useState, useEffect } from 'react'
import { STORAGE_KEYS } from '../../../core/constants/storage'

const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION = 5 * 60 * 1000

function getLoginAttempts(): number {
  const v = sessionStorage.getItem(STORAGE_KEYS.LOGIN_ATTEMPTS)
  return v ? parseInt(v, 10) : 0
}

function setLoginAttempts(c: number) {
  sessionStorage.setItem(STORAGE_KEYS.LOGIN_ATTEMPTS, String(c))
}

function getLockoutUntil(): number {
  const v = sessionStorage.getItem(STORAGE_KEYS.LOCKOUT_UNTIL)
  return v ? parseInt(v, 10) : 0
}

function setLockoutUntil(ts: number) {
  sessionStorage.setItem(STORAGE_KEYS.LOCKOUT_UNTIL, String(ts))
}

function clearRateLimit() {
  sessionStorage.removeItem(STORAGE_KEYS.LOGIN_ATTEMPTS)
  sessionStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL)
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
