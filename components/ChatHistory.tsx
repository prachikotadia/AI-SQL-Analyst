'use client'

import { useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageSquare, User, Bot, Plus } from 'lucide-react'
import { ResultsPanel } from './ResultsPanel'
import type { ChatMessage } from '@/lib/data/chatStore'
import type { QueryResponse } from '@/types'

interface ChatHistoryProps {
  messages: ChatMessage[]
  isLoading?: boolean
  currentResponse?: QueryResponse | null
  currentQuery?: string
  chatId?: string
}

export function ChatHistory({ messages, isLoading, currentResponse, currentQuery, chatId }: ChatHistoryProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isUserScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-scroll to bottom when new messages arrive (only if user isn't manually scrolling)
  useEffect(() => {
    if (!isUserScrollingRef.current) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [messages, currentResponse, isLoading])

  // Track user scrolling
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      isUserScrollingRef.current = true
      
      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      
      // Reset flag after user stops scrolling for 2 seconds
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false
      }, 2000)
    }

    container.addEventListener('scroll', handleScroll)
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  // Show loading indicator if there's a current response being processed
  const displayMessages = [...messages]
  if (isLoading && currentResponse) {
    // Don't add duplicate loading message
  } else if (isLoading) {
    displayMessages.push({
      id: 'loading',
      timestamp: new Date(),
      queryText: '',
      summary: 'Loading...',
      response: null as any,
    })
  }

  if (displayMessages.length === 0 && !isLoading && !currentResponse) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
        <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">No queries yet. Ask your first question!</p>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className="space-y-4 h-full overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar"
      style={{
        scrollBehavior: 'smooth',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {displayMessages.map((message, index) => (
        <div key={message.id || index} className="space-y-2 sm:space-y-3">
          {/* User Query */}
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary flex items-center justify-center">
              <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary-foreground" />
            </div>
            <Card className="flex-1 bg-primary/5 border-primary/20">
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs sm:text-sm font-medium whitespace-pre-wrap break-words">{message.queryText}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">
                  {new Date(message.timestamp).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Assistant Response */}
          {message.response && (
            <div className="flex items-start gap-2 sm:gap-3 ml-9 sm:ml-11">
              <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <ResultsPanel response={message.response} isLoading={false} query={message.queryText} chatId={chatId} />
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {message.id === 'loading' && (
            <div className="flex items-start gap-3 ml-11">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Bot className="h-4 w-4 text-muted-foreground animate-pulse" />
              </div>
              <Card className="flex-1">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <p className="text-sm text-muted-foreground">Processing your query...</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      ))}

      {/* Show current response if it's not in messages yet */}
      {currentResponse && !isLoading && !messages.some(m => 
        m.response && JSON.stringify(m.response) === JSON.stringify(currentResponse)
      ) && (
        <div className="flex items-start gap-3 ml-11">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <Bot className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <ResultsPanel response={currentResponse} isLoading={false} query={currentQuery} chatId={chatId} />
          </div>
        </div>
      )}

      {/* Loading indicator for current query */}
      {isLoading && !currentResponse && (
        <div className="flex items-start gap-3 ml-11">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <Bot className="h-4 w-4 text-muted-foreground animate-pulse" />
          </div>
          <Card className="flex-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">Processing your query...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}
