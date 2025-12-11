'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DataTable } from './DataTable'
import { Skeleton } from '@/components/ui/skeleton'
import type { ColumnMetadata } from '@/types'

interface FileViewerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileId: string
  fileName: string
}

export function FileViewerModal({
  open,
  onOpenChange,
  fileId,
  fileName,
}: FileViewerModalProps) {
  const [loading, setLoading] = useState(true)
  const [fileData, setFileData] = useState<any[]>([])
  const [columns, setColumns] = useState<ColumnMetadata[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && fileId) {
      setLoading(true)
      setError(null)
      
      fetch(`/api/files/${fileId}`)
        .then(async (res) => {
          if (!res.ok) {
            const errorData = await res.json().catch((error: unknown) => {
              const message = error instanceof Error ? error.message : 'Unknown error'
              if (process.env.NODE_ENV === 'development') {
                console.warn('[FileViewerModal] Failed to parse error response:', message)
              }
              return {}
            })
            throw new Error(errorData.error || 'Failed to load file')
          }
          return res.json()
        })
        .then((data) => {
          setFileData(data.data || [])
          setColumns(data.columns || [])
          setLoading(false)
        })
        .catch((err) => {
          setError(err.message || 'Failed to load file')
          setLoading(false)
        })
    } else {
      // Reset when modal closes
      setFileData([])
      setColumns([])
      setError(null)
    }
  }, [open, fileId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{fileName}</DialogTitle>
          <DialogDescription>
            {loading ? 'Loading file data...' : (
              <>
                Showing {fileData.length} {fileData.length === 1 ? 'row' : 'rows'}
                {fileData.length >= 1000 && ' (showing first 1000 rows)'}
                {columns.length > 0 && ` • ${columns.length} ${columns.length === 1 ? 'column' : 'columns'}`}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-destructive font-medium mb-2">Error loading file</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : fileData.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">No data available</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <DataTable data={fileData} columns={columns} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
