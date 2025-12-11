/**
 * In-memory session store for chat-based file uploads
 * Stores file data temporarily in memory for query execution
 */

export interface SessionData {
  sessionId: string
  fileName: string
  tableName: string
  columns: Array<{ name: string; type: string }>
  data: Record<string, any>[]
  uploadedAt: Date
}

const sessions = new Map<string, SessionData>()

export function setSessionData(sessionId: string, data: SessionData): void {
  sessions.set(sessionId, data)
}

export function getSessionData(sessionId: string): SessionData | null {
  return sessions.get(sessionId) || null
}

export function hasSession(sessionId: string): boolean {
  return sessions.has(sessionId)
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId)
}

export function clearAllSessions(): void {
  sessions.clear()
}
