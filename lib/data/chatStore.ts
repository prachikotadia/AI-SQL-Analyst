/**
 * Chat store for managing per-chat file attachments and message history
 * 
 * This is an in-memory store that tracks which files are attached to each chat and
 * stores message history. Files persist via fileRegistry (disk), but this store
 * tracks the relationship between chats and files for quick lookup.
 */

import type { FileMetadata } from './fileRegistry'
import type { QueryResponse } from '@/types'

export interface ChatMessage {
  id: string
  timestamp: Date
  queryText: string
  response: QueryResponse
  summary: string
}

export interface Chat {
  chatId: string
  createdAt: Date
  updatedAt: Date
  title: string
  attachedFiles: FileMetadata[]
  messages: ChatMessage[]
}

const chats = new Map<string, Chat>()

/**
 * Create a new chat
 * @param chatId Optional: if provided and doesn't exist, creates chat with that ID
 */
export function createChat(chatId?: string): string {
  const finalChatId = chatId && !chats.has(chatId) 
    ? chatId 
    : `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const chat: Chat = {
    chatId: finalChatId,
    createdAt: new Date(),
    updatedAt: new Date(),
    title: 'New Chat',
    attachedFiles: [],
    messages: [],
  }
  chats.set(finalChatId, chat)
  return finalChatId
}

/**
 * Get chat by ID
 */
export function getChat(chatId: string): Chat | null {
  return chats.get(chatId) || null
}

/**
 * Get all chats (sorted by updatedAt, newest first)
 */
export function getAllChats(): Chat[] {
  return Array.from(chats.values()).sort((a, b) => 
    b.updatedAt.getTime() - a.updatedAt.getTime()
  )
}

/**
 * Update chat title
 */
export function updateChatTitle(chatId: string, title: string): void {
  const chat = chats.get(chatId)
  if (chat) {
    chat.title = title
    chat.updatedAt = new Date()
  }
}

/**
 * Add file to chat
 */
export function addFileToChat(chatId: string, file: FileMetadata): void {
  const chat = chats.get(chatId)
  if (chat) {
    // Check if file already exists
    const exists = chat.attachedFiles.some(f => f.id === file.id)
    if (!exists) {
      chat.attachedFiles.push(file)
      chat.updatedAt = new Date()
    }
  }
}

/**
 * Remove file from chat
 */
export function removeFileFromChat(chatId: string, fileId: string): void {
  const chat = chats.get(chatId)
  if (chat) {
    chat.attachedFiles = chat.attachedFiles.filter(f => f.id !== fileId)
    chat.updatedAt = new Date()
  }
}

/**
 * Get attached files for chat
 */
export function getChatFiles(chatId: string): FileMetadata[] {
  const chat = chats.get(chatId)
  return chat?.attachedFiles || []
}

/**
 * Add message to chat
 * CRITICAL: Updates chat title from first query for meaningful sidebar titles
 */
export function addMessageToChat(
  chatId: string,
  queryText: string,
  response: QueryResponse
): void {
  const chat = chats.get(chatId)
  if (chat) {
    // Update title if this is the first message (meaningful title from first query)
    if (chat.messages.length === 0) {
      // Generate meaningful title: first 40-60 chars of query, or summary
      let title = queryText.trim()
      
      // Clean up the title: remove extra whitespace, capitalize first letter
      title = title.replace(/\s+/g, ' ').trim()
      if (title.length > 60) {
        // Try to cut at a word boundary
        const cutPoint = title.substring(0, 57).lastIndexOf(' ')
        title = cutPoint > 30 
          ? title.substring(0, cutPoint) + '...'
          : title.substring(0, 57) + '...'
      }
      
      // Capitalize first letter
      if (title.length > 0) {
        title = title.charAt(0).toUpperCase() + title.slice(1)
      }
      
      chat.title = title || 'New Chat'
      chat.updatedAt = new Date()
    }

    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      queryText,
      response,
      summary: queryText.length > 50 ? queryText.substring(0, 50) + '...' : queryText,
    }
    
    chat.messages.push(message)
    chat.updatedAt = new Date()
  }
}

/**
 * Get messages for chat
 */
export function getChatMessages(chatId: string): ChatMessage[] {
  const chat = chats.get(chatId)
  return chat?.messages || []
}

/**
 * Delete chat
 */
export function deleteChat(chatId: string): void {
  chats.delete(chatId)
}

/**
 * Clean up old chats (older than 7 days)
 */
export function cleanupOldChats(): void {
  const now = Date.now()
  const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days

  for (const [chatId, chat] of chats.entries()) {
    const age = now - chat.updatedAt.getTime()
    if (age > maxAge) {
      chats.delete(chatId)
    }
  }
}

// Run cleanup every hour (only in Node.js environment)
if (typeof window === 'undefined' && typeof setInterval !== 'undefined') {
  setInterval(cleanupOldChats, 60 * 60 * 1000)
}

