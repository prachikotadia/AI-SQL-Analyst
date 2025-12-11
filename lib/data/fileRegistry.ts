/**
 * File registry with persistent disk-based storage
 * 
 * Files are stored in /uploads directory as JSON files. This ensures files persist across
 * server restarts and hot reloads. Each file gets a unique ID and is saved immediately
 * on upload so it's available for all queries in that chat.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

export interface FileMetadata {
  id: string
  fileName: string
  tableName: string
  columns: Array<{ name: string; type: string }>
  data: Record<string, any>[]
  uploadedAt: Date | string // Store as ISO string in JSON, convert to Date when reading
}

// Get uploads directory path
function getUploadsDir(): string {
  const uploadsDir = join(process.cwd(), 'uploads')
  
  // Create directory if it doesn't exist (server-side only)
  if (typeof window === 'undefined' && !existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true })
  }
  
  return uploadsDir
}

// Get file path for a given fileId
function getFilePath(fileId: string): string {
  return join(getUploadsDir(), `${fileId}.json`)
}

/**
 * Register a file and save it to disk
 * Returns the file ID
 */
export function registerFile(metadata: Omit<FileMetadata, 'id'>): string {
  const id = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const fileMetadata: FileMetadata = {
    ...metadata,
    id,
    uploadedAt: new Date(), // Store as Date object, will be serialized to ISO string
  }
  
  // Save to disk
  saveFileToDisk(id, fileMetadata)
  
  return id
}

/**
 * Save file metadata to disk
 */
function saveFileToDisk(fileId: string, fileMetadata: FileMetadata): void {
  if (typeof window !== 'undefined') {
    // Client-side: should never happen, but handle gracefully
    console.error('saveFileToDisk called on client-side - this should not happen')
    return
  }
  
  try {
    const filePath = getFilePath(fileId)
    
    // Convert Date to ISO string for JSON serialization
    const serializableMetadata = {
      ...fileMetadata,
      uploadedAt: fileMetadata.uploadedAt instanceof Date 
        ? fileMetadata.uploadedAt.toISOString() 
        : fileMetadata.uploadedAt,
    }
    
    writeFileSync(filePath, JSON.stringify(serializableMetadata, null, 2), 'utf-8')
    console.log(`[fileRegistry] ✅ Saved file ${fileId} to disk: ${filePath}`)
  } catch (error: any) {
    console.error(`[fileRegistry] ❌ Failed to save file ${fileId} to disk:`, error.message)
    throw new Error(`Failed to save file to disk: ${error.message}`)
  }
}

/**
 * Read file metadata from disk
 */
function readFileFromDisk(fileId: string): FileMetadata | null {
  if (typeof window !== 'undefined') {
    // Client-side: should never happen
    console.error('readFileFromDisk called on client-side - this should not happen')
    return null
  }
  
  try {
    const filePath = getFilePath(fileId)
    
    if (!existsSync(filePath)) {
      console.warn(`[fileRegistry] File not found on disk: ${filePath}`)
      return null
    }
    
    const fileContent = readFileSync(filePath, 'utf-8')
    const fileMetadata = JSON.parse(fileContent) as FileMetadata
    
    // Convert ISO string back to Date object
    if (typeof fileMetadata.uploadedAt === 'string') {
      fileMetadata.uploadedAt = new Date(fileMetadata.uploadedAt)
    }
    
    console.log(`[fileRegistry] ✅ Loaded file ${fileId} from disk`)
    return fileMetadata
  } catch (error: any) {
    console.error(`[fileRegistry] ❌ Failed to read file ${fileId} from disk:`, error.message)
    return null
  }
}

/**
 * Check if file exists on disk
 */
function fileExistsOnDisk(fileId: string): boolean {
  if (typeof window !== 'undefined') {
    return false
  }
  
  const filePath = getFilePath(fileId)
  return existsSync(filePath)
}

/**
 * Get file by ID (reads from disk)
 */
export function getFileById(id: string): FileMetadata | null {
  return readFileFromDisk(id)
}

/**
 * Get multiple files by IDs (reads from disk)
 */
export function getFilesByIds(ids: string[]): FileMetadata[] {
  const files: FileMetadata[] = []
  
  for (const id of ids) {
    const file = readFileFromDisk(id)
    if (file) {
      files.push(file)
    } else {
      console.warn(`[fileRegistry] File ${id} not found on disk`)
    }
  }
  
  return files
}

/**
 * Re-register a file with its existing ID (saves to disk)
 * CRITICAL: Use this when recovering files from chatStore after fileRegistry reset
 */
export function reRegisterFile(file: FileMetadata): void {
  saveFileToDisk(file.id, file)
  console.log(`[fileRegistry] ✅ Re-registered file ${file.id} to disk`)
}

/**
 * Delete file from disk
 */
export function deleteFile(id: string): void {
  if (typeof window !== 'undefined') {
    return
  }
  
  try {
    const filePath = getFilePath(id)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
      console.log(`[fileRegistry] ✅ Deleted file ${id} from disk`)
    }
  } catch (error: any) {
    console.error(`[fileRegistry] ❌ Failed to delete file ${id} from disk:`, error.message)
  }
}

/**
 * Clean up old files (older than 24 hours)
 */
export function cleanupOldFiles(): void {
  if (typeof window !== 'undefined') {
    return
  }
  
  try {
    const uploadsDir = getUploadsDir()
    if (!existsSync(uploadsDir)) {
      return
    }
    
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours
    
    const files = readdirSync(uploadsDir)
    let cleanedCount = 0
    
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue
      }
      
      const filePath = join(uploadsDir, file)
      const stats = statSync(filePath)
      const age = now - stats.mtimeMs
      
      if (age > maxAge) {
        try {
          // Read file to get uploadedAt timestamp
          const fileContent = readFileSync(filePath, 'utf-8')
          const fileMetadata = JSON.parse(fileContent) as FileMetadata
          const uploadedAt = typeof fileMetadata.uploadedAt === 'string' 
            ? new Date(fileMetadata.uploadedAt).getTime()
            : (fileMetadata.uploadedAt as Date).getTime()
          
          const fileAge = now - uploadedAt
          if (fileAge > maxAge) {
            unlinkSync(filePath)
            cleanedCount++
          }
        } catch (error) {
          // If we can't read the file, delete it anyway (corrupted)
          unlinkSync(filePath)
          cleanedCount++
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[fileRegistry] Cleaned up ${cleanedCount} old files`)
    }
  } catch (error: any) {
    console.error('[fileRegistry] Error during cleanup:', error.message)
  }
}

// Initialize uploads directory on module load (server-side only)
if (typeof window === 'undefined') {
  getUploadsDir() // This will create the directory if it doesn't exist
}

// Run cleanup every hour (server-side only)
if (typeof window === 'undefined' && typeof setInterval !== 'undefined') {
  setInterval(cleanupOldFiles, 60 * 60 * 1000)
}
