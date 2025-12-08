/**
 * LocalStorage-based file storage for client-side persistence
 * Stores file metadata and data in browser localStorage
 */

export interface StoredFile {
  id: string
  fileName: string
  tableName: string
  columns: Array<{ name: string; type: string }>
  data: Record<string, any>[]
  uploadedAt: string
  rowCount: number
}

const STORAGE_KEY = 'ai_sql_analyst_files'
const MAX_STORAGE_SIZE = 5 * 1024 * 1024 // 5MB limit for localStorage

/**
 * Get all stored files from localStorage
 */
export function getStoredFiles(): StoredFile[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    
    const files: StoredFile[] = JSON.parse(stored)
    return files.filter(f => f && f.id && f.fileName)
  } catch (error) {
    console.error('Error reading stored files:', error)
    return []
  }
}

/**
 * Save a file to localStorage
 */
export function saveFileToStorage(file: StoredFile): boolean {
  if (typeof window === 'undefined') return false
  
  try {
    const files = getStoredFiles()
    
    // Check if file already exists
    const existingIndex = files.findIndex(f => f.id === file.id)
    if (existingIndex >= 0) {
      // Update existing file
      files[existingIndex] = file
    } else {
      // Add new file
      files.push(file)
    }
    
    // Check storage size
    const dataStr = JSON.stringify(files)
    if (dataStr.length > MAX_STORAGE_SIZE) {
      // Remove oldest files until we're under the limit
      files.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime())
      while (JSON.stringify(files).length > MAX_STORAGE_SIZE && files.length > 1) {
        files.shift()
      }
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files))
    return true
  } catch (error) {
    console.error('Error saving file to storage:', error)
    // If quota exceeded, try to clean up old files
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      const files = getStoredFiles()
      // Remove oldest 50% of files
      files.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime())
      const keepCount = Math.floor(files.length / 2)
      const filesToKeep = files.slice(-keepCount)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filesToKeep))
        // Try saving again
        return saveFileToStorage(file)
      } catch (retryError) {
        console.error('Failed to save after cleanup:', retryError)
        return false
      }
    }
    return false
  }
}

/**
 * Get a file by ID from localStorage
 */
export function getFileFromStorage(fileId: string): StoredFile | null {
  const files = getStoredFiles()
  return files.find(f => f.id === fileId) || null
}

/**
 * Remove a file from localStorage
 */
export function removeFileFromStorage(fileId: string): boolean {
  if (typeof window === 'undefined') return false
  
  try {
    const files = getStoredFiles()
    const filtered = files.filter(f => f.id !== fileId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    return true
  } catch (error) {
    console.error('Error removing file from storage:', error)
    return false
  }
}

/**
 * Clear all stored files
 */
export function clearStoredFiles(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Get file history (all stored files, sorted by upload date)
 */
export function getFileHistory(): StoredFile[] {
  const files = getStoredFiles()
  return files.sort((a, b) => 
    new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  )
}

