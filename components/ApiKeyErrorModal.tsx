'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertCircle, Key } from 'lucide-react'

interface ApiKeyErrorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ApiKeyErrorModal({ open, onOpenChange }: ApiKeyErrorModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Key className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <DialogTitle className="text-xl sm:text-2xl">Oops! Missing API Key</DialogTitle>
          </div>
          <DialogDescription className="text-sm sm:text-base pt-2">
            Looks like your search engine is running on empty! 🚗💨
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 sm:space-y-4 py-2 sm:py-4">
          <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5 sm:space-y-2">
              <p className="text-xs sm:text-sm font-medium text-amber-900 dark:text-amber-100">
                Sorry, you need to add your API keys for searches to work!
              </p>
              <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-300">
                Without the keys, I&apos;m like a detective without a magnifying glass 🔍, I can see the questions, but I can&apos;t solve the mysteries!
              </p>
              <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-300 pt-1 sm:pt-2">
                It&apos;s like trying to make coffee without beans ☕ the machine is ready, but there&apos;s nothing to brew! Or like a chef without ingredients 🧑‍🍳. I have all the recipes, but no way to cook them up!
              </p>
              <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-300">
                Think of me as a superhero 🦸 who lost their superpowers, I&apos;m here, I&apos;m ready, but I need that special key to unlock my full potential!
              </p>
            </div>
          </div>

          <div className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs sm:text-sm font-medium text-blue-900 dark:text-blue-100 mb-1 sm:mb-2">
              💡 Quick Fix:
            </p>
            <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300">
              Just add your <code className="px-1 sm:px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 rounded text-[10px] sm:text-xs font-mono break-all">OPENAI_API_KEY</code> to your environment variables, and we&apos;ll be back in business! 🚀
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
