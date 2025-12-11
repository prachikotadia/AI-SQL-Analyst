'use client'

import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, AlertCircle, FileText } from 'lucide-react'
import { Button } from './ui/button'

interface OutOfScopeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  message: string
}

export function OutOfScopeModal({ open, onOpenChange, message }: OutOfScopeModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-[95vw] sm:max-w-lg translate-x-[-50%] translate-y-[-50%] gap-3 sm:gap-4 border border-gray-200 bg-white p-4 sm:p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg dark:border-gray-800 dark:bg-gray-900 max-h-[90vh] overflow-y-auto">
          <div className="flex flex-col space-y-3 sm:space-y-4">
            <div className="flex items-start space-x-3 sm:space-x-4">
              <div className="flex-shrink-0">
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
                  <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <div className="flex-1 space-y-1.5 sm:space-y-2 min-w-0">
                <Dialog.Title className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Query Not Related to Uploaded Data
                </Dialog.Title>
                <Dialog.Description className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 break-words">
                  {message}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="absolute right-3 sm:right-4 top-3 sm:top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-gray-100 data-[state=open]:text-gray-500 dark:ring-offset-gray-950 dark:focus:ring-gray-300 dark:data-[state=open]:bg-gray-800 dark:data-[state=open]:text-gray-400 min-w-[32px] min-h-[32px] flex items-center justify-center">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </button>
              </Dialog.Close>
            </div>
            
            <div className="rounded-lg bg-blue-50 p-3 sm:p-4 dark:bg-blue-900/20">
              <div className="flex items-start space-x-2 sm:space-x-3">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                    What you can ask:
                  </p>
                  <ul className="text-xs sm:text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                    <li>Questions about data in your uploaded CSV/Excel files</li>
                    <li>Analysis of columns and values in your data</li>
                    <li>Aggregations, filters, and sorting of your data</li>
                    <li>Charts and visualizations of your data</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button
                onClick={() => onOpenChange(false)}
                className="bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 min-h-[44px] text-xs sm:text-sm w-full sm:w-auto"
              >
                Got it
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
