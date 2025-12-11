'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Share2, Link, Copy, Check, FileText } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import type { QueryResponse } from '@/types'

interface ShareButtonProps {
  response: QueryResponse | null
  query?: string
  chatId?: string
}

export function ShareButton({ response, query, chatId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const generateShareableLink = () => {
    if (!response || !chatId) {
      return null
    }

    // Create a shareable link with query and chat ID
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const shareData = {
      chatId,
      query: query || '',
      timestamp: Date.now(),
    }
    const encoded = btoa(JSON.stringify(shareData))
    return `${baseUrl}/share/${encoded}`
  }

  const copyShareableLink = async () => {
    const link = generateShareableLink()
    if (!link) {
      toast({
        title: 'Cannot share',
        description: 'No query results available to share.',
        variant: 'destructive',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast({
        title: 'Link copied',
        description: 'Shareable link copied to clipboard.',
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy link to clipboard.',
        variant: 'destructive',
      })
    }
  }

  const copyQueryResults = async () => {
    if (!response || !response.data || response.data.length === 0) {
      toast({
        title: 'No data to copy',
        description: 'No query results available.',
        variant: 'destructive',
      })
      return
    }

    try {
      // Convert data to CSV format
      const headers = response.columns.map(col => col.name).join(',')
      const rows = response.data.map(row =>
        response.columns.map(col => {
          const value = row[col.name]
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value ?? ''
        }).join(',')
      )
      const csv = [headers, ...rows].join('\n')
      
      await navigator.clipboard.writeText(csv)
      toast({
        title: 'Data copied',
        description: 'Query results copied to clipboard as CSV.',
      })
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy data to clipboard.',
        variant: 'destructive',
      })
    }
  }

  const shareAsPDF = () => {
    // Trigger the export full report functionality
    const exportButton = document.querySelector('[data-export-trigger]') as HTMLElement
    if (exportButton) {
      exportButton.click()
    } else {
      toast({
        title: 'Export available',
        description: 'Use the Export button to generate a shareable PDF report.',
      })
    }
  }

  if (!response || !response.data || response.data.length === 0) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={copyShareableLink}>
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Link Copied!
            </>
          ) : (
            <>
              <Link className="h-4 w-4 mr-2" />
              Copy Shareable Link
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyQueryResults}>
          <Copy className="h-4 w-4 mr-2" />
          Copy Results (CSV)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={shareAsPDF}>
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
