'use client'

import { useState, useEffect, useRef } from 'react'
import { QUERY_TEMPLATES, getSuggestions, getRecentQueries, type QueryTemplate } from '@/lib/utils/querySuggestions'
import { Card } from '@/components/ui/card'
import { Sparkles, Clock, Lightbulb } from 'lucide-react'

interface QuerySuggestionsProps {
  input: string
  onSelect: (suggestion: string) => void
  onClose: () => void
  visible: boolean
}

export function QuerySuggestions({ input, onSelect, onClose, visible }: QuerySuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) {
      setSuggestions([])
      return
    }

    const newSuggestions = getSuggestions(input, QUERY_TEMPLATES)
    setSuggestions(newSuggestions)
    setSelectedIndex(0)
  }, [input, visible])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible || suggestions.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % suggestions.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length)
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault()
        onSelect(suggestions[selectedIndex])
      } else if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, suggestions, selectedIndex, onSelect, onClose])

  if (!visible || suggestions.length === 0) {
    return null
  }

  const recentQueries = getRecentQueries()
  const isRecentQuery = (suggestion: string) => recentQueries.includes(suggestion)
  const isTemplate = (suggestion: string) => QUERY_TEMPLATES.some(t => t.query === suggestion)

  return (
    <Card
      ref={containerRef}
      className="absolute z-50 w-full mt-1 max-h-64 overflow-y-auto shadow-lg border"
    >
      <div className="p-1.5 sm:p-2 space-y-1">
        {suggestions.map((suggestion, index) => {
          const isRecent = isRecentQuery(suggestion)
          const isTemplateItem = isTemplate(suggestion)
          
          return (
            <button
              key={`${suggestion}-${index}`}
              type="button"
              onClick={() => onSelect(suggestion)}
              className={`w-full text-left px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm transition-colors min-h-[44px] ${
                index === selectedIndex
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                {isTemplateItem ? (
                  <Lightbulb className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500 flex-shrink-0" />
                ) : isRecent ? (
                  <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500 flex-shrink-0" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="flex-1 break-words">{suggestion}</span>
                {isTemplateItem && (
                  <span className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0">Template</span>
                )}
                {isRecent && (
                  <span className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0">Recent</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
