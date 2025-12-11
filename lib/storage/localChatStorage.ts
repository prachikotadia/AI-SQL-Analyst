/**
 * LocalStorage-based chat storage for client-side persistence
 * Stores chat history, messages, and file attachments in browser localStorage
 */

import type { ChatMessage } from '@/lib/data/chatStore'
import type { QueryResponse } from '@/types'

export interface StoredChat {
  chatId: string
  createdAt: string
  updatedAt: string
  title: string
  attachedFiles: Array<{
    id: string
    fileName: string
    rowCount: number
  }>
  messages: Array<{
    id: string
    timestamp: string
    queryText: string
    response: QueryResponse
    summary: string
  }>
}

const CHATS_STORAGE_KEY = 'ai_sql_analyst_chats'
const CURRENT_CHAT_KEY = 'ai_sql_analyst_current_chat'
const MAX_STORAGE_SIZE = 10 * 1024 * 1024 // 10MB limit for localStorage

/**
 * Get all stored chats from localStorage
 */
export function getStoredChats(): StoredChat[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(CHATS_STORAGE_KEY)
    if (!stored) return []
    
    const chats: StoredChat[] = JSON.parse(stored)
    return chats.filter(c => c && c.chatId)
  } catch (error) {
    return []
  }
}

/**
 * Save a chat to localStorage
 */
export function saveChatToStorage(chat: StoredChat): boolean {
  if (typeof window === 'undefined') return false
  
  try {
    const chats = getStoredChats()
    
    // Check if chat already exists
    const existingIndex = chats.findIndex(c => c.chatId === chat.chatId)
    if (existingIndex >= 0) {
      // Update existing chat
      chats[existingIndex] = chat
    } else {
      // Add new chat
      chats.push(chat)
    }
    
    // Sort by updatedAt (newest first)
    chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    
    // Check storage size
    const dataStr = JSON.stringify(chats)
    if (dataStr.length > MAX_STORAGE_SIZE) {
      // Remove oldest chats until we're under the limit
      while (JSON.stringify(chats).length > MAX_STORAGE_SIZE && chats.length > 1) {
        chats.pop() // Remove oldest (last in sorted array)
      }
    }
    
    localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chats))
    return true
  } catch (error) {
    // If quota exceeded, try to clean up old chats
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      const chats = getStoredChats()
      // Remove oldest 50% of chats
      chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      const keepCount = Math.floor(chats.length / 2)
      const chatsToKeep = chats.slice(0, keepCount) // Keep newest
      try {
        localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chatsToKeep))
        // Try saving again
        return saveChatToStorage(chat)
      } catch (retryError) {
        return false
      }
    }
    return false
  }
}

/**
 * Get a chat by ID from localStorage
 */
export function getChatFromStorage(chatId: string): StoredChat | null {
  const chats = getStoredChats()
  return chats.find(c => c.chatId === chatId) || null
}

/**
 * Remove a chat from localStorage
 */
export function removeChatFromStorage(chatId: string): boolean {
  if (typeof window === 'undefined') return false
  
  try {
    const chats = getStoredChats()
    const filtered = chats.filter(c => c.chatId !== chatId)
    localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(filtered))
    return true
  } catch (error) {
    return false
  }
}

/**
 * Clear all stored chats
 */
export function clearStoredChats(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(CHATS_STORAGE_KEY)
  localStorage.removeItem(CURRENT_CHAT_KEY)
}

/**
 * Get current chat ID from localStorage
 */
export function getCurrentChatId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(CURRENT_CHAT_KEY)
}

/**
 * Set current chat ID in localStorage
 */
export function setCurrentChatId(chatId: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CURRENT_CHAT_KEY, chatId)
}

/**
 * Update chat in storage (merge with existing)
 */
export function updateChatInStorage(chatId: string, updates: Partial<StoredChat>): boolean {
  if (typeof window === 'undefined') return false
  
  try {
    const existing = getChatFromStorage(chatId)
    if (existing) {
      const updated: StoredChat = {
        ...existing,
        ...updates,
        chatId: existing.chatId, // Ensure chatId doesn't change
        updatedAt: new Date().toISOString(),
      }
      return saveChatToStorage(updated)
    } else if (updates.chatId) {
      // Create new chat if it doesn't exist
      const newChat: StoredChat = {
        chatId: updates.chatId || chatId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: updates.title || 'New Chat',
        attachedFiles: updates.attachedFiles || [],
        messages: updates.messages || [],
      }
      return saveChatToStorage(newChat)
    }
    return false
  } catch (error) {
    return false
  }
}

/**
 * Add message to chat in storage
 */
export function addMessageToStoredChat(chatId: string, message: ChatMessage): boolean {
  if (typeof window === 'undefined') return false
  
  try {
    const chat = getChatFromStorage(chatId)
    if (chat) {
      // Check if message already exists (avoid duplicates)
      const messageExists = chat.messages.some(m => m.id === message.id)
      if (messageExists) {
        return true
      }
      
      const updatedMessages = [...chat.messages, {
        id: message.id,
        timestamp: message.timestamp.toISOString(),
        queryText: message.queryText,
        response: message.response,
        summary: message.summary,
      }]
      
      // Sort by timestamp to ensure correct order
      updatedMessages.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      
      const success = updateChatInStorage(chatId, {
        messages: updatedMessages,
        title: chat.messages.length === 0 ? (message.queryText.length > 50 
          ? message.queryText.substring(0, 50) + '...' 
          : message.queryText) : chat.title,
      })
      
      return success
    } else {
      // Create new chat with this message
      const newChat: StoredChat = {
        chatId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: message.queryText.length > 50 
          ? message.queryText.substring(0, 50) + '...' 
          : message.queryText,
        attachedFiles: [],
        messages: [{
          id: message.id,
          timestamp: message.timestamp.toISOString(),
          queryText: message.queryText,
          response: message.response,
          summary: message.summary,
        }],
      }
      return saveChatToStorage(newChat)
    }
  } catch (error) {
    return false
  }
}

/**
 * Update chat files in storage
 */
export function updateChatFilesInStorage(chatId: string, files: Array<{ id: string; fileName: string; rowCount: number }>): boolean {
  if (typeof window === 'undefined') return false
  
  return updateChatInStorage(chatId, {
    attachedFiles: files,
  })
}

