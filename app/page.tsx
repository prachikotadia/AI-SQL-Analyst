'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { QueryInput } from '@/components/QueryInput'
import { ResultsPanel } from '@/components/ResultsPanel'
import { ChatHistory } from '@/components/ChatHistory'
import { HistorySidebar } from '@/components/HistorySidebar'
import { LayoutShell } from '@/components/LayoutShell'
import { OutOfScopeModal } from '@/components/OutOfScopeModal'
import { CommandPalette } from '@/components/CommandPalette'
import { ApiKeyErrorModal } from '@/components/ApiKeyErrorModal'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { loginDemo, isAuthenticated, logout as logoutSession } from '@/lib/auth/session'
import type { QueryResponse, QueryHistoryItem, ChatInfo } from '@/types'
import type { ChatMessage } from '@/lib/data/chatStore'
import { 
  getStoredChats, 
  getChatFromStorage, 
  saveChatToStorage, 
  getCurrentChatId, 
  setCurrentChatId as setCurrentChatIdInStorage,
  updateChatInStorage,
  addMessageToStoredChat,
  updateChatFilesInStorage,
  removeChatFromStorage,
  type StoredChat
} from '@/lib/storage/localChatStorage'
import { getBookmarks } from '@/lib/storage/queryBookmarks'
import { getRecentQueries } from '@/lib/utils/querySuggestions'

