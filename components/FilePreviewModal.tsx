'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useState, useEffect } from 'react'

interface FilePreviewData {
  rows: Record<string, any>[]
  columns: Array<{ name: string; type: string }>
  rowCount: number
  fileSize: number
  fileName: string
}

interface FilePreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  file: File | null
  onConfirm: (file: File) => void
  onCancel: () => void
}

export function FilePreviewModal({
  open,
  onOpenChange,
  file,
  onConfirm,
  onCancel,
}: FilePreviewModalProps) {
  const [previewData, setPreviewData] = useState<FilePreviewData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file || !open) {
      setPreviewData(null)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)

    const loadPreview = async () => {
      try {
        const fileExtension = file.name.toLowerCase().split('.').pop()
        let rows: Record<string, any>[] = []
        let columns: Array<{ name: string; type: string }> = []

        if (fileExtension === 'csv') {
          const text = await file.text()
          const lines = text.split('\n').filter(line => line.trim())
          if (lines.length === 0) {
            throw new Error('File is empty')
          }

          // Parse CSV header
          const headerLine = lines[0]
          const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''))
          columns = headers.map(name => ({ name, type: 'text' }))

          // Parse first 10 rows
          const dataLines = lines.slice(1, 11)
          rows = dataLines.map(line => {
            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
            const row: Record<string, any> = {}
            headers.forEach((header, idx) => {
              row[header] = values[idx] || ''
            })
            return row
          })

          // Detect column types
          if (rows.length > 0) {
            columns = columns.map(col => {
              const sampleValues = rows.map(r => r[col.name]).filter(v => v !== '' && v !== null && v !== undefined)
              if (sampleValues.length === 0) return { ...col, type: 'text' }

              // Check if numeric
              const numericCount = sampleValues.filter(v => !isNaN(Number(v)) && v !== '').length
              if (numericCount / sampleValues.length > 0.8) {
                return { ...col, type: 'number' }
              }

              // Check if date
              const dateCount = sampleValues.filter(v => !isNaN(Date.parse(v))).length
              if (dateCount / sampleValues.length > 0.5) {
                return { ...col, type: 'date' }
              }

              return { ...col, type: 'text' }
            })
          }
        } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
          // For Excel files, we'd need to use xlsx library
          // For now, show a message that Excel preview requires upload
          throw new Error('Excel file preview requires upload. Please upload to see preview.')
        } else {
          throw new Error('Unsupported file type')
        }

        // Count total rows (approximate for CSV)
        const text = await file.text()
        const totalRows = text.split('\n').filter(line => line.trim()).length - 1 // Subtract header

        setPreviewData({
          rows,
          columns,
          rowCount: totalRows,
          fileSize: file.size,
          fileName: file.name,
        })
      } catch (err: any) {
        setError(err.message || 'Failed to load file preview')
      } finally {
        setIsLoading(false)
      }
    }

    loadPreview()
  }, [file, open])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const handleConfirm = () => {
    if (file) {
      onConfirm(file)
      onOpenChange(false)
    }
  }

  const handleCancel = () => {
    onCancel()
    onOpenChange(false)
  }

  const showWarning = previewData && (previewData.rowCount > 10000 || previewData.fileSize > 5 * 1024 * 1024)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>File Preview</DialogTitle>
          <DialogDescription>
            Review file details before uploading
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="py-8 text-center text-muted-foreground">
            Loading preview...
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {previewData && !error && (
          <div className="space-y-4">
            {/* File Info */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <div className="text-sm text-muted-foreground">File Name</div>
                <div className="font-medium">{previewData.fileName}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">File Size</div>
                <div className="font-medium">{formatFileSize(previewData.fileSize)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Rows</div>
                <div className="font-medium">{previewData.rowCount.toLocaleString()}</div>
              </div>
            </div>

            {/* Warnings */}
            {showWarning && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {previewData.rowCount > 10000 && (
                    <div>Large file detected ({previewData.rowCount.toLocaleString()} rows). Processing may take longer.</div>
                  )}
                  {previewData.fileSize > 5 * 1024 * 1024 && (
                    <div>Large file size ({formatFileSize(previewData.fileSize)}). Upload may take time.</div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Column Types */}
            <div>
              <h3 className="font-semibold mb-2">Detected Columns ({previewData.columns.length})</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {previewData.columns.map((col, idx) => (
                  <div key={idx} className="p-2 bg-muted rounded text-sm">
                    <div className="font-medium">{col.name}</div>
                    <div className="text-xs text-muted-foreground">{col.type}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Data Preview */}
            <div>
              <h3 className="font-semibold mb-2">First 10 Rows Preview</h3>
              <div className="border rounded-lg overflow-auto max-h-[300px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      {previewData.columns.map((col, idx) => (
                        <th key={idx} className="px-3 py-2 text-left font-medium">
                          {col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-t">
                        {previewData.columns.map((col, colIdx) => (
                          <td key={colIdx} className="px-3 py-2">
                            {String(row[col.name] || '').substring(0, 50)}
                            {String(row[col.name] || '').length > 50 ? '...' : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleConfirm}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm Upload
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
