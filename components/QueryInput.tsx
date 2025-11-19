'use client'

import { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { RunButton } from './RunButton'
import { Paperclip, X, FileText, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface AttachedFile {
  id: string
  fileName: string
  rowCount: number
}

interface AttachedFile {
  id: string
  fileName: string
  rowCount: number
}

interface QueryInputProps {
  onQuery: (query: string, timeRange?: string, fileIds?: string[]) => void
  isLoading: boolean
  chatId?: string
  chatFiles?: AttachedFile[]
  onFilesChange?: (files: AttachedFile[]) => void
  onChatCreated?: (chatId: string) => void
}

export function QueryInput({ 
  onQuery, 
  isLoading, 
  chatId,
  chatFiles = [],
  onFilesChange,
  onChatCreated
}: QueryInputProps) {
  const [query, setQuery] = useState('')
  const [timeRange, setTimeRange] = useState<string>('all_time')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Sync chatFiles prop to attachedFiles state when chat changes
  // This ensures files persist when switching chats or reloading
  useEffect(() => {
    if (chatFiles && Array.isArray(chatFiles)) {
      // Only update if chatFiles actually changed to avoid unnecessary re-renders
      const currentFileIds = attachedFiles.map(f => f.id).sort().join(',')
      const newFileIds = chatFiles.map(f => f.id).sort().join(',')
      if (currentFileIds !== newFileIds) {
        setAttachedFiles(chatFiles)
      }
    } else {
      // Explicitly clear if chat has no files or chatFiles is undefined
      setAttachedFiles([])
    }
  }, [chatFiles, chatId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = async (file: File) => {
    if (!file) return

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

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 10MB',
        variant: 'destructive',
      })
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/attachments', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      const newFile: AttachedFile = {
        id: data.fileId,
        fileName: data.fileName,
        rowCount: data.rowCount,
      }
      
      // Always ensure we have a chatId - create one if needed
      let chatIdToUse = chatId
      if (!chatIdToUse) {
        // Create a new chat if none exists
        try {
          const createRes = await fetch('/api/chats', { method: 'POST' })
          if (createRes.ok) {
            const createData = await createRes.json()
            chatIdToUse = createData.chatId
            // Notify parent that chat was created
            if (onChatCreated && chatIdToUse) {
              onChatCreated(chatIdToUse)
            }
          }
        } catch (error) {
          // Continue without chatId - file will still be in local state
          console.warn('Failed to create chat:', error)
        }
      }
      
      // Add file to chat via API (will create chat if chatId provided but doesn't exist)
      if (chatIdToUse) {
        try {
          const res = await fetch('/api/chats', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatId: chatIdToUse,
              action: 'addFile',
              fileIds: [data.fileId],
            }),
          })
          const responseData = await res.json().catch(() => ({}))
          if (!res.ok) {
            // Don't throw - file is uploaded, just log warning
            console.warn('Failed to add file to chat:', responseData.error)
          } else if (responseData?.chat) {
            // Successfully added to chat - sync with server state
            const serverFiles = responseData.chat.attachedFiles || []
            const fileList = serverFiles.map((f: any) => ({
              id: f.id,
              fileName: f.fileName,
              rowCount: f.data?.length || f.rowCount || 0,
            }))
            setAttachedFiles(fileList)
            // Notify parent to sync
            if (onFilesChange) {
              onFilesChange(fileList)
            }
          }
        } catch (error: any) {
          // Don't throw - file is uploaded, just log warning
          console.warn('Failed to add file to chat:', error.message)
          // Still update local state even if chat API fails
          setAttachedFiles(prev => {
            if (prev.some(f => f.id === newFile.id)) {
              return prev
            }
            const updated = [...prev, newFile]
            if (onFilesChange) {
              onFilesChange(updated)
            }
            return updated
          })
        }
      } else {
        // No chatId - just update local state
        setAttachedFiles(prev => {
          if (prev.some(f => f.id === newFile.id)) {
            return prev
          }
          const updated = [...prev, newFile]
          if (onFilesChange) {
            onFilesChange(updated)
          }
          return updated
        })
      }

      toast({
        title: 'File attached',
        description: `${data.fileName} (${data.rowCount} rows)`,
      })
    } catch (error: any) {
      console.error('File upload error:', error)
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload file. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleRemoveFile = async (fileId: string) => {
    // Remove from chat FIRST via API, then update local state
    if (chatId) {
      try {
        const res = await fetch('/api/chats', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId,
            action: 'removeFile',
            fileIds: [fileId],
          }),
        })
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to remove file from chat')
        }
      } catch (error: any) {
        toast({
          title: 'Failed to remove file from chat',
          description: error.message || 'Please try again',
          variant: 'destructive',
        })
        // Don't remove from local state if API call failed
        return
      }
    }
    
    const updatedFiles = attachedFiles.filter(f => f.id !== fileId)
    setAttachedFiles(updatedFiles)
    
    // Notify parent of file change
    if (onFilesChange) {
      onFilesChange(updatedFiles)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault()
    }
    if (query.trim()) {
      // Frontend validation: check if files are attached
      if (attachedFiles.length === 0) {
        toast({
          title: 'Attach a file',
          description: 'Please attach a CSV or Excel file to this chat before running a query.',
          variant: 'destructive',
        })
        return
      }
      const fileIds = attachedFiles.map(f => f.id)
      onQuery(query.trim(), timeRange, fileIds)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Auto-run on Enter (but allow Shift+Enter for newline)
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (!isLoading && query.trim()) {
        e.preventDefault()
        handleSubmit()
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in-50 duration-300">
      <div 
        className="neumorphic-card border-2 border-dashed p-4 transition-all duration-200 hover:border-primary/50"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="flex gap-4">
          <div className="flex-1">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question in natural language... e.g., 'Show revenue in the last 30 days by product category' (Press Enter to run, Shift+Enter for newline)"
              className="neumorphic-input min-h-[100px] resize-none transition-all duration-200 border-0"
              disabled={isLoading}
            />
            {attachedFiles.length === 0 && (
              <p className="text-sm text-muted-foreground mt-2 px-1">
                Attach a CSV or Excel file to this chat, then write your question in natural language.
              </p>
            )}
          </div>
        </div>
        
        {/* Attachment area */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileInputChange}
            className="hidden"
            disabled={isLoading || isUploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            className="neumorphic-button gap-2 relative"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Paperclip className="h-4 w-4" />
                Attach CSV/Excel
              </>
            )}
          </Button>
          
          {/* Attached files chips */}
          {attachedFiles.map((file) => (
            <div
              key={file.id}
              className="file-pill-success inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 cursor-default"
            >
              <FileText className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              <span className="font-medium text-green-700 dark:text-green-300">{file.fileName}</span>
              <span className="text-xs text-green-600/80 dark:text-green-400/80">({file.rowCount} rows)</span>
              <button
                type="button"
                onClick={() => handleRemoveFile(file.id)}
                className="ml-1 hover:bg-green-200/50 dark:hover:bg-green-900/50 rounded p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/50"
                disabled={isLoading}
                aria-label={`Remove ${file.fileName}`}
              >
                <X className="h-3.5 w-3.5 text-green-700 dark:text-green-300" />
              </button>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <Select value={timeRange} onValueChange={setTimeRange} disabled={isLoading}>
          <SelectTrigger className="w-[180px] transition-all duration-200">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_time">All Time</SelectItem>
            <SelectItem value="last_7_days">Last 7 Days</SelectItem>
            <SelectItem value="last_30_days">Last 30 Days</SelectItem>
            <SelectItem value="last_90_days">Last 90 Days</SelectItem>
          </SelectContent>
        </Select>
        <RunButton 
          onClick={handleSubmit} 
          isLoading={isLoading} 
          disabled={!query.trim() || attachedFiles.length === 0}
        />
      </div>
    </form>
  )
}

