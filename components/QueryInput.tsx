'use client'

import { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { RunButton } from './RunButton'
import { Paperclip, X, FileText, Loader2, History } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { saveFileToStorage, getStoredFiles, getFileHistory, removeFileFromStorage, type StoredFile } from '@/lib/storage/localFileStorage'

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
  const [showFileHistory, setShowFileHistory] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Sync chatFiles prop to attachedFiles state when chat changes
  useEffect(() => {
    if (chatFiles && Array.isArray(chatFiles) && chatFiles.length > 0) {
      const currentFileIds = attachedFiles.map(f => f.id).sort().join(',')
      const newFileIds = chatFiles.map(f => f.id).sort().join(',')
      if (currentFileIds !== newFileIds) {
        setAttachedFiles(chatFiles)
      }
    } else if (chatFiles && Array.isArray(chatFiles) && chatFiles.length === 0) {
      if (chatId) {
        const storedChatFiles = localStorage.getItem(`chat_files_${chatId}`)
        if (storedChatFiles) {
          try {
            const files = JSON.parse(storedChatFiles)
            if (files.length > 0) {
              setAttachedFiles(files)
              setTimeout(() => {
                if (onFilesChange) {
                  onFilesChange(files)
                }
              }, 0)
            }
          } catch (error) {
            console.warn('Failed to restore files from localStorage:', error)
          }
        }
      } else {
        setAttachedFiles([])
      }
    } else {
      setAttachedFiles([])
    }
  }, [chatFiles, chatId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close file history dropdown when clicking outside
  useEffect(() => {
    if (!showFileHistory) return
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.file-history-container')) {
        setShowFileHistory(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFileHistory])

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
          }
        } catch (error) {
          console.warn('Failed to create chat:', error)
        }
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
        setTimeout(() => {
          onFilesChange(updatedFiles)
        }, 0)
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
          const responseData = await res.json().catch(() => ({}))
          if (!res.ok) {
            console.warn('Failed to add file to chat:', responseData.error)
          } else if (responseData?.chat) {
            const serverFiles = responseData.chat.attachedFiles || []
            const fileList = serverFiles.map((f: any) => ({
              id: f.id,
              fileName: f.fileName,
              rowCount: f.data?.length || f.rowCount || 0,
            }))
            setAttachedFiles(fileList)
            
            try {
              for (const serverFile of serverFiles) {
                const storedFile: StoredFile = {
                  id: serverFile.id,
                  fileName: serverFile.fileName,
                  tableName: serverFile.tableName || data.tableName,
                  columns: serverFile.columns || data.columns || [],
                  data: [],
                  uploadedAt: new Date().toISOString(),
                  rowCount: serverFile.rowCount || data.rowCount || 0,
                }
                saveFileToStorage(storedFile)
              }
              
              if (chatIdToUse) {
                localStorage.setItem(`chat_files_${chatIdToUse}`, JSON.stringify(fileList))
              }
            } catch (error) {
              console.warn('Failed to save files to localStorage:', error)
            }
            
            if (onFilesChange) {
              setTimeout(() => {
                onFilesChange(fileList)
              }, 0)
            }
          }
        } catch (error: any) {
          console.warn('Failed to add file to chat:', error.message)
          let fallbackFiles: AttachedFile[] = []
          setAttachedFiles(prev => {
            if (prev.some(f => f.id === newFile.id)) {
              return prev
            }
            fallbackFiles = [...prev, newFile]
            return fallbackFiles
          })
          if (fallbackFiles.length > 0 && onFilesChange) {
            setTimeout(() => {
              onFilesChange(fallbackFiles)
            }, 0)
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
          setTimeout(() => {
            onFilesChange(noChatFiles)
          }, 0)
        }
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
        return
      }
    }
    
    const updatedFiles = attachedFiles.filter(f => f.id !== fileId)
    setAttachedFiles(updatedFiles)
    
    if (onFilesChange) {
      setTimeout(() => {
        onFilesChange(updatedFiles)
      }, 0)
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
      const fileIds = attachedFiles.map(f => f.id)
      onQuery(query.trim(), timeRange, fileIds)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
          <div className="relative file-history-container">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowFileHistory(!showFileHistory)}
              disabled={isLoading || isUploading}
              className="neumorphic-button gap-2 ml-2"
              title="Show file history"
            >
              <History className="h-4 w-4" />
            </Button>
            {showFileHistory && (
              <div className="absolute top-full left-0 mt-2 z-50 bg-background border border-border rounded-lg shadow-lg p-2 max-h-64 overflow-y-auto min-w-[300px] file-history-container">
                <div className="text-sm font-semibold mb-2 px-2">File History</div>
                {getFileHistory().length === 0 ? (
                  <div className="text-sm text-muted-foreground px-2 py-4">No previous files</div>
                ) : (
                  <div className="space-y-1">
                    {getFileHistory().map((storedFile) => (
                      <div
                        key={storedFile.id}
                        className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer group"
                        onClick={async () => {
                          try {
                            setIsUploading(true)
                            
                            if (!storedFile.data || storedFile.data.length === 0) {
                              toast({
                                title: 'Cannot re-upload file',
                                description: 'File data is not available. Please upload the file again manually.',
                                variant: 'destructive',
                              })
                              setIsUploading(false)
                              return
                            }
                            
                            const csvContent = [
                              storedFile.columns.map(c => c.name).join(','),
                              ...storedFile.data.map(row =>
                                storedFile.columns.map(col => {
                                  const val = row[col.name]
                                  if (val === null || val === undefined) return ''
                                  const str = String(val)
                                  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                    return `"${str.replace(/"/g, '""')}"`
                                  }
                                  return str
                                }).join(',')
                              ),
                            ].join('\n')
                            
                            if (csvContent.split('\n').length < 2) {
                              toast({
                                title: 'Invalid file data',
                                description: 'File data is incomplete. Please upload the file again manually.',
                                variant: 'destructive',
                              })
                              setIsUploading(false)
                              return
                            }
                            
                            const blob = new Blob([csvContent], { type: 'text/csv' })
                            const file = new File([blob], storedFile.fileName, { type: 'text/csv' })
                            
                            await handleFileSelect(file)
                            setShowFileHistory(false)
                          } catch (error: any) {
                            toast({
                              title: 'Failed to re-upload file',
                              description: error.message || 'Please try again',
                              variant: 'destructive',
                            })
                          } finally {
                            setIsUploading(false)
                          }
                        }}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{storedFile.fileName}</div>
                            <div className="text-xs text-muted-foreground">
                              {storedFile.rowCount} rows • {new Date(storedFile.uploadedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeFileFromStorage(storedFile.id)
                            toast({
                              title: 'File removed from history',
                              description: storedFile.fileName,
                            })
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                        >
                          <X className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
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

