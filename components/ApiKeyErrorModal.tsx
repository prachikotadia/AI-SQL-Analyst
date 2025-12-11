'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertCircle, Key, ExternalLink } from 'lucide-react'

interface ApiKeyErrorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ApiKeyErrorModal({ open, onOpenChange }: ApiKeyErrorModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Key className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <DialogTitle className="text-2xl">Oops! Missing API Key</DialogTitle>
          </div>
          <DialogDescription className="text-base pt-2">
            Looks like your search engine is running on empty! 🚗💨
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-1">
                Sorry, you need to add your API keys for searches to work!
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Without the keys, I&apos;m like a detective without a magnifying glass 🔍 — I can see the questions, but I can&apos;t solve the mysteries!
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Here&apos;s how to fix it:</p>
            <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
              <li>Go to your Netlify dashboard</li>
              <li>Navigate to <strong>Site settings</strong> → <strong>Environment variables</strong></li>
              <li>Add your <code className="px-1.5 py-0.5 bg-muted rounded text-xs">OPENAI_API_KEY</code></li>
              <li>Redeploy your site</li>
            </ol>
          </div>

          <div className="pt-2">
            <Button
              onClick={() => {
                window.open('https://app.netlify.com', '_blank')
              }}
              className="w-full"
              variant="default"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Netlify Dashboard
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