export default function Home() {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<QueryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [history, setHistory] = useState<QueryHistoryItem[]>([])
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [authenticated, setAuthenticated] = useState(false)
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [chatFiles, setChatFiles] = useState<Array<{ id: string; fileName: string; rowCount: number }>>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chats, setChats] = useState<ChatInfo[]>([])
  const [outOfScopeModal, setOutOfScopeModal] = useState<{ open: boolean; message: string }>({ open: false, message: '' })
  const [apiKeyErrorModalOpen, setApiKeyErrorModalOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)
  const timeoutRefs = useRef<Set<NodeJS.Timeout>>(new Set())
  const { toast } = useToast()

  const createNewChat = useCallback(async () => {
    try {
      const res = await fetch('/api/chats', { method: 'POST' })
      if (!res.ok) {
        // Fallback to in-memory chat creation
        const fallbackChatId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
        setCurrentChatId(fallbackChatId)
        localStorage.setItem('currentChatId', fallbackChatId)
        setChatFiles([])
        setChatMessages([])
        setQuery('')
        setResponse(null)
        return
      }
      const data = await res.json()
      const newChatId = data.chatId
      if (newChatId) {
        setCurrentChatId(newChatId)
        setCurrentChatIdInStorage(newChatId)
        setChatFiles([])
        setChatMessages([])
        setQuery('')
        setResponse(null)
        
        const newChat: StoredChat = {
          chatId: newChatId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          title: 'New Chat',
          attachedFiles: [],
          messages: [],
        }
        saveChatToStorage(newChat)
      }
    } catch (error) {
      const fallbackChatId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      setCurrentChatId(fallbackChatId)
      localStorage.setItem('currentChatId', fallbackChatId)
      setChatFiles([])
      setChatMessages([])
      setQuery('')
      setResponse(null)
    }
  }, [])

  const loadChat = useCallback(async (chatId: string) => {
    if (!chatId) {
      await createNewChat()
      return
    }
    
    // CRITICAL: Always load from localStorage FIRST (localStorage is source of truth)
    const storedChat = getChatFromStorage(chatId)
    if (storedChat) {
      setCurrentChatId(storedChat.chatId)
      setCurrentChatIdInStorage(storedChat.chatId)
      setChatFiles(storedChat.attachedFiles || [])
      
      // Restore messages from localStorage
      const messages: ChatMessage[] = (storedChat.messages || []).map(msg => ({
        id: msg.id,
        timestamp: new Date(msg.timestamp),
        queryText: msg.queryText,
        response: msg.response,
        summary: msg.summary,
      }))
      // Sort by timestamp to ensure correct order
      messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      setChatMessages(messages)
      
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1]
        setResponse(lastMessage.response)
      } else {
        setResponse(null)
      }
    }
    
    // Try to sync with server (but localStorage takes precedence)
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.chat) {
          const loadedChatId = data.chat.chatId
          setCurrentChatId(loadedChatId)
          setCurrentChatIdInStorage(loadedChatId)
          
          let files = data.chat.attachedFiles || []
          
          if (files.length === 0 && storedChat) {
            files = storedChat.attachedFiles || []
          }
          
          setChatFiles(files)
          
          // CRITICAL: localStorage is the source of truth - don't overwrite with server data
          // Server data is only used if localStorage is empty
          const localStorageMessages = storedChat?.messages || []
          
          if (localStorageMessages.length > 0) {
            // localStorage has messages - use them (they're more up-to-date)
            // Messages are already set from localStorage above, don't overwrite
          } else {
            // localStorage is empty - use server data as fallback
            const serverMessages: ChatMessage[] = (data.chat.messages || []).map((msg: any) => ({
              id: msg.id,
              timestamp: new Date(msg.timestamp),
              queryText: msg.queryText,
              response: msg.response,
              summary: msg.summary,
            }))
            
            if (serverMessages.length > 0) {
              // Sort by timestamp
              serverMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
              setChatMessages(serverMessages)
              
              // Save server data to localStorage for future use
              const chatToStore: StoredChat = {
                chatId: loadedChatId,
                createdAt: data.chat.createdAt ? new Date(data.chat.createdAt).toISOString() : new Date().toISOString(),
                updatedAt: data.chat.updatedAt ? new Date(data.chat.updatedAt).toISOString() : new Date().toISOString(),
                title: data.chat.title || storedChat?.title || 'New Chat',
                attachedFiles: files,
                messages: serverMessages.map(msg => ({
                  id: msg.id,
                  timestamp: msg.timestamp.toISOString(),
                  queryText: msg.queryText,
                  response: msg.response,
                  summary: msg.summary,
                })),
              }
              saveChatToStorage(chatToStore)
            }
          }
          
          // Response is already set from localStorage messages above
          // Only update if we loaded from server (localStorage was empty)
          if (localStorageMessages.length === 0) {
            const serverMessages: ChatMessage[] = (data.chat.messages || []).map((msg: any) => ({
              id: msg.id,
              timestamp: new Date(msg.timestamp),
              queryText: msg.queryText,
              response: msg.response,
              summary: msg.summary,
            }))
            if (serverMessages.length > 0) {
              const lastMessage = serverMessages[serverMessages.length - 1]
              setResponse(lastMessage.response)
            }
          }
        }
      }
    } catch (error) {
      // If server sync fails, we already have localStorage data loaded above
      if (!storedChat) {
        await createNewChat()
      }
    }
  }, [createNewChat])

  const loadAllChats = useCallback(async () => {
    const toDate = (date: any): Date => {
      if (date instanceof Date) return date
      if (typeof date === 'string') return new Date(date)
      if (typeof date === 'number') return new Date(date)
      return new Date()
    }
    
    const createChatInfo = (chat: any): ChatInfo => ({
      chatId: chat.chatId,
      title: chat.title || 'New Chat',
      updatedAt: toDate(chat.updatedAt),
      messageCount: chat.messageCount || chat.messages?.length || 0,
      ...(chat.fileCount !== undefined && { fileCount: chat.fileCount }),
    })
    
    const storedChats = getStoredChats()
    const chatsFromStorage: ChatInfo[] = storedChats.map(createChatInfo)
    const validatedChatsFromStorage = chatsFromStorage.map(chat => ({
      ...chat,
      updatedAt: toDate(chat.updatedAt),
    }))
    setChats(validatedChatsFromStorage)
    
    try {
      const res = await fetch('/api/chats')
      if (res.ok) {
        const data = await res.json()
        const serverChats = data.chats || []
        
        // Handle case where API returns error but status is 200
        if (data.error && serverChats.length === 0) {
          // API returned error but status 200 - ignore and use localStorage
        }
        
        const mergedChats = new Map<string, ChatInfo>()
        
        chatsFromStorage.forEach(chat => {
          mergedChats.set(chat.chatId, {
            ...chat,
            updatedAt: toDate(chat.updatedAt),
          })
        })
        
        serverChats.forEach((chat: any) => {
          mergedChats.set(chat.chatId, createChatInfo(chat))
        })
        
        const allChats = Array.from(mergedChats.values()).map(chat => ({
          ...chat,
          updatedAt: toDate(chat.updatedAt),
        }))
        
        const sortedChats = allChats.sort((a, b) => {
          const aDate = toDate(a.updatedAt)
          const bDate = toDate(b.updatedAt)
          return bDate.getTime() - aDate.getTime()
        })
        
        setChats(sortedChats)
      }
    } catch (error) {
      // Failed to load chats from server, using localStorage only
    }
  }, [])

  // Initialize app on mount - runs once only
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (initializedRef.current) return
    initializedRef.current = true
    
    setAuthenticated(isAuthenticated())
    
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    }

    // Load chat from localStorage FIRST (localStorage is source of truth)
    const savedChatId = getCurrentChatId() || localStorage.getItem('currentChatId')
    if (savedChatId) {
      loadChat(savedChatId).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Home] Failed to load chat:', message)
        }
        // Fallback: create new chat if load fails
        createNewChat().catch((createError: unknown) => {
          const createMessage = createError instanceof Error ? createError.message : 'Unknown error'
          if (process.env.NODE_ENV === 'development') {
            console.warn('[Home] Failed to create new chat:', createMessage)
          }
        })
      })
    } else {
      createNewChat().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Home] Failed to create new chat:', message)
        }
      })
    }

    loadAllChats().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Home] Failed to load all chats:', message)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard shortcuts - separate effect that depends on response
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K for command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
      // Ctrl/Cmd + E for export (if there's a response)
      if ((e.ctrlKey || e.metaKey) && e.key === 'e' && response && response.data && response.data.length > 0) {
        e.preventDefault()
        const exportButton = document.querySelector('[data-export-trigger]') as HTMLElement
        if (exportButton) {
          exportButton.click()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [response])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    return () => {
      if (debouncedQueryRef.current) {
        clearTimeout(debouncedQueryRef.current)
      }
      // Clean up all timeouts on unmount
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout))
      timeoutRefs.current.clear()
    }
  }, [])


  const handleLogin = () => {
    loginDemo()
    setAuthenticated(true)
    toast({
      title: 'Welcome!',
      description: 'You are now logged in to demo mode.',
    })
  }

  const handleLogout = () => {
    logoutSession()
    setAuthenticated(false)
    setHistory([])
    setResponse(null)
    toast({
      title: 'Logged out',
      description: 'You have been logged out of demo mode.',
    })
  }

  const debouncedQueryRef = useRef<NodeJS.Timeout | null>(null)
  const isQueryInProgressRef = useRef(false)

  const executeQuery = useCallback(async (queryText: string, fileIds?: string[]) => {
    // Prevent concurrent queries - return early if one is already in progress
    if (isQueryInProgressRef.current) {
      return
    }
    
    // Set flag immediately to prevent race conditions
    isQueryInProgressRef.current = true

    if (!queryText || queryText.trim().length === 0) {
      toast({
        title: 'Empty query',
        description: 'Please enter a query before submitting.',
        variant: 'destructive',
      })
      return
    }

    // CRITICAL: Ensure chatId exists before query
    // If no chatId, create one first
    let chatIdToUse: string | null = currentChatId
    if (!chatIdToUse) {
      try {
        const res = await fetch('/api/chats', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          chatIdToUse = data.chatId
          if (chatIdToUse) {
            setCurrentChatId(chatIdToUse)
            setCurrentChatIdInStorage(chatIdToUse)
          }
        }
      } catch {
        chatIdToUse = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
        setCurrentChatId(chatIdToUse)
        setCurrentChatIdInStorage(chatIdToUse)
      }
    }
    
    // Only check for files if this is the FIRST query (chat has no messages)
    // If chat already has files, skip this check - files persist across queries
    const isFirstQuery = chatMessages.length === 0
    const hasFiles = (fileIds && fileIds.length > 0) || (chatFiles && chatFiles.length > 0)
    if (isFirstQuery && !hasFiles) {
      toast({
        title: 'Attach a file',
        description: 'Please attach a CSV or Excel file to this chat before running a query.',
        variant: 'destructive',
      })
      return
    }

    setQuery(queryText)
    setIsLoading(true)
    setResponse(null)

    // chatIdToUse should already be set above, but ensure it's set
    if (!chatIdToUse) {
      chatIdToUse = currentChatId || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      setCurrentChatId(chatIdToUse)
      setCurrentChatIdInStorage(chatIdToUse)
    }

    try {
      // CRITICAL: Pass ALL chat files to backend on every request
      // Try multiple sources in order: chatFiles state, localStorage, storedChat, or fileIds parameter
      let allFileIds: string[] = []
      
      // Priority 1: Use chatFiles state (most up-to-date)
      if (chatFiles.length > 0) {
        allFileIds = chatFiles.map(f => f.id).filter(Boolean)
      } else if (chatIdToUse) {
        // Priority 2: Try localStorage (quick access)
        try {
          const storedFiles = localStorage.getItem(`chat_files_${chatIdToUse}`)
          if (storedFiles) {
            const files = JSON.parse(storedFiles)
            allFileIds = files.map((f: any) => f.id).filter(Boolean)
          }
        } catch (error) {
          // Failed to load from localStorage, continue to next source
        }
        
        // Priority 3: Try storedChat (most complete)
        if (allFileIds.length === 0) {
          const storedChat = getChatFromStorage(chatIdToUse)
          if (storedChat && storedChat.attachedFiles) {
            allFileIds = storedChat.attachedFiles.map(f => f.id).filter(Boolean)
            // Update chatFiles state for next time
            setChatFiles(storedChat.attachedFiles)
          }
        }
      }
      
      // Priority 4: Include any fileIds passed as parameter (for newly uploaded files)
      if (fileIds && fileIds.length > 0) {
        for (const fileId of fileIds) {
          if (fileId && !allFileIds.includes(fileId)) {
            allFileIds.push(fileId)
          }
        }
      }
      
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          fileIds: allFileIds,
          chatId: chatIdToUse || undefined,
        }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Query failed: ${res.status} ${errorText}`)
      }
      
      const data: QueryResponse = await res.json()
      
      // Ensure response has required structure
      if (!data) {
        throw new Error('Invalid response from server')
      }
      
      // Ensure all required fields exist, even if empty
      const normalizedResponse: QueryResponse = {
        data: data.data || [],
        columns: data.columns || [],
        reasoning: data.reasoning || 'No reasoning available.',
        preview_sql: data.preview_sql || data.sql || null,
        action_sql: data.action_sql || null,
        sql: data.sql || data.preview_sql || '',
        chartSpec: data.chartSpec || { type: 'table', xField: null, yField: null },
        metricsInfo: data.metricsInfo,
        queryCategory: data.queryCategory,
        error: data.error || null,
      }
      
      if (normalizedResponse.error && normalizedResponse.error.type === 'no_files') {
        toast({
          title: 'Attach a file',
          description: normalizedResponse.error.message || 'Please attach a CSV or Excel file to this chat before running a query.',
          variant: 'destructive',
        })
        setResponse(normalizedResponse)
        isQueryInProgressRef.current = false
        setIsLoading(false)
        return
      }

      // Check for API key error and show friendly modal
      const isApiKeyError = normalizedResponse.error?.message?.includes('API key') ||
        normalizedResponse.error?.message?.includes('API access forbidden') ||
        normalizedResponse.error?.message?.includes('OPENAI_API_KEY') ||
        normalizedResponse.error?.message?.includes('401') ||
        normalizedResponse.error?.message?.includes('403') ||
        normalizedResponse.reasoning?.includes('API access forbidden') ||
        normalizedResponse.reasoning?.includes('OPENAI_API_KEY') ||
        normalizedResponse.reasoning?.includes('Please check your OPENAI_API_KEY')
      
      if (isApiKeyError) {
        setApiKeyErrorModalOpen(true)
      }
      
      // Check for out-of-scope error and show modal
      if (normalizedResponse.error?.type === 'out_of_scope') {
        setOutOfScopeModal({
          open: true,
          message: normalizedResponse.error.message || 'This query is not related to the uploaded data files.',
        })
      }
      
      // Set response immediately
      setResponse(normalizedResponse)
      setIsLoading(false)
      isQueryInProgressRef.current = false

      if (chatIdToUse) {
        const message: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          timestamp: new Date(),
          queryText: queryText,
          response: normalizedResponse,
          summary: queryText.length > 50 ? queryText.substring(0, 50) + '...' : queryText,
        }
        addMessageToStoredChat(chatIdToUse, message)
        
        const currentFiles = chatFiles.length > 0 ? chatFiles : (fileIds || []).map(id => ({
          id,
          fileName: 'Unknown',
          rowCount: 0,
        }))
        updateChatFilesInStorage(chatIdToUse, currentFiles)
        
        // Update chat messages state - add the new message
        setChatMessages(prev => {
          // Check if message already exists (avoid duplicates)
          const exists = prev.some(m => m.id === message.id)
          if (exists) {
            return prev
          }
          return [...prev, message]
        })
        
        // Reload chat messages from storage to ensure consistency
        // This ensures localStorage is always the source of truth
        const reloadTimeout = setTimeout(() => {
          timeoutRefs.current.delete(reloadTimeout)
          const storedChat = getChatFromStorage(chatIdToUse)
          if (storedChat && storedChat.messages) {
            const messages: ChatMessage[] = storedChat.messages.map(msg => ({
              id: msg.id,
              timestamp: new Date(msg.timestamp),
              queryText: msg.queryText,
              response: msg.response,
              summary: msg.summary,
            }))
            // Sort by timestamp to ensure correct order
            messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
            setChatMessages(messages)
          }
        }, 100)
        timeoutRefs.current.add(reloadTimeout)
        
        // CRITICAL: Update chat title from first query for meaningful sidebar titles
        if (chatMessages.length === 0) {
          // Generate meaningful title from first query
          let title = queryText.trim().replace(/\s+/g, ' ')
          if (title.length > 60) {
            const cutPoint = title.substring(0, 57).lastIndexOf(' ')
            title = cutPoint > 30 
              ? title.substring(0, cutPoint) + '...'
              : title.substring(0, 57) + '...'
          }
          if (title.length > 0) {
            title = title.charAt(0).toUpperCase() + title.slice(1)
          }
          
          // Update title in storage
          const storedChat = getChatFromStorage(chatIdToUse)
          if (storedChat) {
            updateChatInStorage(chatIdToUse, { title: title || 'New Chat' })
            // Refresh chat list to show updated title in sidebar
            loadAllChats().catch((error: unknown) => {
              const message = error instanceof Error ? error.message : 'Unknown error'
              if (process.env.NODE_ENV === 'development') {
                console.warn('[Home] Failed to refresh chat list:', message)
              }
            })
          }
        }
      }

      // Refresh chat list without reloading current chat (which would clear response)
      // Don't await this to prevent blocking
      loadAllChats().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Home] Failed to refresh chat list:', message)
        }
      })
      
      // Ensure response persists - set it again after a brief delay
      // This prevents any race conditions with state updates
      const persistTimeout = setTimeout(() => {
        timeoutRefs.current.delete(persistTimeout)
        setResponse(prev => prev || normalizedResponse)
      }, 50)
      timeoutRefs.current.add(persistTimeout)

      const historyItem: QueryHistoryItem = {
        id: Date.now().toString(),
        query: queryText,
        timestamp: new Date(),
        summary: queryText.length > 50 ? queryText.substring(0, 50) + '...' : queryText,
        success: !normalizedResponse.error,
      }
      setHistory((prev) => [...prev, historyItem].slice(-20))

      const scrollTimeout = setTimeout(() => {
        timeoutRefs.current.delete(scrollTimeout)
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
      timeoutRefs.current.add(scrollTimeout)

      // Don't show toast for API key errors - modal handles it
      if (normalizedResponse.error && normalizedResponse.error.type !== 'no_files' && !isApiKeyError) {
        toast({
          title: 'Error',
          description: normalizedResponse.error.message,
          variant: 'destructive',
        })
      } else if (!normalizedResponse.error) {
        toast({
          title: 'Success',
          description: `Query executed successfully. ${normalizedResponse.data?.length || 0} rows returned.`,
        })
      }
    } catch (error: any) {
      // CRITICAL: Never reset chatFiles or currentChatId on error
      // Files persist across errors - user can retry query
      const errorMessage = error.message || 'Failed to execute query. Please try again.'
      
      // Check if this is an API key error
      const isApiKeyError = errorMessage.includes('API key') ||
        errorMessage.includes('API access forbidden') ||
        errorMessage.includes('OPENAI_API_KEY') ||
        errorMessage.includes('401') ||
        errorMessage.includes('403')
      
      const errorResponse: QueryResponse = {
        data: [],
        columns: [],
        reasoning: errorMessage,
        preview_sql: null,
        action_sql: null,
        sql: '',
        chartSpec: { type: 'table', xField: '', yField: '' },
        error: {
          message: errorMessage,
          type: 'unknown',
        },
      }
      setResponse(errorResponse)
      
      // Show API key modal instead of toast for API key errors
      if (isApiKeyError) {
        setApiKeyErrorModalOpen(true)
      } else {
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        })
      }
      
      // CRITICAL: Preserve chatFiles and chatId - do NOT reset them
      // User can retry the query with the same files
    } finally {
      setIsLoading(false)
      isQueryInProgressRef.current = false
    }
  }, [toast, currentChatId, chatFiles, loadAllChats, chatMessages.length])

  const handleQuery = useCallback((queryText: string, fileIds?: string[]) => {
    if (isQueryInProgressRef.current) {
      return
    }

    if (debouncedQueryRef.current) {
      clearTimeout(debouncedQueryRef.current)
    }

    debouncedQueryRef.current = setTimeout(() => {
      executeQuery(queryText, fileIds)
    }, 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executeQuery])

  const handleQueryClick = (queryText: string) => {
    handleQuery(queryText)
  }

  const handleChatClick = (chatId: string) => {
    loadChat(chatId)
  }

  const handleChatDelete = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`/api/chats?chatId=${encodeURIComponent(chatId)}`, {
        method: 'DELETE',
      }).catch(() => {
        return null
      })
      
      if (res && !res.ok) {
        const errorData = await res.json().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Unknown error'
          if (process.env.NODE_ENV === 'development') {
            console.warn('[Home] Failed to parse error response:', message)
          }
          return {}
        })
        throw new Error(errorData.error || 'Failed to delete chat')
      }

      removeChatFromStorage(chatId)
      localStorage.removeItem(`chat_files_${chatId}`)
      
      if (currentChatId === chatId) {
        await createNewChat()
      }
      
      await loadAllChats()
      
      toast({
        title: 'Chat deleted',
        description: 'The chat has been deleted successfully.',
      })
    } catch (error: any) {
      toast({
        title: 'Failed to delete chat',
        description: error.message || 'Please try again',
        variant: 'destructive',
      })
    }
  }, [currentChatId, createNewChat, loadAllChats, toast])

  const handleMessageClick = (message: ChatMessage) => {
    setQuery(message.queryText)
    setResponse(message.response)
    const scrollTimeout = setTimeout(() => {
      timeoutRefs.current.delete(scrollTimeout)
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    timeoutRefs.current.add(scrollTimeout)
  }

  const handleFilesChange = async (files: Array<{ id: string; fileName: string; rowCount: number }>) => {
    // CRITICAL: Always update state immediately (for file removals, this is the new list)
    setChatFiles(files)
    
    // CRITICAL: Ensure chatId exists before persisting
    let chatIdToUse = currentChatId
    if (chatIdToUse) {
      // Update localStorage immediately
      updateChatFilesInStorage(chatIdToUse, files)
      localStorage.setItem(`chat_files_${chatIdToUse}`, JSON.stringify(files))
      
      // Update the stored chat object
      const storedChat = getChatFromStorage(chatIdToUse)
      if (storedChat) {
        updateChatInStorage(chatIdToUse, { attachedFiles: files })
      }
    } else {
      try {
        const res = await fetch('/api/chats', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          if (data.chatId) {
            setCurrentChatId(data.chatId)
            setCurrentChatIdInStorage(data.chatId)
            
            const newChat: StoredChat = {
              chatId: data.chatId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              title: 'New Chat',
              attachedFiles: files,
              messages: [],
            }
            saveChatToStorage(newChat)
            
            if (files.length > 0) {
              await fetch('/api/chats', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chatId: data.chatId,
                  action: 'addFile',
                  fileIds: files.map(f => f.id),
                }),
              }).catch((error: unknown) => {
                const message = error instanceof Error ? error.message : 'Unknown error'
                if (process.env.NODE_ENV === 'development') {
                  console.warn('[Home] Failed to update chat with files:', message)
                }
              })
              await loadChat(data.chatId)
            }
          }
        }
      } catch (error) {
        // Handle silently
      }
    }
  }

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  if (!authenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome to AI SQL Analyst</CardTitle>
            <CardDescription>
              A production-grade natural language to SQL query engine
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This is a demo application. Click below to enter demo mode and start querying your database with natural language.
              </p>
              <Button onClick={handleLogin} className="w-full" size="lg">
                Enter Demo Mode
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <LayoutShell
      sidebar={
        <HistorySidebar
          history={history}
          onQueryClick={handleQueryClick}
          theme={theme}
          onThemeToggle={toggleTheme}
          onLogout={handleLogout}
          chats={chats}
          currentChatId={currentChatId}
          onChatClick={handleChatClick}
          onChatDelete={handleChatDelete}
          onNewChat={createNewChat}
          chatMessages={chatMessages}
          onMessageClick={handleMessageClick}
        />
      }
    >
      <main className="flex-1 overflow-hidden p-6 bg-gradient-to-b from-background to-muted/20">
        <div className="max-w-6xl mx-auto h-full flex flex-col">
          <div className="animate-in fade-in slide-in-from-top-4 duration-500 flex-shrink-0 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-8 bg-primary rounded-full"></div>
              <h2 className="text-2xl font-bold">Query</h2>
            </div>
            <QueryInput 
              onQuery={handleQuery} 
              isLoading={isLoading}
              chatId={currentChatId || undefined}
              chatFiles={chatFiles}
              onFilesChange={handleFilesChange}
              onChatCreated={async (newChatId: string) => {
                setCurrentChatId(newChatId)
                localStorage.setItem('currentChatId', newChatId)
                await loadChat(newChatId)
                await loadAllChats()
              }}
              onNewQuery={() => {
                // Clear the current response but keep chat history visible
                setResponse(null)
                // Scroll to query input area
                const focusTimeout = setTimeout(() => {
                  timeoutRefs.current.delete(focusTimeout)
                  const queryInput = document.querySelector('textarea[placeholder*="Ask a question"]') as HTMLElement
                  queryInput?.focus()
                  queryInput?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }, 100)
                timeoutRefs.current.add(focusTimeout)
              }}
            />
          </div>
          
          {/* Chat History - Show all messages in the current chat */}
          {currentChatId ? (
            <div ref={resultsRef} className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-3 mb-4 flex-shrink-0">
                <div className="w-1 h-8 bg-primary rounded-full"></div>
                <h2 className="text-2xl font-bold">Chat History</h2>
                {chatMessages.length > 0 && (
                  <span className="text-sm text-muted-foreground ml-2">
                    ({chatMessages.length} {chatMessages.length === 1 ? 'message' : 'messages'})
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <ChatHistory 
                  messages={chatMessages} 
                  isLoading={isLoading}
                  currentResponse={response}
                  currentQuery={query}
                  chatId={currentChatId || undefined}
                />
              </div>
            </div>
          ) : (
            /* Results Panel - Show current response if no chat yet */
            response && (
              <div ref={resultsRef} className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1 overflow-y-auto">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-8 bg-primary rounded-full"></div>
                  <h2 className="text-2xl font-bold">Results</h2>
                </div>
                <ResultsPanel response={response} isLoading={isLoading} query={query} chatId={currentChatId || undefined} />
              </div>
            )
          )}
        </div>
      </main>
      
      <OutOfScopeModal
        open={outOfScopeModal.open}
        onOpenChange={(open) => setOutOfScopeModal({ ...outOfScopeModal, open })}
        message={outOfScopeModal.message}
      />

      <ApiKeyErrorModal
        open={apiKeyErrorModalOpen}
        onOpenChange={setApiKeyErrorModalOpen}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onRunQuery={(query) => {
          handleQuery(query)
          setCommandPaletteOpen(false)
        }}
        onSelectTemplate={(template) => {
          setQuery(template)
          setCommandPaletteOpen(false)
          // Focus the query input
          const focusTimeout = setTimeout(() => {
            timeoutRefs.current.delete(focusTimeout)
            const textarea = document.querySelector('textarea[placeholder*="Ask a question"]') as HTMLTextAreaElement
            if (textarea) {
              textarea.focus()
              textarea.setSelectionRange(textarea.value.length, textarea.value.length)
            }
          }, 100)
          timeoutRefs.current.add(focusTimeout)
        }}
        recentQueries={getRecentQueries()}
        bookmarkedQueries={getBookmarks()}
      />
    </LayoutShell>
  )
}

