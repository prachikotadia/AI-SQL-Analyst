'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, Zap, Code, TrendingUp } from 'lucide-react'

interface PerformanceMetricsProps {
  executionTimeMs?: number
  tokenUsage?: number
  queryComplexity?: number
  sqlLength?: number
}

export function PerformanceMetrics({
  executionTimeMs,
  tokenUsage,
  queryComplexity,
  sqlLength,
}: PerformanceMetricsProps) {
  if (!executionTimeMs && !tokenUsage && !queryComplexity && !sqlLength) {
    return null
  }

  const getComplexityLabel = (complexity?: number) => {
    if (!complexity) return 'N/A'
    if (complexity < 3) return 'Simple'
    if (complexity < 6) return 'Moderate'
    if (complexity < 10) return 'Complex'
    return 'Very Complex'
  }

  const getComplexityColor = (complexity?: number) => {
    if (!complexity) return 'text-muted-foreground'
    if (complexity < 3) return 'text-green-600 dark:text-green-400'
    if (complexity < 6) return 'text-blue-600 dark:text-blue-400'
    if (complexity < 10) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <Card className="neumorphic-card">
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
          Performance Metrics
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">Query execution statistics</CardDescription>
      </CardHeader>
      <CardContent className="p-3 sm:p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          {executionTimeMs !== undefined && (
            <div className="p-2 sm:p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground mb-1">
                <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Execution Time</span>
                <span className="sm:hidden">Time</span>
              </div>
              <div className="text-lg sm:text-2xl font-bold">
                {executionTimeMs < 1000
                  ? `${executionTimeMs.toFixed(0)}ms`
                  : `${(executionTimeMs / 1000).toFixed(2)}s`}
              </div>
            </div>
          )}

          {tokenUsage !== undefined && (
            <div className="p-2 sm:p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground mb-1">
                <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Tokens Used</span>
                <span className="sm:hidden">Tokens</span>
              </div>
              <div className="text-lg sm:text-2xl font-bold">{tokenUsage.toLocaleString()}</div>
            </div>
          )}

          {queryComplexity !== undefined && (
            <div className="p-2 sm:p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground mb-1">
                <Code className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Complexity
              </div>
              <div className={`text-lg sm:text-2xl font-bold ${getComplexityColor(queryComplexity)}`}>
                {getComplexityLabel(queryComplexity)}
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                Score: {queryComplexity}/10
              </div>
            </div>
          )}

          {sqlLength !== undefined && (
            <div className="p-2 sm:p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground mb-1">
                <Code className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">SQL Length</span>
                <span className="sm:hidden">Length</span>
              </div>
              <div className="text-lg sm:text-2xl font-bold">{sqlLength} chars</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
