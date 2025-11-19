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
        "gradient-primary min-w-[120px] neumorphic-button",
        "hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary/50",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
      )}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Running...
        </>
      ) : (
        <>
          <Play className="mr-2 h-4 w-4" />
          Run Query
        </>
      )}
    </Button>
  )
}

