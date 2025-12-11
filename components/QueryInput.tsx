'use client'

import { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RunButton } from './RunButton'
import { Paperclip, X, FileText, Loader2, Eye, Plus, Sparkles } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { FileViewerModal } from './FileViewerModal'
import { QuerySuggestions } from './QuerySuggestions'
import { QueryTemplates } from './QueryTemplates'
import { FilePreviewModal } from './FilePreviewModal'
import { saveRecentQuery } from '@/lib/utils/querySuggestions'

interface AttachedFile {
  id: string
  fileName: string
  rowCount: number
}

interface QueryInputProps {
  onQuery: (query: string, fileIds?: string[]) => void
  isLoading: boolean
  chatId?: string
  chatFiles?: AttachedFile[]
  onFilesChange?: (files: AttachedFile[]) => void
  onChatCreated?: (chatId: string) => void
  onNewQuery?: () => void // Callback to clear input for new query in same chat
}

export function QueryInput({ 
  onQuery, 
  isLoading, 
  chatId,
  chatFiles = [],
  onFilesChange,
  onChatCreated,
  onNewQuery
}: QueryInputProps) {
  const [query, setQuery] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [viewingFile, setViewingFile] = useState<{ id: string; fileName: string } | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const queryInputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isRemovingRef = useRef(false)
  const timeoutRefs = useRef<Set<NodeJS.Timeout>>(new Set())
  const { toast } = useToast()

  // Sync chatFiles prop to attachedFiles state when chat changes
  // CRITICAL: Only sync if chatFiles actually changed (not on every render)
  // This prevents overriding local removals
  const prevChatFilesRef = useRef<string>('')
  
  useEffect(() => {
    // Skip sync if we're in the middle of removing a file
    if (isRemovingRef.current) {
      return
    }
    
    const chatFilesKey = JSON.stringify(chatFiles?.map(f => ({ id: f.id, fileName: f.fileName })) || [])
    
    // Only update if chatFiles actually changed
    if (prevChatFilesRef.current !== chatFilesKey) {
      prevChatFilesRef.current = chatFilesKey
      
      if (chatFiles && Array.isArray(chatFiles) && chatFiles.length > 0) {
        const currentFileIds = attachedFiles.map(f => f.id).sort().join(',')
        const newFileIds = chatFiles.map(f => f.id).sort().join(',')
        if (currentFileIds !== newFileIds) {
          setAttachedFiles(chatFiles)
        }
      } else if (chatFiles && Array.isArray(chatFiles) && chatFiles.length === 0) {
        // Only clear if we're sure there are no files (not just a temporary state)
        if (chatId) {
          const storedChatFiles = localStorage.getItem(`chat_files_${chatId}`)
          if (storedChatFiles) {
            try {
              const files = JSON.parse(storedChatFiles)
              if (files.length > 0) {
                setAttachedFiles(files)
                const changeTimeout = setTimeout(() => {
                  timeoutRefs.current.delete(changeTimeout)
                  if (onFilesChange) {
                    onFilesChange(files)
                  }
                }, 0)
                timeoutRefs.current.add(changeTimeout)
              } else {
                setAttachedFiles([])
              }
            } catch (error) {
              setAttachedFiles([])
            }
          } else {
            setAttachedFiles([])
          }
        } else {
          setAttachedFiles([])
        }
      }
    }
  }, [chatFiles, chatId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout))
      timeoutRefs.current.clear()
    }
  }, [])


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
      
      // CRITICAL: chatId is REQUIRED - ensure we have one before uploading
      let chatIdToUse = chatId
      if (!chatIdToUse) {
        try {
          const createRes = await fetch('/api/chats', { method: 'POST' })
          if (createRes.ok) {
            const createData = await createRes.json()
            chatIdToUse = createData.chatId
            if (onChatCreated && chatIdToUse) {
              onChatCreated(chatIdToUse)
            }
          } else {
            throw new Error('Failed to create chat')
          }
        } catch (error) {
          toast({
            title: 'Upload failed',
            description: 'Could not create or retrieve chat. Please try again.',
            variant: 'destructive',
          })
          setIsUploading(false)
          return
        }
      }
      
      if (!chatIdToUse) {
        toast({
          title: 'Upload failed',
          description: 'Chat ID is required. Please try again.',
          variant: 'destructive',
        })
        setIsUploading(false)
        return
      }
      
      // CRITICAL: ALWAYS send chatId with upload so file is added to chatStore immediately
      // This ensures files persist even if serverless resets
      formData.append('chatId', chatIdToUse)

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
      
      // Use chatId from response if provided (backend returns it)
      if (data.chatId) {
        chatIdToUse = data.chatId
      }
      
      let updatedFiles: AttachedFile[] = []
      setAttachedFiles(prev => {
        if (prev.some(f => f.id === newFile.id)) {
          return prev
        }
        updatedFiles = [...prev, newFile]
        if (chatIdToUse) {
          localStorage.setItem(`chat_files_${chatIdToUse}`, JSON.stringify(updatedFiles))
        }
        return updatedFiles
      })
      
      if (updatedFiles.length > 0 && onFilesChange) {
        const changeTimeout = setTimeout(() => {
          timeoutRefs.current.delete(changeTimeout)
          onFilesChange(updatedFiles)
        }, 0)
        timeoutRefs.current.add(changeTimeout)
      }
      
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
          const responseData = await res.json().catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Unknown error'
            if (process.env.NODE_ENV === 'development') {
              console.warn('[QueryInput] Failed to parse response:', message)
            }
            return {}
          })
          if (!res.ok) {
            // Failed to add file to chat, but file is already uploaded
          } else if (responseData?.chat) {
            const serverFiles = responseData.chat.attachedFiles || []
            const fileList = serverFiles.map((f: any) => ({
              id: f.id,
              fileName: f.fileName,
              rowCount: f.data?.length || f.rowCount || 0,
            }))
            setAttachedFiles(fileList)
            
            try {
              if (chatIdToUse) {
                localStorage.setItem(`chat_files_${chatIdToUse}`, JSON.stringify(fileList))
              }
            } catch (error) {
              // Failed to save files to localStorage, continue anyway
            }
            
            if (onFilesChange) {
              const changeTimeout = setTimeout(() => {
                timeoutRefs.current.delete(changeTimeout)
                onFilesChange(fileList)
              }, 0)
              timeoutRefs.current.add(changeTimeout)
            }
          }
        } catch (error: any) {
          // Failed to add file to chat, but file is already uploaded
          let fallbackFiles: AttachedFile[] = []
          setAttachedFiles(prev => {
            if (prev.some(f => f.id === newFile.id)) {
              return prev
            }
            fallbackFiles = [...prev, newFile]
            return fallbackFiles
          })
          if (fallbackFiles.length > 0 && onFilesChange) {
            const changeTimeout = setTimeout(() => {
              timeoutRefs.current.delete(changeTimeout)
              onFilesChange(fallbackFiles)
            }, 0)
            timeoutRefs.current.add(changeTimeout)
          }
        }
      } else {
        let noChatFiles: AttachedFile[] = []
        setAttachedFiles(prev => {
          if (prev.some(f => f.id === newFile.id)) {
            return prev
          }
          noChatFiles = [...prev, newFile]
          return noChatFiles
        })
        if (noChatFiles.length > 0 && onFilesChange) {
          const changeTimeout = setTimeout(() => {
            timeoutRefs.current.delete(changeTimeout)
            onFilesChange(noChatFiles)
          }, 0)
          timeoutRefs.current.add(changeTimeout)
        }
      }

      toast({
        title: 'File attached',
        description: `${data.fileName} (${data.rowCount} rows)`,
      })
    } catch (error: any) {
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
      // Show preview modal first
      setPreviewFile(file)
      setShowPreview(true)
    }
  }

  const handlePreviewConfirm = (file: File) => {
    setShowPreview(false)
    setPreviewFile(null)
    handleFileSelect(file)
  }

  const handlePreviewCancel = () => {
    setShowPreview(false)
    setPreviewFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDemoCSV = async () => {
    if (isUploading || isLoading) return
    
    setIsUploading(true)
    try {
      const response = await fetch('/sample-data.csv', {
        cache: 'no-cache',
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch sample data: ${response.status} ${response.statusText}`)
      }
      
      const blob = await response.blob()
      
      if (blob.size === 0) {
        throw new Error('Sample data file is empty')
      }
      
      const file = new File([blob], 'sample-data.csv', { type: 'text/csv' })
      
      const formData = new FormData()
      formData.append('file', file)
      
      let chatIdToUse = chatId
      if (!chatIdToUse) {
        try {
          const createRes = await fetch('/api/chats', { method: 'POST' })
          if (createRes.ok) {
            const createData = await createRes.json()
            chatIdToUse = createData.chatId
            if (onChatCreated && chatIdToUse) {
              onChatCreated(chatIdToUse)
            }
          } else {
            throw new Error('Failed to create chat')
          }
        } catch (error) {
          toast({
            title: 'Upload failed',
            description: 'Could not create or retrieve chat. Please try again.',
            variant: 'destructive',
          })
          setIsUploading(false)
          return
        }
      }
      
      if (!chatIdToUse) {
        toast({
          title: 'Upload failed',
          description: 'Chat ID is required. Please try again.',
          variant: 'destructive',
        })
        setIsUploading(false)
        return
      }
      
      formData.append('chatId', chatIdToUse)
      
      const uploadResponse = await fetch('/api/attachments', {
        method: 'POST',
        body: formData,
      })
      
      const data = await uploadResponse.json()
      
      if (!uploadResponse.ok) {
        throw new Error(data.error || 'Upload failed')
      }
      
      const newFile: AttachedFile = {
        id: data.fileId,
        fileName: data.fileName,
        rowCount: data.rowCount,
      }
      
      if (data.chatId) {
        chatIdToUse = data.chatId
      }
      
      let updatedFiles: AttachedFile[] = []
      setAttachedFiles(prev => {
        if (prev.some(f => f.id === newFile.id)) {
          return prev
        }
        updatedFiles = [...prev, newFile]
        if (chatIdToUse) {
          localStorage.setItem(`chat_files_${chatIdToUse}`, JSON.stringify(updatedFiles))
        }
        return updatedFiles
      })
      
      if (updatedFiles.length > 0 && onFilesChange) {
        onFilesChange(updatedFiles)
      }
      
      if (chatIdToUse) {
        try {
          await fetch('/api/chats', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatId: chatIdToUse,
              action: 'addFile',
              fileIds: [data.fileId],
            }),
          })
        } catch (error) {
          // File is already uploaded, continue
        }
      }
      
      toast({
        title: 'Demo data loaded',
        description: `${data.fileName} (${data.rowCount} rows) has been attached`,
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load demo data'
      toast({
        title: 'Failed to load demo',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemoveFile = async (fileId: string) => {
    // Set flag to prevent useEffect from overriding our removal
    isRemovingRef.current = true
    
    // CRITICAL: Optimistically update UI immediately - file should disappear right away
    const currentFiles = [...attachedFiles]
    const updatedFiles = currentFiles.filter(f => f.id !== fileId)
    
    // Update UI state immediately
    setAttachedFiles(updatedFiles)
    
    // Update localStorage immediately
    if (chatId) {
      localStorage.setItem(`chat_files_${chatId}`, JSON.stringify(updatedFiles))
    }
    
    // Notify parent component immediately
    if (onFilesChange) {
      onFilesChange(updatedFiles)
    }
    
    // Then sync with backend
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
          // Revert on error
          setAttachedFiles(currentFiles)
          if (chatId) {
            localStorage.setItem(`chat_files_${chatId}`, JSON.stringify(currentFiles))
          }
          if (onFilesChange) {
            onFilesChange(currentFiles)
          }
          const errorData = await res.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to remove file from chat')
        }
        
        // Get updated file list from backend response to ensure sync
        const responseData = await res.json().catch(() => ({}))
        if (responseData?.chat?.attachedFiles) {
          const serverFiles = responseData.chat.attachedFiles.map((f: any) => ({
            id: f.id,
            fileName: f.fileName,
            rowCount: f.rowCount || f.data?.length || 0,
          }))
          
          // Update state with server response (source of truth)
          setAttachedFiles(serverFiles)
          
          // Update localStorage with server response
          if (chatId) {
            localStorage.setItem(`chat_files_${chatId}`, JSON.stringify(serverFiles))
          }
          
          // Notify parent component with server response
          if (onFilesChange) {
            onFilesChange(serverFiles)
          }
          
          toast({
            title: 'File removed',
            description: 'File has been removed from this chat.',
          })
        } else {
          // Backend didn't return files, but our optimistic update already happened
          toast({
            title: 'File removed',
            description: 'File has been removed from this chat.',
          })
        }
      } catch (error: any) {
        // Revert on error
        setAttachedFiles(currentFiles)
        if (chatId) {
          localStorage.setItem(`chat_files_${chatId}`, JSON.stringify(currentFiles))
        }
        if (onFilesChange) {
          onFilesChange(currentFiles)
        }
        toast({
          title: 'Failed to remove file',
          description: error.message || 'Please try again',
          variant: 'destructive',
        })
      } finally {
        // Clear the removal flag after a short delay to allow state to settle
        const removeTimeout = setTimeout(() => {
          timeoutRefs.current.delete(removeTimeout)
          isRemovingRef.current = false
        }, 100)
        timeoutRefs.current.add(removeTimeout)
      }
    } else {
      // No chatId - just update local state
      toast({
        title: 'File removed',
        description: 'File has been removed.',
      })
      // Clear the removal flag
      setTimeout(() => {
        isRemovingRef.current = false
      }, 100)
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
      if (attachedFiles.length === 0) {
        toast({
          title: 'Attach a file',
          description: 'Please attach a CSV or Excel file to this chat before running a query.',
          variant: 'destructive',
        })
        return
      }
      const trimmedQuery = query.trim()
      saveRecentQuery(trimmedQuery)
      setShowSuggestions(false)
      const fileIds = attachedFiles.map(f => f.id)
      onQuery(trimmedQuery, fileIds)
    }
  }

  const handleSuggestionSelect = (suggestion: string) => {
    setQuery(suggestion)
    setShowSuggestions(false)
    queryInputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd + Enter to run query
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      if (!isLoading && query.trim()) {
        e.preventDefault()
        handleSubmit()
      }
    } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (!isLoading && query.trim()) {
        e.preventDefault()
        handleSubmit()
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4 animate-in fade-in-50 duration-300">
      <div 
        className="neumorphic-card border-2 border-dashed p-3 sm:p-4 transition-all duration-200 hover:border-primary/50"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="flex gap-2 sm:gap-4">
          <div className="flex-1 relative">
            <Textarea
              ref={queryInputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowSuggestions(e.target.value.length > 0 || true)
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              onBlur={(e) => {
                // Delay hiding suggestions to allow clicks
                const blurTimeout = setTimeout(() => {
                  timeoutRefs.current.delete(blurTimeout)
                  setShowSuggestions(false)
                }, 200)
                timeoutRefs.current.add(blurTimeout)
              }}
              placeholder="Ask a question in natural language... (Press Enter to run)"
              className="neumorphic-input min-h-[80px] sm:min-h-[100px] resize-none transition-all duration-200 border-0 text-sm sm:text-base"
              disabled={isLoading}
            />
            <QuerySuggestions
              input={query}
              onSelect={handleSuggestionSelect}
              onClose={() => setShowSuggestions(false)}
              visible={showSuggestions && !isLoading}
            />
            {attachedFiles.length === 0 && (
              <p className="text-xs sm:text-sm text-muted-foreground mt-2 px-1">
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
          <div className="relative file-history-container flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploading}
              className="neumorphic-button gap-2 relative min-h-[44px] text-xs sm:text-sm hover:scale-105 transition-transform duration-200"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Uploading...</span>
                  <span className="sm:hidden">...</span>
                </>
              ) : (
                <>
                  <Paperclip className="h-4 w-4" />
                  <span className="hidden sm:inline">Attach CSV/Excel</span>
                  <span className="sm:hidden">Attach</span>
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDemoCSV}
              disabled={isLoading || isUploading}
              className="neumorphic-button-demo gap-2 relative min-h-[44px] text-xs sm:text-sm hover:scale-105 transition-all duration-200 bg-gradient-to-r from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">Demo CSV</span>
              <span className="sm:hidden">Demo</span>
            </Button>
          </div>
          
          {/* Attached files chips */}
          {attachedFiles.map((file) => (
            <div
              key={file.id}
              className="file-pill-success inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all duration-200 max-w-full"
            >
              <FileText className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <button
                type="button"
                onClick={() => setViewingFile({ id: file.id, fileName: file.fileName })}
                className="font-medium text-green-700 dark:text-green-300 hover:underline cursor-pointer truncate max-w-[120px] sm:max-w-none"
                title={`Click to view ${file.fileName}`}
                disabled={isLoading}
              >
                {file.fileName}
              </button>
              <span className="text-[10px] sm:text-xs text-green-600/80 dark:text-green-400/80 flex-shrink-0">({file.rowCount})</span>
              <button
                type="button"
                onClick={() => setViewingFile({ id: file.id, fileName: file.fileName })}
                className="ml-1 hover:bg-green-200/50 dark:hover:bg-green-900/50 rounded p-1 sm:p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/50 min-w-[32px] min-h-[32px] flex items-center justify-center"
                title={`View ${file.fileName}`}
                aria-label={`View ${file.fileName}`}
                disabled={isLoading}
              >
                <Eye className="h-3.5 w-3.5 text-green-700 dark:text-green-300" />
              </button>
              <button
                type="button"
                onClick={() => handleRemoveFile(file.id)}
                className="ml-1 hover:bg-green-200/50 dark:hover:bg-green-900/50 rounded p-1 sm:p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/50 min-w-[32px] min-h-[32px] flex items-center justify-center"
                disabled={isLoading}
                aria-label={`Remove ${file.fileName}`}
              >
                <X className="h-3.5 w-3.5 text-green-700 dark:text-green-300" />
              </button>
            </div>
          ))}
          
          {/* File Viewer Modal */}
          {viewingFile && (
            <FileViewerModal
              open={!!viewingFile}
              onOpenChange={(open) => {
                if (!open) {
                  setViewingFile(null)
                }
              }}
              fileId={viewingFile.id}
              fileName={viewingFile.fileName}
            />
          )}
        </div>
      </div>

      <FilePreviewModal
        open={showPreview}
        onOpenChange={setShowPreview}
        file={previewFile}
        onConfirm={handlePreviewConfirm}
        onCancel={handlePreviewCancel}
      />
      
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {onNewQuery && chatId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery('')
                onNewQuery()
                queryInputRef.current?.focus()
              }}
              disabled={isLoading}
              className="gap-2 min-h-[44px] text-xs sm:text-sm flex-1 sm:flex-initial"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Query</span>
              <span className="sm:hidden">New</span>
            </Button>
          )}
          <QueryTemplates onSelectTemplate={(template) => setQuery(template)} />
        </div>
        <RunButton 
          onClick={handleSubmit} 
          isLoading={isLoading} 
          disabled={!query.trim() || attachedFiles.length === 0}
        />
      </div>
    </form>
  )
}

