/**
 * Query bookmarks storage
 */

export interface QueryBookmark {
  id: string
  query: string
  category?: string
  description?: string
  createdAt: string
  updatedAt: string
}

const BOOKMARKS_STORAGE_KEY = 'ai_sql_analyst_query_bookmarks'

export function getBookmarks(): QueryBookmark[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(BOOKMARKS_STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch {
    return []
  }
}

export function saveBookmark(bookmark: Omit<QueryBookmark, 'id' | 'createdAt' | 'updatedAt'>): QueryBookmark {
  const bookmarks = getBookmarks()
  const newBookmark: QueryBookmark = {
    ...bookmark,
    id: `bookmark_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  bookmarks.push(newBookmark)
  localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks))
  return newBookmark
}

export function deleteBookmark(id: string): boolean {
  const bookmarks = getBookmarks()
  const filtered = bookmarks.filter(b => b.id !== id)
  if (filtered.length === bookmarks.length) return false
  localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(filtered))
  return true
}

export function updateBookmark(id: string, updates: Partial<Omit<QueryBookmark, 'id' | 'createdAt'>>): QueryBookmark | null {
  const bookmarks = getBookmarks()
  const index = bookmarks.findIndex(b => b.id === id)
  if (index === -1) return null
  
  bookmarks[index] = {
    ...bookmarks[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks))
  return bookmarks[index]
}

export function getBookmarksByCategory(category?: string): QueryBookmark[] {
  const bookmarks = getBookmarks()
  if (!category) return bookmarks
  return bookmarks.filter(b => b.category === category)
}

export function getBookmarkCategories(): string[] {
  const bookmarks = getBookmarks()
  const categories = new Set<string>()
  bookmarks.forEach(b => {
    if (b.category) categories.add(b.category)
  })
  return Array.from(categories).sort()
}
