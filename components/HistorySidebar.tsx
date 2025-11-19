'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Moon, Sun, Database, LogOut } from 'lucide-react'
import type { QueryHistoryItem, ChatInfo } from '@/types'
import type { ChatMessage } from '@/lib/data/chatStore'
import { MessageSquare, Plus } from 'lucide-react'

interface HistorySidebarProps {
  history: QueryHistoryItem[]
  onQueryClick: (query: string) => void
  theme: 'light' | 'dark'
  onThemeToggle: () => void
  onLogout?: () => void
  chats?: ChatInfo[]
  currentChatId?: string | null
  onChatClick?: (chatId: string) => void
  onNewChat?: () => void
  chatMessages?: ChatMessage[]
  onMessageClick?: (message: ChatMessage) => void
}

const EXAMPLE_QUERIES = [
  'Show all cities in California',
  'How many cities are in each state?',
  'Which cities have longitude greater than 100° W?',
  'Show top 10 cities with the highest latitude values',
  'List all cities in Texas',
  'Count total number of cities',
]

export function HistorySidebar({ 
  history, 
  onQueryClick, 
  theme, 
  onThemeToggle, 
  onLogout,
  chats = [],
  currentChatId,
  onChatClick,
  onNewChat,
  chatMessages = [],
  onMessageClick,
}: HistorySidebarProps) {
  return (
    <div className="w-80 border-r bg-gradient-to-b from-background to-muted/30 p-4 space-y-6 h-screen overflow-y-auto backdrop-blur-sm">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Database className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">AI SQL Analyst</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Ask questions in English. Get SQL, charts, and answers.
        </p>
        <div className="space-y-2">
          {onNewChat && (
            <Button
              variant="outline"
              size="sm"
              onClick={onNewChat}
              className="w-full neumorphic-button"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Chat
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onThemeToggle}
            className="w-full"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="mr-2 h-4 w-4" />
                Light Mode
              </>
            ) : (
              <>
                <Moon className="mr-2 h-4 w-4" />
                Dark Mode
              </>
            )}
          </Button>
          {onLogout && (
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className="w-full text-destructive hover:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          )}
        </div>
      </div>

      {chats.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Chats</h2>
          <div className="space-y-1">
            {chats.map((chat) => (
              <button
                key={chat.chatId}
                onClick={() => onChatClick?.(chat.chatId)}
                className={`
                  w-full text-left text-xs p-2 rounded-md transition-all duration-200 
                  hover:scale-[1.02] hover:shadow-sm
                  ${currentChatId === chat.chatId 
                    ? 'bg-primary/10 text-primary font-semibold border border-primary/20' 
                    : 'hover:bg-muted'
                  }
                `}
              >
                <div className="font-medium truncate">{chat.title}</div>
                <div className="text-muted-foreground text-[10px] mt-1">
                  {new Date(chat.updatedAt).toLocaleString()} • {chat.messageCount} messages
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {currentChatId && chatMessages.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Chat History</h2>
          <div className="space-y-2">
            {chatMessages.slice().reverse().map((message) => (
              <button
                key={message.id}
                onClick={() => onMessageClick?.(message)}
                className="w-full text-left text-xs p-2 rounded-md hover:bg-muted transition-all duration-200 hover:scale-[1.02] hover:shadow-sm"
              >
                <div className="font-medium truncate">{message.summary}</div>
                <div className="text-muted-foreground text-[10px] mt-1">
                  {new Date(message.timestamp).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground/70">Example Queries</h2>
        <div className="space-y-2">
          {EXAMPLE_QUERIES.map((query, idx) => (
            <button
              key={idx}
              onClick={() => onQueryClick(query)}
              className="w-full text-left text-xs p-2 rounded-md hover:bg-muted/50 transition-all duration-200 hover:scale-[1.02] hover:shadow-sm text-muted-foreground/70 hover:text-muted-foreground"
            >
              {query}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

