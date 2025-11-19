'use client'

const SESSION_KEY = 'ai_sql_analyst_session'

export interface Session {
  user: string
  mode: 'demo'
  createdAt: string
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(SESSION_KEY)
    if (!stored) return null
    
    const session: Session = JSON.parse(stored)
    return session
  } catch {
    return null
  }
}

export function setSession(session: Session): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch (error) {
    console.error('Failed to save session:', error)
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch (error) {
    console.error('Failed to clear session:', error)
  }
}

export function loginDemo(): Session {
  const session: Session = {
    user: 'demo_user',
    mode: 'demo',
    createdAt: new Date().toISOString(),
  }
  setSession(session)
  return session
}

export function isAuthenticated(): boolean {
  return getSession() !== null
}

export function logout(): void {
  clearSession()
}

