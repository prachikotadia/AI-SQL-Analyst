'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, Check, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SqlPanelProps {
  sql?: string // Legacy field
  preview_sql?: string | null
  action_sql?: string | null
}

export function SqlPanel({ sql, preview_sql, action_sql }: SqlPanelProps) {
  const [copiedPreview, setCopiedPreview] = useState(false)
  const [copiedAction, setCopiedAction] = useState(false)

  // Backward compatibility: use sql if preview_sql not provided
  const previewSql = preview_sql || sql || ''
  const hasAction = !!action_sql

  const handleCopyPreview = async () => {
    try {
      await navigator.clipboard.writeText(previewSql)
      setCopiedPreview(true)
      setTimeout(() => setCopiedPreview(false), 1500)
    } catch (err) {
      // Failed to copy, user can try again
    }
  }

  const handleCopyAction = async () => {
    if (action_sql) {
      try {
        await navigator.clipboard.writeText(action_sql)
        setCopiedAction(true)
        setTimeout(() => setCopiedAction(false), 1500)
      } catch (err) {
        // Failed to copy, user can try again
      }
    }
  }

  return (
    <div className="space-y-3 sm:space-y-4 animate-in fade-in-50 duration-300">
      {/* Preview SQL */}
      <Card className="neumorphic-card relative">
        <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
            <CardTitle className="text-base sm:text-lg">Preview SQL</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyPreview}
              className={cn(
                "neumorphic-button relative transition-all duration-200 min-h-[44px] text-xs sm:text-sm",
                "hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary/50",
                copiedPreview && "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700"
              )}
              aria-label="Copy SQL to clipboard"
            >
              {copiedPreview ? (
                <>
                  <Check className="mr-1 sm:mr-2 h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-green-600 dark:text-green-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="mr-1 sm:mr-2 h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          <pre className="neumorphic-input p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm font-mono">
            <code className="text-foreground break-words whitespace-pre-wrap">{previewSql || 'No preview SQL'}</code>
          </pre>
        </CardContent>
      </Card>

      {/* Action SQL (if present) */}
      {hasAction && (
        <Card className="neumorphic-card border-orange-200 dark:border-orange-800 relative">
          <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 sm:h-4 sm:w-4 text-orange-600 dark:text-orange-400" />
                <CardTitle className="text-base sm:text-lg text-orange-600 dark:text-orange-400">
                  <span className="hidden sm:inline">Action SQL (Not Executed)</span>
                  <span className="sm:hidden">Action SQL</span>
                </CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAction}
                className={cn(
                  "neumorphic-button relative transition-all duration-200 min-h-[44px] text-xs sm:text-sm",
                  "hover:scale-105 focus-visible:ring-2 focus-visible:ring-orange-500/50",
                  copiedAction && "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700"
                )}
                aria-label="Copy Action SQL to clipboard"
              >
                {copiedAction ? (
                  <>
                    <Check className="mr-1 sm:mr-2 h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-green-600 dark:text-green-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 sm:mr-2 h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            <div className="mb-3 p-2 sm:p-3 bg-orange-50 dark:bg-orange-950/50 rounded-lg text-xs sm:text-sm text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-800">
              ⚠️ This SQL will modify data. Review carefully before executing.
            </div>
            <pre className="neumorphic-input p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm font-mono">
              <code className="text-foreground break-words whitespace-pre-wrap">{action_sql}</code>
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

