'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Upload, Send, Loader2, FileText, X, CheckCircle2, Database, Sparkles, Plus } from 'lucide-react'
import { ChartPanel } from './ChartPanel'
import { DataTable } from './DataTable'
import { SqlPanel } from './SqlPanel'
import type { ColumnMetadata } from '@/types'

interface ChatMessage {
  id: string
  type: 'user' | 'assistant' | 'error' | 'system'
  content: string
  sql?: string
  table?: Record<string, any>[]
  chart?: {
    type: string
    xField: string | null
    yField: string | null
    seriesField?: string | null
    data: Record<string, any>[]
  }
  columns?: ColumnMetadata[]
  timestamp: Date
}

interface ChatInterfaceProps {
  className?: string
}

export function ChatInterface({ className }: ChatInterfaceProps) {
  const [sessionId] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('chat-session-id')
      if (stored) return stored
      const newId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
      localStorage.setItem('chat-session-id', newId)
      return newId
    }
    return `chat-${Date.now()}`
  })
  
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasFile, setHasFile] = useState(false)
  const [fileInfo, setFileInfo] = useState<{ name: string; rowCount: number; columns: Array<{ name: string; type: string }> } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { toast } = useToast()

  // Check for existing file on mount
  useEffect(() => {
    checkSessionStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const checkSessionStatus = async () => {
    try {
      const response = await fetch('/api/chat', {
        headers: { 'x-session-id': sessionId },
      })
      const data = await response.json()
      if (data.hasFile) {
        setHasFile(true)
        setFileInfo({
          name: data.fileName,
          rowCount: data.rowCount,
          columns: data.columns,
        })
        setMessages([{
          id: 'system-1',
          type: 'system',
          content: `File "${data.fileName}" loaded. ${data.rowCount} rows ready for analysis.`,
          timestamp: new Date(),
        }])
      }
    } catch (error) {
      // Session doesn't exist yet
    }
  }

  const handleFileUpload = async (file: File) => {
    if (!file) return

    // Validate file type
    const validExtensions = ['.csv', '.xlsx', '.xls']
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    
    if (!validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a CSV or Excel file (.csv, .xlsx, .xls)',
        variant: 'destructive',
      })
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 10MB',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
        headers: { 'x-session-id': sessionId },
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error || 'Upload failed')
      }

      setHasFile(true)
      setFileInfo({
        name: file.name,
        rowCount: data.rowCount,
        columns: data.columns || [],
      })

      // Add system message
      setMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        type: 'system',
        content: data.message || `File "${file.name}" uploaded successfully. ${data.rowCount} rows loaded.`,
        timestamp: new Date(),
      }])

      toast({
        title: 'File uploaded!',
        description: `Ready to analyze ${data.rowCount} rows.`,
      })
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload file',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    if (!hasFile) {
      toast({
        title: 'No file uploaded',
        description: 'Please upload a CSV or Excel file first.',
        variant: 'destructive',
      })
      return
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('query', input.trim())

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
        headers: { 'x-session-id': sessionId },
      })

      const data = await response.json()

      if (data.error) {
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          type: 'error',
          content: data.error,
          timestamp: new Date(),
        }])
      } else {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          type: 'assistant',
          content: data.reasoning || 'Query executed successfully.',
          sql: data.sql,
          table: data.table,
          chart: data.chart,
          columns: data.table?.[0] ? Object.keys(data.table[0]).map(name => ({ name, type: 'text' })) : [],
          timestamp: new Date(),
        }
        setMessages(prev => [...prev, assistantMessage])
      }
    } catch (error: any) {
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        type: 'error',
        content: error.message || 'Failed to process query',
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Data Analyst Chat</h1>
              <p className="text-sm text-muted-foreground">
                {hasFile ? `Analyzing: ${fileInfo?.name}` : 'Upload a file to get started'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasFile && fileInfo && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-1.5 rounded-md bg-muted/50">
                <Database className="h-4 w-4" />
                <span className="font-medium">{fileInfo.name}</span>
                <span>•</span>
                <span>{fileInfo.rowCount} rows</span>
                <span>•</span>
                <span>{fileInfo.columns.length} columns</span>
              </div>
            )}
            <div className="relative">
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileInputChange}
                className="hidden"
                id="chat-file-upload"
                disabled={isLoading}
              />
              <Button
                variant={hasFile ? "outline" : "default"}
                size="sm"
                onClick={() => document.getElementById('chat-file-upload')?.click()}
                disabled={isLoading}
                className="gap-2"
              >
                {hasFile ? (
                  <>
                    <Upload className="h-4 w-4" />
                    Replace File
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Upload File
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
        {!hasFile ? (
          <div className="flex flex-col items-center justify-center h-full space-y-6">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="h-12 w-12 text-primary" />
            </div>
            <div className="text-center max-w-md">
              <h2 className="text-2xl font-bold mb-2">Upload Your Data</h2>
              <p className="text-muted-foreground mb-6">
                Upload a CSV or Excel file to start analyzing your data with natural language queries.
              </p>
              <div className="max-w-md mx-auto">
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const file = e.dataTransfer.files[0]
                    if (file) {
                      handleFileUpload(file)
                    }
                  }}
                  className="border-2 border-dashed rounded-lg p-8 text-center transition-colors border-muted-foreground/25 hover:border-primary/50 cursor-pointer"
                  onClick={() => document.getElementById('chat-file-upload')?.click()}
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex gap-4">
                      <FileText className="h-12 w-12 text-muted-foreground" />
                      <FileText className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">
                        Drag and drop your file here, or click to browse
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Supports CSV and Excel files (.csv, .xlsx, .xls)
                      </p>
                    </div>
                    <Button variant="outline" disabled={isLoading}>
                      <Upload className="mr-2 h-4 w-4" />
                      Select File
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Ready to analyze!</h3>
                  <p className="text-sm text-muted-foreground">
                    Ask questions about your data in natural language.
                  </p>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300 ${
                  message.type === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.type !== 'user' && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                
                <div
                  className={`max-w-[80%] space-y-2 ${
                    message.type === 'user' ? 'items-end' : 'items-start'
                  } flex flex-col`}
                >
                  <Card
                    className={`${
                      message.type === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : message.type === 'error'
                        ? 'bg-destructive/10 border-destructive/20'
                        : 'bg-background'
                    }`}
                  >
                    <CardContent className="p-4">
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </CardContent>
                  </Card>

                  {/* SQL Display */}
                  {message.sql && (
                    <Card className="bg-muted/50">
                      <CardContent className="p-3">
                        <SqlPanel sql={message.sql} />
                      </CardContent>
                    </Card>
                  )}

                  {/* Table Display */}
                  {message.table && message.table.length > 0 && (
                    <Card className="w-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Results</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <DataTable data={message.table} columns={message.columns || []} />
                      </CardContent>
                    </Card>
                  )}

                  {/* Chart Display */}
                  {message.chart && message.chart.data && message.chart.data.length > 0 && (
                    <Card className="w-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Visualization</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ChartPanel
                          data={message.chart.data}
                          chartSpec={{
                            type: message.chart.type as any,
                            xField: message.chart.xField,
                            yField: message.chart.yField,
                            seriesField: message.chart.seriesField,
                          }}
                          columns={message.columns || []}
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>

                {message.type === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold">You</span>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-4 justify-start animate-in fade-in">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                </div>
                <Card className="bg-background">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Analyzing your query...</span>
                  </CardContent>
                </Card>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      {hasFile && (
        <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your data... (Press Enter to send, Shift+Enter for newline)"
              className="min-h-[60px] resize-none"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="lg"
              className="shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

