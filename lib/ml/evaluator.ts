import type { QueryEvaluation } from '@/types'

const evaluations: QueryEvaluation[] = []
const MAX_MEMORY_EVALUATIONS = 1000

// File-based logging (server-side only)
let LOG_FILE_PATH: string | null = null
let fs: typeof import('fs').promises | null = null
let path: typeof import('path') | null = null

// Initialize file system access (server-side only)
if (typeof window === 'undefined') {
  try {
    fs = require('fs').promises
    const pathModule = require('path')
    path = pathModule
    if (path) {
      LOG_FILE_PATH = path.join(process.cwd(), 'logs', 'evaluations.json')
    }
  } catch (error) {
    // File system not available, use in-memory only
  }
}

// Ensure logs directory exists
async function ensureLogsDirectory(): Promise<void> {
  if (!fs || !path || !LOG_FILE_PATH) return
  
  const logsDir = path.dirname(LOG_FILE_PATH)
  try {
    await fs.mkdir(logsDir, { recursive: true })
  } catch (error) {
    // Directory might already exist, ignore error
  }
}

// Load existing evaluations from file
async function loadEvaluationsFromFile(): Promise<void> {
  if (!fs || !LOG_FILE_PATH) return
  
  try {
    await ensureLogsDirectory()
    const data = await fs.readFile(LOG_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(data)
    if (Array.isArray(parsed)) {
      evaluations.push(...parsed.map(e => ({
        ...e,
        timestamp: new Date(e.timestamp),
      })))
      // Keep only recent evaluations in memory
      if (evaluations.length > MAX_MEMORY_EVALUATIONS) {
        evaluations.splice(0, evaluations.length - MAX_MEMORY_EVALUATIONS)
      }
    }
  } catch (error) {
    // File doesn't exist or is invalid, start fresh
    evaluations.length = 0
  }
}

// Save evaluations to file
async function saveEvaluationsToFile(): Promise<void> {
  if (!fs || !LOG_FILE_PATH) return
  
  try {
    await ensureLogsDirectory()
    // Save last 10000 evaluations to file
    const toSave = evaluations.slice(-10000)
    await fs.writeFile(LOG_FILE_PATH, JSON.stringify(toSave, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save evaluations to file:', error)
  }
}

// Initialize: load from file on module load (server-side only)
if (typeof window === 'undefined') {
  loadEvaluationsFromFile().catch(console.error)
}

export function logEvaluation(evaluation: Omit<QueryEvaluation, 'timestamp'>): void {
  const evalWithTimestamp: QueryEvaluation = {
    ...evaluation,
    timestamp: new Date(),
  }

  evaluations.push(evalWithTimestamp)

  // Keep only last MAX_MEMORY_EVALUATIONS in memory
  if (evaluations.length > MAX_MEMORY_EVALUATIONS) {
    evaluations.shift()
  }

  // Save to file asynchronously (don't block)
  if (typeof window === 'undefined') {
    saveEvaluationsToFile().catch(console.error)
  }
}

export function getEvaluations(limit: number = 100): QueryEvaluation[] {
  return evaluations.slice(-limit)
}

export function getEvaluationStats(): {
  total: number
  success: number
  failure: number
  avgLatency: number
} {
  if (evaluations.length === 0) {
    return { total: 0, success: 0, failure: 0, avgLatency: 0 }
  }

  const success = evaluations.filter(e => e.success).length
  const failure = evaluations.length - success
  const avgLatency = evaluations.reduce((sum, e) => sum + e.latencyMs, 0) / evaluations.length

  return {
    total: evaluations.length,
    success,
    failure,
    avgLatency: Math.round(avgLatency),
  }
}

// Re-export for backward compatibility
export { logEvaluation as default }

