'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Command, Search, FileText, TrendingUp, BarChart3, Filter, Bookmark, History } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CommandItem {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  action: () => void
  keywords: string[]
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRunQuery?: (query: string) => void
  onSelectTemplate?: (template: string) => void
  recentQueries?: string[]
  bookmarkedQueries?: Array<{ id: string; query: string; category?: string }>
}

export function CommandPalette({
  open,
  onOpenChange,
  onRunQuery,
  onSelectTemplate,
  recentQueries = [],
  bookmarkedQueries = [],
}: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const templates: CommandItem[] = [
    {
      id: 'top-n',
      title: 'Top N by X',
      description: 'Find top N items by a specific column',
      icon: <TrendingUp className="h-4 w-4" />,
      action: () => {
        onSelectTemplate?.('Show me the top 10 items by price')
        onOpenChange(false)
      },
      keywords: ['top', 'highest', 'best', 'maximum'],
    },
    {
      id: 'trends',
      title: 'Trends over time',
      description: 'Analyze trends and patterns over time',
      icon: <BarChart3 className="h-4 w-4" />,
      action: () => {
        onSelectTemplate?.('Show trends over time')
        onOpenChange(false)
      },
      keywords: ['trend', 'time', 'over time', 'temporal'],
    },
    {
      id: 'compare',
      title: 'Compare categories',
      description: 'Compare data across different categories',
      icon: <Filter className="h-4 w-4" />,
      action: () => {
        onSelectTemplate?.('Compare categories')
        onOpenChange(false)
      },
      keywords: ['compare', 'category', 'group', 'by'],
    },
  ]

  const commands: CommandItem[] = [
    ...templates,
    ...recentQueries.slice(0, 5).map((query, idx) => ({
      id: `recent-${idx}`,
      title: query.length > 50 ? query.substring(0, 50) + '...' : query,
      description: 'Recent query',
      icon: <History className="h-4 w-4" />,
      action: () => {
        onRunQuery?.(query)
        onOpenChange(false)
      },
      keywords: [query.toLowerCase()],
    })),
    ...bookmarkedQueries.map((bookmark) => ({
      id: `bookmark-${bookmark.id}`,
      title: bookmark.query.length > 50 ? bookmark.query.substring(0, 50) + '...' : bookmark.query,
      description: bookmark.category ? `Bookmark - ${bookmark.category}` : 'Bookmarked query',
      icon: <Bookmark className="h-4 w-4" />,
      action: () => {
        onRunQuery?.(bookmark.query)
        onOpenChange(false)
      },
      keywords: [bookmark.query.toLowerCase(), bookmark.category?.toLowerCase() || ''],
    })),
  ]

  const filteredCommands = commands.filter((cmd) => {
    if (!search.trim()) return true
    const searchLower = search.toLowerCase()
    return (
      cmd.title.toLowerCase().includes(searchLower) ||
      cmd.description.toLowerCase().includes(searchLower) ||
      cmd.keywords.some((kw) => kw.includes(searchLower))
    )
  })

  useEffect(() => {
    if (open) {
      setSearch('')
      setSelectedIndex(0)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
        e.preventDefault()
        filteredCommands[selectedIndex].action()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, selectedIndex, filteredCommands])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Command className="h-4 w-4 sm:h-5 sm:w-5" />
            Command Palette
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Search for templates, recent queries, or bookmarks
          </DialogDescription>
        </DialogHeader>
        <div className="px-4 sm:px-6 pb-3 sm:pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelectedIndex(0)
              }}
              placeholder="Type to search..."
              className="pl-9 min-h-[44px] text-xs sm:text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[50vh] sm:max-h-[400px] overflow-y-auto px-4 sm:px-6 pb-4 sm:pb-6">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs sm:text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            <div className="space-y-1">
              {filteredCommands.map((cmd, idx) => (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  className={cn(
                    'w-full flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg text-left transition-colors min-h-[44px]',
                    'hover:bg-accent focus:bg-accent focus:outline-none',
                    idx === selectedIndex && 'bg-accent'
                  )}
                >
                  <div className="mt-0.5 text-muted-foreground flex-shrink-0">{cmd.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-xs sm:text-sm break-words">{cmd.title}</div>
                    <div className="text-[10px] sm:text-sm text-muted-foreground break-words">{cmd.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-3 sm:pt-4 border-t text-[10px] sm:text-xs text-muted-foreground">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-0">
            <span>↑↓ Navigate</span>
            <span>Enter Select</span>
            <span>Esc Close</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
