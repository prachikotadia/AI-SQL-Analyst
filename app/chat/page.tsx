'use client'

import { ChatInterface } from '@/components/ChatInterface'
import { LayoutShell } from '@/components/LayoutShell'
import { HistorySidebar } from '@/components/HistorySidebar'
import { useState, useEffect } from 'react'
import { getSession, isAuthenticated, loginDemo } from '@/lib/auth/session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

export default function ChatPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const { toast } = useToast()

  useEffect(() => {
    setAuthenticated(isAuthenticated())
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  const handleLogin = () => {
    loginDemo()
    setAuthenticated(true)
    toast({
      title: 'Welcome!',
      description: 'You are now in chat mode.',
    })
  }

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  if (!authenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome to Data Analyst Chat</CardTitle>
            <CardDescription>
              Upload your data and ask questions in natural language
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This is a demo application. Click below to enter demo mode and start analyzing your data.
              </p>
              <Button onClick={handleLogin} className="w-full" size="lg">
                Enter Demo Mode
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <LayoutShell
      sidebar={
        <HistorySidebar
          history={[]}
          onQueryClick={() => {}}
          theme={theme}
          onThemeToggle={toggleTheme}
        />
      }
    >
      <div className="h-screen flex flex-col">
        <ChatInterface className="flex-1" />
      </div>
    </LayoutShell>
  )
}

