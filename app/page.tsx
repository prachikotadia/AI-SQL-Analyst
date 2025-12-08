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
    
    const storedChat = getChatFromStorage(chatId)
    if (storedChat) {
      setCurrentChatId(storedChat.chatId)
      setCurrentChatIdInStorage(storedChat.chatId)
      setChatFiles(storedChat.attachedFiles || [])
      
      const messages: ChatMessage[] = storedChat.messages.map(msg => ({
        id: msg.id,
        timestamp: new Date(msg.timestamp),
        queryText: msg.queryText,
        response: msg.response,
        summary: msg.summary,
      }))
      setChatMessages(messages)
      
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1]
        setResponse(lastMessage.response)
      } else {
        setResponse(null)
      }
    }
    
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
          
          const serverMessages: ChatMessage[] = (data.chat.messages || []).map((msg: any) => ({
            id: msg.id,
            timestamp: new Date(msg.timestamp),
            queryText: msg.queryText,
            response: msg.response,
            summary: msg.summary,
          }))
          setChatMessages(serverMessages)
          
          const chatToStore: StoredChat = {
            chatId: loadedChatId,
            createdAt: data.chat.createdAt ? new Date(data.chat.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: data.chat.updatedAt ? new Date(data.chat.updatedAt).toISOString() : new Date().toISOString(),
            title: data.chat.title || 'New Chat',
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
          
          if (serverMessages.length > 0) {
            const lastMessage = serverMessages[serverMessages.length - 1]
            setResponse(lastMessage.response)
          } else {
            setResponse(null)
          }
        }
      }
    } catch (error) {
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
      console.warn('Failed to load chats from server, using localStorage:', error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const session = getSession()
    setAuthenticated(isAuthenticated())
    
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    }

    const savedChatId = getCurrentChatId() || localStorage.getItem('currentChatId')
    if (savedChatId) {
      loadChat(savedChatId).catch(() => {})
    } else {
      createNewChat().catch(() => {})
    }

    loadAllChats().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

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

  const debouncedQueryRef = useRef<NodeJS.Timeout | null>(null)
  const isQueryInProgressRef = useRef(false)

  const executeQuery = useCallback(async (queryText: string, timeRangeValue?: string, fileIds?: string[]) => {
    if (isQueryInProgressRef.current) {
      return
    }

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
        chatIdToUse = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        setCurrentChatId(chatIdToUse)
        setCurrentChatIdInStorage(chatIdToUse)
        
        const newChat: StoredChat = {
          chatId: chatIdToUse,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          title: 'New Chat',
          attachedFiles: [],
          messages: [],
        }
        saveChatToStorage(newChat)
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

      if (chatIdToUse) {
        const message: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          queryText: queryText,
          response: data,
          summary: queryText.length > 50 ? queryText.substring(0, 50) + '...' : queryText,
        }
        addMessageToStoredChat(chatIdToUse, message)
        
        const currentFiles = chatFiles.length > 0 ? chatFiles : (fileIds || []).map(id => ({
          id,
          fileName: 'Unknown',
          rowCount: 0,
        }))
        updateChatFilesInStorage(chatIdToUse, currentFiles)
      }

      if (chatIdToUse) {
        await loadChat(chatIdToUse)
        await loadAllChats()
      }

      const historyItem: QueryHistoryItem = {
        id: Date.now().toString(),
        query: queryText,
        timestamp: new Date(),
        summary: queryText.length > 50 ? queryText.substring(0, 50) + '...' : queryText,
        success: !data.error,
      }
      setHistory((prev) => [...prev, historyItem].slice(-20))

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)

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
  }, [timeRange, toast, currentChatId, chatFiles, loadChat, loadAllChats])

  const handleQuery = useCallback((queryText: string, timeRangeValue?: string, fileIds?: string[]) => {
    if (isQueryInProgressRef.current) {
      return
    }

    if (debouncedQueryRef.current) {
      clearTimeout(debouncedQueryRef.current)
    }

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

  const handleChatDelete = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`/api/chats?chatId=${encodeURIComponent(chatId)}`, {
        method: 'DELETE',
      }).catch(() => {
        return null
      })
      
      if (res && !res.ok) {
        const errorData = await res.json().catch(() => ({}))
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
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const handleFilesChange = async (files: Array<{ id: string; fileName: string; rowCount: number }>) => {
    setChatFiles(files)
    
    if (currentChatId) {
      updateChatFilesInStorage(currentChatId, files)
    }
    
    if (currentChatId) {
      try {
        await loadChat(currentChatId)
      } catch (error) {
        // Files are in local state and localStorage
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
              }).catch(() => {})
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

