import type { ChartSpec } from '@/types'

interface CacheEntry {
  sql: string
  reasoning: string
  chartSpec: ChartSpec
  metricName?: string
  timestamp: Date
}

const cache = new Map<string, CacheEntry>()
const MAX_CACHE_SIZE = 100
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const CACHE_REFRESH_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
}

export function getCached(query: string): CacheEntry | null {
  const key = normalizeQuery(query)
  const entry = cache.get(key)

  if (!entry) {
    return null
  }

  // Check TTL
  const age = Date.now() - entry.timestamp.getTime()
  if (age > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }

  return entry
}

export function setCached(query: string, entry: Omit<CacheEntry, 'timestamp'>): void {
  const key = normalizeQuery(query)

  // Evict oldest if cache is full
  if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
    const oldestKey = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())[0][0]
    cache.delete(oldestKey)
  }

  cache.set(key, {
    ...entry,
    timestamp: new Date(),
  })
}

export function clearCache(): void {
  cache.clear()
}

export function getCacheStats(): { size: number; maxSize: number } {
  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
  }
}

/**
 * Check if cache entry is stale and should be refreshed
 * Returns true if entry is older than refresh threshold (1 hour)
 */
export function isCacheStale(query: string): boolean {
  const key = normalizeQuery(query)
  const entry = cache.get(key)

  if (!entry) {
    return false
  }

  const age = Date.now() - entry.timestamp.getTime()
  return age > CACHE_REFRESH_THRESHOLD_MS
}

/**
 * Refresh cache if entry is older than 1 hour
 * Returns true if cache was refreshed (entry was removed)
 */
export function refreshCacheIfStale(query: string): boolean {
  if (isCacheStale(query)) {
    const key = normalizeQuery(query)
    cache.delete(key)
    return true
  }
  return false
}

/**
 * Get cached entry, but return null if stale (forces refresh)
 */
export function getCachedOrRefresh(query: string): CacheEntry | null {
  if (isCacheStale(query)) {
    return null
  }
  return getCached(query)
}

