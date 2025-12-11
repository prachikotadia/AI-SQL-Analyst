'use client'

import { Button } from '@/components/ui/button'
import { Play, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RunButtonProps {
  onClick: () => void
  isLoading: boolean
  disabled?: boolean
}

export function RunButton({ onClick, isLoading, disabled }: RunButtonProps) {
  return (
    <Button 
      type="submit" 
      onClick={onClick}
      disabled={isLoading || disabled}
      className={cn(
        "gradient-primary min-w-[100px] sm:min-w-[120px] neumorphic-button",
        "hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary/50",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
        "text-xs sm:text-sm min-h-[44px]"
      )}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-1 sm:mr-2 h-4 w-4 animate-spin" />
          <span className="hidden sm:inline">Running...</span>
          <span className="sm:hidden">Run...</span>
        </>
      ) : (
        <>
          <Play className="mr-1 sm:mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Run Query</span>
          <span className="sm:hidden">Run</span>
        </>
      )}
    </Button>
  )
}

