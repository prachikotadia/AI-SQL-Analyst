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

// In-memory fallback for serverless environments (Netlify, Vercel)
const inMemoryStore = new Map<string, FileMetadata>()

// Get uploads directory path - use /tmp in serverless, uploads/ in regular server
function getUploadsDir(): string {
  // Check if we're in a serverless environment (Netlify, Vercel)
  // These environments only allow writes to /tmp
  const isServerless = process.env.NETLIFY === 'true' || process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME
  
  if (isServerless) {
    // Use /tmp in serverless environments
    return '/tmp'
  }
  
  // Regular server: use uploads directory
  const uploadsDir = join(process.cwd(), 'uploads')
  
  // Create directory if it doesn't exist (server-side only)
  if (typeof window === 'undefined' && !existsSync(uploadsDir)) {
    try {
      mkdirSync(uploadsDir, { recursive: true })
    } catch (error) {
      // If we can't create uploads dir, fall back to /tmp
      return '/tmp'
    }
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
  const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  
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
 * Save file metadata to disk (or in-memory fallback for serverless)
 */
function saveFileToDisk(fileId: string, fileMetadata: FileMetadata): void {
  if (typeof window !== 'undefined') {
    return
  }
  
  // Convert Date to ISO string for JSON serialization
  const serializableMetadata = {
    ...fileMetadata,
    uploadedAt: fileMetadata.uploadedAt instanceof Date 
      ? fileMetadata.uploadedAt.toISOString() 
      : fileMetadata.uploadedAt,
  }
  
  // Always store in-memory as fallback
  inMemoryStore.set(fileId, fileMetadata)
  
  try {
    const filePath = getFilePath(fileId)
    writeFileSync(filePath, JSON.stringify(serializableMetadata, null, 2), 'utf-8')
  } catch (error: unknown) {
    // If disk write fails (serverless), in-memory store will handle it
    // Don't throw - in-memory fallback is sufficient
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    if (process.env.NODE_ENV === 'development') {
      // Only log in development
    }
  }
}

/**
 * Read file metadata from disk (or in-memory fallback)
 */
function readFileFromDisk(fileId: string): FileMetadata | null {
  if (typeof window !== 'undefined') {
    return null
  }
  
  // Check in-memory store first (fastest)
  if (inMemoryStore.has(fileId)) {
    return inMemoryStore.get(fileId)!
  }
  
  // Try to read from disk
  try {
    const filePath = getFilePath(fileId)
    
    if (!existsSync(filePath)) {
      return null
    }
    
    const fileContent = readFileSync(filePath, 'utf-8')
    const fileMetadata = JSON.parse(fileContent) as FileMetadata
    
    // Convert ISO string back to Date object
    if (typeof fileMetadata.uploadedAt === 'string') {
      fileMetadata.uploadedAt = new Date(fileMetadata.uploadedAt)
    }
    
    // Store in memory for next time
    inMemoryStore.set(fileId, fileMetadata)
    return fileMetadata
  } catch (error: unknown) {
    // If disk read fails, return null (file might be in-memory only)
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
}

/**
 * Delete file from disk
 */
export function deleteFile(id: string): void {
  if (typeof window !== 'undefined') {
    return
  }
  
  // Remove from in-memory store
  inMemoryStore.delete(id)
  
  try {
    const filePath = getFilePath(id)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  } catch (error: unknown) {
    // Ignore deletion errors - file might not exist on disk
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
    
  } catch (error: unknown) {
    // Ignore cleanup errors
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
