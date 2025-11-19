'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { QueryInput } from '@/components/QueryInput'
import { ResultsPanel } from '@/components/ResultsPanel'
import { HistorySidebar } from '@/components/HistorySidebar'
import { LayoutShell } from '@/components/LayoutShell'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getSession, loginDemo, isAuthenticated, logout as logoutSession } from '@/lib/auth/session'
import type { QueryResponse, QueryHistoryItem, ChatInfo } from '@/types'
import { createChat, getChat, getAllChats, type ChatMessage } from '@/lib/data/chatStore'

export default function Home() {
  const [query, setQuery] = useState('')
  const [timeRange, setTimeRange] = useState<string>('all_time')
  const [response, setResponse] = useState<QueryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [history, setHistory] = useState<QueryHistoryItem[]>([])
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [authenticated, setAuthenticated] = useState(false)
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [chatFiles, setChatFiles] = useState<Array<{ id: string; fileName: string; rowCount: number }>>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chats, setChats] = useState<ChatInfo[]>([])
  const resultsRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Define functions before useEffect that uses them
  const createNewChat = useCallback(async () => {
    try {
      const res = await fetch('/api/chats', { method: 'POST' })
      if (!res.ok) {
        // Fallback to in-memory chat creation
        const fallbackChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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
        localStorage.setItem('currentChatId', newChatId)
        setChatFiles([])
        setChatMessages([])
        setQuery('')
        setResponse(null)
      }
    } catch (error) {
      // Silent fallback - create chat in-memory
      const fallbackChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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
    
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`)
      if (!res.ok) {
        // API should never return non-OK in normal flow, but handle gracefully
        const errorData = await res.json().catch(() => ({}))
        // Silently create new chat - no error logging for expected cases
        await createNewChat()
        return
      }
      
      const data = await res.json()
      if (data.chat) {
        const loadedChatId = data.chat.chatId
        setCurrentChatId(loadedChatId)
        localStorage.setItem('currentChatId', loadedChatId)
        setChatFiles(data.chat.attachedFiles || [])
        setChatMessages(data.chat.messages || [])
        // Load last message response if available
        if (data.chat.messages && data.chat.messages.length > 0) {
          const lastMessage = data.chat.messages[data.chat.messages.length - 1]
          setResponse(lastMessage.response)
        } else {
          setResponse(null)
        }
      } else {
        // No chat data, create new one silently
        await createNewChat()
      }
    } catch (error) {
      // Only log unexpected network errors, not normal chat creation flows
      if (error instanceof TypeError && error.message.includes('fetch')) {
        // Network error - log concisely
        console.warn('Network error loading chat, creating new chat')
      }
      // Silently create new chat
      await createNewChat()
    }
  }, [createNewChat])

  const loadAllChats = useCallback(async () => {
    try {
      const res = await fetch('/api/chats')
      if (res.ok) {
        const data = await res.json()
        setChats(data.chats || [])
      }
    } catch (error) {
      // Silently handle - empty list is fine
      setChats([])
    }
  }, [])

  useEffect(() => {
    // Check authentication
    const session = getSession()
    setAuthenticated(isAuthenticated())
    
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    }

    // Initialize or load current chat (only on client side)
    if (typeof window !== 'undefined') {
      const savedChatId = localStorage.getItem('currentChatId')
      if (savedChatId) {
        loadChat(savedChatId).catch(() => {
          // Silently handle - loadChat will create new chat on error
        })
      } else {
        createNewChat().catch(() => {
          // Silently handle - createNewChat has fallback
        })
      }

      // Load all chats
      loadAllChats().catch(() => {
        // Silently handle - empty list is fine
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Apply theme class
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debouncedQueryRef.current) {
        clearTimeout(debouncedQueryRef.current)
      }
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

  // Debounced query handler to prevent duplicate submissions
  const debouncedQueryRef = useRef<NodeJS.Timeout | null>(null)
  const isQueryInProgressRef = useRef(false)

  const executeQuery = useCallback(async (queryText: string, timeRangeValue?: string, fileIds?: string[]) => {
    // Prevent duplicate submissions if already loading
    if (isQueryInProgressRef.current) {
      return
    }

    // FRONTEND VALIDATION: Check if there are any attached files before calling API
    const hasFiles = (fileIds && fileIds.length > 0) || (chatFiles && chatFiles.length > 0)
    if (!hasFiles) {
      toast({
        title: 'Attach a file',
        description: 'Please attach a CSV or Excel file to this chat before running a query.',
        variant: 'destructive',
      })
      return
    }

    isQueryInProgressRef.current = true
    setQuery(queryText)
    setIsLoading(true)
    setResponse(null)

    // Ensure we have a chatId
    let chatIdToUse: string | null = currentChatId
    if (!chatIdToUse) {
      try {
        const res = await fetch('/api/chats', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          chatIdToUse = data.chatId
          if (chatIdToUse) {
            setCurrentChatId(chatIdToUse)
            localStorage.setItem('currentChatId', chatIdToUse)
          }
        }
      } catch {
        // Fallback: generate chatId locally
        chatIdToUse = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        setCurrentChatId(chatIdToUse)
        localStorage.setItem('currentChatId', chatIdToUse)
      }
    }

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          timeRange: timeRangeValue || timeRange,
          fileIds: fileIds || [],
          chatId: chatIdToUse,
        }),
      })

      const data: QueryResponse = await res.json()
      
      // Handle soft error for "no files" case (backend returns 200 with error object)
      if (data.error && data.error.type === 'no_files') {
        toast({
          title: 'Attach a file',
          description: data.error.message || 'Please attach a CSV or Excel file to this chat before running a query.',
          variant: 'destructive',
        })
        setResponse(data)
        isQueryInProgressRef.current = false
        setIsLoading(false)
        return
      }
      
      setResponse(data)

      // Reload chat to get updated messages and files
      if (chatIdToUse) {
        await loadChat(chatIdToUse)
        await loadAllChats()
      }

      // Add to history (legacy, for backward compatibility)
      const historyItem: QueryHistoryItem = {
        id: Date.now().toString(),
        query: queryText,
        timestamp: new Date(),
        summary: queryText.length > 50 ? queryText.substring(0, 50) + '...' : queryText,
        success: !data.error,
      }
      setHistory((prev) => [...prev, historyItem].slice(-20)) // Keep last 20

      // Auto-scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)

      // Only show error toast for non-"no_files" errors (no_files already handled above)
      if (data.error && data.error.type !== 'no_files') {
        toast({
          title: 'Error',
          description: data.error.message,
          variant: 'destructive',
        })
      } else if (!data.error) {
        toast({
          title: 'Success',
          description: `Query executed successfully. ${data.data?.length || 0} rows returned.`,
        })
      }
    } catch (error: any) {
      const errorResponse: QueryResponse = {
        data: [],
        columns: [],
        reasoning: '',
        preview_sql: null,
        action_sql: null,
        sql: '',
        chartSpec: { type: 'table', xField: '', yField: '' },
        error: {
          message: error.message || 'Failed to execute query',
          type: 'unknown',
        },
      }
      setResponse(errorResponse)
      toast({
        title: 'Error',
        description: 'Failed to execute query. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
      isQueryInProgressRef.current = false
    }
  }, [timeRange, toast, currentChatId])

  const handleQuery = useCallback((queryText: string, timeRangeValue?: string, fileIds?: string[]) => {
    // Prevent immediate duplicate submissions
    if (isQueryInProgressRef.current) {
      return
    }

    // Clear any pending debounced calls
    if (debouncedQueryRef.current) {
      clearTimeout(debouncedQueryRef.current)
    }

    // Debounce the actual query execution (500ms)
    debouncedQueryRef.current = setTimeout(() => {
      executeQuery(queryText, timeRangeValue, fileIds)
    }, 500)
  }, [executeQuery])

  const handleQueryClick = (queryText: string) => {
    handleQuery(queryText, timeRange)
  }

  const handleChatClick = (chatId: string) => {
    loadChat(chatId)
  }

  const handleMessageClick = (message: ChatMessage) => {
    setQuery(message.queryText)
    setResponse(message.response)
    // Scroll to results
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const handleFilesChange = async (files: Array<{ id: string; fileName: string; rowCount: number }>) => {
    setChatFiles(files)
    // Reload chat to get updated file list and ensure sync
    if (currentChatId) {
      try {
        await loadChat(currentChatId)
      } catch (error) {
        // Silently handle - files are in local state
      }
    } else {
      // If no chatId, try to get it from the latest chat or create one
      try {
        const res = await fetch('/api/chats', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          if (data.chatId) {
            setCurrentChatId(data.chatId)
            localStorage.setItem('currentChatId', data.chatId)
            // Now add files to the new chat
            if (files.length > 0) {
              await fetch('/api/chats', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chatId: data.chatId,
                  action: 'addFile',
                  fileIds: files.map(f => f.id),
                }),
              })
              await loadChat(data.chatId)
            }
          }
        }
      } catch (error) {
        // Silently handle
      }
    }
  }

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  // Show login screen if not authenticated
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
          onNewChat={createNewChat}
          chatMessages={chatMessages}
          onMessageClick={handleMessageClick}
        />
      }
    >
      <main className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-background to-muted/20">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="animate-in fade-in slide-in-from-top-4 duration-500">
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
            />
          </div>
          <div ref={resultsRef} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-8 bg-primary rounded-full"></div>
              <h2 className="text-2xl font-bold">Results</h2>
            </div>
            <ResultsPanel response={response} isLoading={isLoading} />
          </div>
        </div>
      </main>
    </LayoutShell>
  )
}

